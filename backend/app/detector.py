import os
from PIL import Image
from ultralytics import YOLO

# Load the model from the parent directory (backend root)
YOLO_MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models",
    "yolo_segment.pt"
)
model = YOLO(YOLO_MODEL_PATH)

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
    return [
        min(box1[0], box2[0]), min(box1[1], box2[1]),
        max(box1[2], box2[2]), max(box1[3], box2[3])
    ]

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
                    }
                    items.pop(i)
                    items.append(combined)
                    merged = True
                    break
            if not merged:
                final.append(cur)
    return final

def get_detections(img: Image.Image, conf=0.35, device="cpu") -> list[dict]:
    results = model(img, conf=conf, device=device, verbose=False)
    raw_detections = []
    
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
            
        for box in boxes:
            class_id = int(box.cls[0].item())
            class_name = model.names[class_id].lower()
                
            x1, y1, x2, y2 = box.xyxyn[0].tolist()
            raw_detections.append({
                'raw_box': [x1, y1, x2, y2],
                'bbox': {'x': x1, 'y': y1, 'w': x2-x1, 'h': y2-y1},
                'category': class_name
            })
            
    return consolidate_detections(raw_detections)