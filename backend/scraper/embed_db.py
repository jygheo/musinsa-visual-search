import os
import json
import queue
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import requests
import torch
import torch.nn.functional as F
import torchvision.transforms as transforms
from PIL import Image
import cv2
import gdown
from psycopg2.extras import DictCursor
from ultralytics import YOLO
from transformers import CLIPModel, CLIPProcessor

# Assuming these are available in your local environment
from swiftshadow.classes import ProxyInterface
from app.db import get_db_connection
from app.constants import USER_AGENTS
from scraper.network import U2NET


def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif torch.backends.mps.is_available():
        return torch.device("mps")
    else:
        return torch.device("cpu")


DEVICE = get_device()
print(f"Using device: {DEVICE}")

CLIP_MODEL_ID = "patrickjohncyh/fashion-clip"
clip_model = CLIPModel.from_pretrained(CLIP_MODEL_ID).to(DEVICE)
clip_model.eval()
clip_processor = CLIPProcessor.from_pretrained(CLIP_MODEL_ID)

YOLO_MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models",
    "yolo_segment.pt"
)
print(f"Loading YOLO model from: {YOLO_MODEL_PATH}")
yolo_model = YOLO(YOLO_MODEL_PATH)

SCRAPER_TO_MODEL_MAP = {
    "001": ["top"],
    "002": ["outerwear"],
    "003": ["pants"],
    "100": ["dress", "skirt"],   # if scraper code represents both
    "004": ["bag"],
    "103": ["footwear"],
    "120": ["headwear"],
    "101": ["accessory"],
}

class Normalize_image(object):
    def __init__(self, mean, std):
        self.mean, self.std = mean, std
        self.n1 = transforms.Normalize([mean], [std])
        self.n3 = transforms.Normalize([mean]*3, [std]*3)
        self.n18 = transforms.Normalize([mean]*18, [std]*18)

    def __call__(self, tensor):
        if tensor.shape[0] == 1:
            return self.n1(tensor)
        if tensor.shape[0] == 3:
            return self.n3(tensor)
        if tensor.shape[0] == 18:
            return self.n18(tensor)
        raise ValueError(f"Channel size {tensor.shape[0]} not supported.")


def apply_transform(img):
    return transforms.Compose([transforms.ToTensor(), Normalize_image(0.5, 0.5)])(img)


CHECKPOINT_URL = "https://drive.google.com/uc?id=11xTBALOeUkyuaK3l60CpkYHLTmv7k3dY"
CHECKPOINT_PATH = "models/cloth_segm.pth"


def download_model():
    if not os.path.exists(CHECKPOINT_PATH):
        os.makedirs(os.path.dirname(CHECKPOINT_PATH), exist_ok=True)
        print("Downloading U²-Net checkpoint...")
        gdown.download(CHECKPOINT_URL, CHECKPOINT_PATH, quiet=False)


def load_u2net(device):
    download_model()
    model = U2NET(in_ch=3, out_ch=4)
    state = torch.load(CHECKPOINT_PATH, map_location='cpu')
    new_state = {}
    for k, v in state.items():
        name = k[7:] if k.startswith('module.') else k
        new_state[name] = v
    model.load_state_dict(new_state)
    model.to(device)
    model.eval()

    # OPTIMIZATION: Ensure MPS also runs in FP16 to halve memory
    if device.type in ['cuda', 'mps']:
        model.half()

    return model


u2net = load_u2net(DEVICE)


def calculate_iou(box1, box2):
    x1_inter, y1_inter = max(box1[0], box2[0]), max(box1[1], box2[1])
    x2_inter, y2_inter = min(box1[2], box2[2]), min(box1[3], box2[3])
    if x2_inter < x1_inter or y2_inter < y1_inter:
        return 0.0
    inter = (x2_inter - x1_inter) * (y2_inter - y1_inter)
    area1 = (box1[2]-box1[0]) * (box1[3]-box1[1])
    area2 = (box2[2]-box2[0]) * (box2[3]-box2[1])
    return inter / (area1 + area2 - inter) if (area1+area2-inter) > 0 else 0


def merge_boxes(box1, box2):
    return [min(box1[0], box2[0]), min(box1[1], box2[1]),
            max(box1[2], box2[2]), max(box1[3], box2[3])]


def consolidate_detections(detections, iou_threshold=0.15, distance_threshold=0.3):
    grouped = {}
    for det in detections:
        grouped.setdefault(det['category'], []).append(det)
    final = []
    for cat, items in grouped.items():
        while items:
            cur = items.pop(0)
            cb = cur['raw_box']
            merged = False
            for i, other in enumerate(items):
                ob = other['raw_box']
                x_dist = max(0, max(cb[0], ob[0]) - min(cb[2], ob[2]))
                y_dist = max(0, max(cb[1], ob[1]) - min(cb[3], ob[3]))
                if calculate_iou(cb, ob) > iou_threshold or (x_dist < distance_threshold and y_dist < distance_threshold):
                    nb = merge_boxes(cb, ob)
                    combined = {
                        'raw_box': nb,
                        'bbox': {'x': nb[0], 'y': nb[1], 'w': nb[2]-nb[0], 'h': nb[3]-nb[1]},
                        'category': cat,
                        'is_primary': cur['is_primary'] or other['is_primary'],
                        'polygon': cur.get('polygon', []) + other.get('polygon', [])
                    }
                    items.pop(i)
                    items.append(combined)
                    merged = True
                    break
            if not merged:
                final.append(cur)

    primaries = [d for d in final if d['is_primary']]
    if len(primaries) > 1:
        largest = max(primaries, key=lambda d: d['bbox']['w']*d['bbox']['h'])
        for d in primaries:
            if d != largest:
                d['is_primary'] = False
    return final


def extract_polygons(mask, img_w, img_h):
    polygons = []
    for cls in [1, 2, 3]:
        binary = (mask == cls).astype(np.uint8)
        if binary.sum() == 0:
            continue
        contours, _ = cv2.findContours(
            binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            if len(cnt) < 3:
                continue
            epsilon = 0.002 * cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, epsilon, True)
            norm_poly = [(pt[0][0] / img_w, pt[0][1] / img_h) for pt in approx]
            polygons.append({'points': norm_poly, 'class': cls})
    return polygons


def polygon_bbox(norm_poly):
    xs = [p[0] for p in norm_poly]
    ys = [p[1] for p in norm_poly]
    return [min(xs), min(ys), max(xs), max(ys)]


def select_primary_polygons(polygons, primary_yolo_box, iou_thresh=0.15):
    if primary_yolo_box is not None:
        chosen = []
        for poly in polygons:
            pb = polygon_bbox(poly['points'])
            if calculate_iou(pb, primary_yolo_box) >= iou_thresh:
                chosen.append(poly)
        return chosen
    else:
        if not polygons:
            return []
        largest = max(polygons, key=lambda p: cv2.contourArea(
            np.array([[int(x*1000), int(y*1000)] for x, y in p['points']], dtype=np.int32)))
        return [largest]


def post_process_single(product, img, yolo_result, u2net_mask):
    """CPU-bound post processing extracted from GPU inference loop."""
    width, height = img.size
    scraped_code = product.get('category_code', '002')
    target_yolo_classes = SCRAPER_TO_MODEL_MAP.get(str(scraped_code), [])

    boxes = yolo_result.boxes
    masks = yolo_result.masks
    raw_detections = []

    if boxes is not None:
        for i, box in enumerate(boxes):
            class_id = int(box.cls[0].item())
            class_name = yolo_model.names[class_id].lower()
            if class_name in ['person', 'background']:
                continue

            x1, y1, x2, y2 = box.xyxyn[0].tolist()
            polygon = []
            if masks is not None and len(masks.xyn) > i:
                raw_poly = masks.xyn[i]
                step = max(1, len(raw_poly) // 20)
                polygon = raw_poly[::step].tolist()

            is_primary = class_name in target_yolo_classes
            raw_detections.append({
                'raw_box': [x1, y1, x2, y2],
                'bbox': {'x': x1, 'y': y1, 'w': x2-x1, 'h': y2-y1},
                'polygon': polygon,
                'category': class_name,
                'is_primary': is_primary
            })

    detections = consolidate_detections(raw_detections)

    if detections and not any(d['is_primary'] for d in detections):
        largest = max(detections, key=lambda d: d['bbox']['w']*d['bbox']['h'])
        largest['is_primary'] = True
    if not detections:
        detections.append({
            'raw_box': [0.0, 0.0, 1.0, 1.0],
            'bbox': {'x': 0, 'y': 0, 'w': 1, 'h': 1},
            'polygon': [],
            'category': 'unknown',
            'is_primary': True
        })

    primary_det = next((d for d in detections if d['is_primary']), None)
    primary_yolo_box = primary_det['raw_box'] if primary_det else None

    all_polygons = extract_polygons(u2net_mask, width, height)
    primary_polys = select_primary_polygons(all_polygons, primary_yolo_box)

    if primary_yolo_box is not None and primary_polys:
        xs = [pt[0] for poly in primary_polys for pt in poly['points']]
        ys = [pt[1] for poly in primary_polys for pt in poly['points']]
        union_box = [min(xs), min(ys), max(xs), max(ys)]
        area_yolo = (primary_yolo_box[2] - primary_yolo_box[0]) * \
            (primary_yolo_box[3] - primary_yolo_box[1])
        area_union = (union_box[2] - union_box[0]) * \
            (union_box[3] - union_box[1])
        area_ratio = area_union / area_yolo if area_yolo > 0 else float('inf')
        x_overlap_left = max(0, primary_yolo_box[0] - union_box[0])
        x_overlap_right = max(0, union_box[2] - primary_yolo_box[2])
        y_overlap_top = max(0, primary_yolo_box[1] - union_box[1])
        y_overlap_bottom = max(0, union_box[3] - primary_yolo_box[3])
        max_extension = max(x_overlap_left, x_overlap_right,
                            y_overlap_top, y_overlap_bottom)

        if area_ratio > 1.5 or max_extension > 0.05:
            if primary_det:
                primary_det['raw_box'] = [0.0, 0.0, 1.0, 1.0]
                primary_det['bbox'] = {'x': 0.0, 'y': 0.0, 'w': 1.0, 'h': 1.0}
                primary_det['polygon'] = [p['points'] for p in primary_polys]

    if primary_det:
        b = primary_det['bbox']
        abs_x1 = max(0, int(b['x'] * width))
        abs_y1 = max(0, int(b['y'] * height))
        abs_x2 = min(width, int((b['x'] + b['w']) * width))
        abs_y2 = min(height, int((b['y'] + b['h']) * height))
        cropped = img.crop((abs_x1, abs_y1, abs_x2, abs_y2))
        return primary_det, cropped

    return None, None


def get_products_batch(batch_size=200, table="products", condition="id NOT IN (SELECT product_id FROM product_garments)"):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=DictCursor)
    cur.execute(
        f"SELECT id, image_url, category_code FROM {table} WHERE {condition} ORDER BY id")
    while True:
        batch = cur.fetchmany(batch_size)
        if not batch:
            break
        yield batch
    cur.close()
    conn.close()


def log_failure(conn, product_id, image_url, category_code, error_msg):
    with conn.cursor() as cur:
        try:
            cur.execute("""
                INSERT INTO failed_products (id, image_url, category_code, error)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET error = EXCLUDED.error, last_attempt = CURRENT_TIMESTAMP
            """, (product_id, image_url, category_code, str(error_msg)))
            conn.commit()
        except Exception as e:
            print(f"Failed to log error for id {product_id}: {e}")

def fetch_image(image_url, proxy_manager, retries=3):
    """Producer-side work only: downloading and downscaling heavy images."""
    for attempt in range(retries):
        proxy = proxy_manager.get()
        proxies = {proxy_manager.protocol: proxy} if proxy else None
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        try:
            response = requests.get(
                image_url, headers=headers, proxies=proxies, stream=True, timeout=10)
            if response.status_code in (403, 404):
                return None, f"Blocked: {response.status_code}"
            response.raise_for_status()

            img = Image.open(response.raw).convert("RGB")
            # OPTIMIZATION: Shrink giant images immediately to save CPU downstream
            if max(img.size) > 960:
                img.thumbnail((960, 960), Image.BICUBIC)

            return img, None
        except Exception:
            time.sleep(2 ** attempt + random.uniform(0, 1))
    return None, "All retries failed"

def run_consumer_loop(result_queue, conn, batch_size=16):
    """Main thread: YOLO and CLIP run in batches. U2Net runs sequentially to save MPS memory."""
    batch_buffer = []

    def flush_batch():
        if not batch_buffer:
            return

        valid_items = batch_buffer.copy()
        batch_buffer.clear()

        images = [img for _, img in valid_items]
        products = [p for p, _ in valid_items]

        yolo_results = yolo_model(images, conf=0.45, verbose=False)

        U2NET_SIZE = 512
        u2net_masks = []

        for img in images:
            img_resized = img.resize((U2NET_SIZE, U2NET_SIZE), Image.BICUBIC)
            tensor = apply_transform(img_resized).unsqueeze(0).to(DEVICE)

            if DEVICE.type in ['cuda', 'mps']:
                tensor = tensor.half()

            with torch.inference_mode():
                out = u2net(tensor)[0]
                out = F.log_softmax(out, dim=1)
                pred = torch.max(out, dim=1)[1]  # Shape: 1 x 512 x 512

                mask_tensor = pred.unsqueeze(0).float()
                mask_resized = F.interpolate(
                    mask_tensor, size=img.size[::-1], mode='nearest').squeeze().long()
                u2net_masks.append(mask_resized.cpu().numpy())

        final_dets = []
        crops = []
        db_products = []

        for i, (product, img) in enumerate(valid_items):
            det, cropped = post_process_single(
                product, img, yolo_results[i], u2net_masks[i])
            if det and cropped:
                final_dets.append(det)
                crops.append(cropped)
                db_products.append(product)
            else:
                log_failure(
                    conn, product['id'], product['image_url'], product.get('category_code'), "No valid detections found.")

        if crops:
            # batch clip
            inputs = clip_processor(
                images=crops, return_tensors="pt", padding=True)
            inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
            with torch.no_grad():
                image_features = clip_model.get_image_features(**inputs)
                if not torch.is_tensor(image_features):
                    image_features = image_features.pooler_output
                image_features = image_features / \
                    image_features.norm(p=2, dim=-1, keepdim=True)
                embeddings = image_features.cpu().numpy()

            # --- 5. BATCHED DB INSERT ---
            with conn.cursor() as cur:
                try:
                    for i, product in enumerate(db_products):
                        det = final_dets[i]
                        det['embedding'] = embeddings[i].tolist()
                        cur.execute("""
                            INSERT INTO product_garments (product_id, bbox, polygon, category, is_primary, embedding)
                            VALUES (%s, %s, %s, %s, %s, %s)
                        """, (
                            product['id'], json.dumps(
                                det['bbox']), json.dumps(det['polygon']),
                            det['category'], det['is_primary'], str(
                                det['embedding'])
                        ))
                        cur.execute(
                            "DELETE FROM failed_products WHERE id = %s", (product['id'],))
                    conn.commit()
                except Exception as e:
                    print(f"DB Insert failed for batch: {e}")
                    conn.rollback()

        # --- 6. EXPLICIT MEMORY CLEANUP (Crucial for MPS) ---
        if DEVICE.type == 'cuda':
            torch.cuda.empty_cache()
        elif DEVICE.type == 'mps':
            torch.mps.empty_cache()

    while True:
        item = result_queue.get()
        if item is None:
            flush_batch()
            break

        product, img, error = item
        if error:
            print(f"Failed {product['id']}: {error}")
            log_failure(conn, product['id'], product['image_url'], product.get(
                'category_code'), error)
            continue

        batch_buffer.append((product, img))
        if len(batch_buffer) >= batch_size:
            flush_batch()


def update_embeddings_pipeline(proxy_manager, table="products", condition="1=1", max_workers=6, batch_size=16):
    conn = get_db_connection()
    result_queue = queue.Queue(
        maxsize=(max_workers * batch_size))  # buffer generously

    def worker(product):
        img, error = fetch_image(product['image_url'], proxy_manager)
        result_queue.put((product, img, error))

    def submitter():
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for batch in get_products_batch(table=table, condition=condition):
                for p in batch:
                    executor.submit(worker, p)
        result_queue.put(None)

    threading.Thread(target=submitter).start()
    run_consumer_loop(result_queue, conn, batch_size=batch_size)
    conn.close()


if __name__ == "__main__":
    proxy_manager = ProxyInterface(
        countries=["US"], protocol="http", autoRotate=True)

    print("Starting Embedding Pipeline")
    update_embeddings_pipeline(
        proxy_manager=proxy_manager,
        table="products",
        condition="id NOT IN (SELECT product_id FROM product_garments)",
        max_workers=6,
        batch_size=64
    )
    print("Retrying Failed Products ")
    # TODO update the failed_products table to have category_code (currently empty so its good)
    update_embeddings_pipeline(
        proxy_manager=proxy_manager,
        table="failed_products",
        condition="1=1",
        max_workers=6,
        batch_size=64
    )
