import React, { useState, useRef, useEffect } from 'react';

// Helper to reliably convert DB polygon data to CSS clip-path
const getClipPathString = (polygon) => {
  if (!polygon) return 'none';
  try {
    const points = typeof polygon === 'string' ? JSON.parse(polygon) : polygon;
    if (!Array.isArray(points) || points.length === 0) return 'none';
    
    const percentagePoints = points.map(pt => `${(pt[0] * 100).toFixed(2)}% ${(pt[1] * 100).toFixed(2)}%`);
    return `polygon(${percentagePoints.join(', ')})`;
  } catch (e) {
    return 'none';
  }
};

export default function CanvasItem({ item, updateItem, onRemove }) {
  const [showPopover, setShowPopover] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const wrapperRef = useRef(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, itemX: 0, itemY: 0, time: 0 });

  // Close popover if clicked outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowPopover(false);
      }
    };
    if (showPopover) document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [showPopover]);

  const handlePointerDown = (e) => {
    if (e.button !== 0) return; // Only left click
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      itemX: item.canvas_x,
      itemY: item.canvas_y,
      time: Date.now()
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    
    updateItem(item.prod_num, {
      canvas_x: dragStart.current.itemX + dx,
      canvas_y: dragStart.current.itemY + dy
    });

    const trash = document.getElementById('canvas-trash-zone');
    if (trash) {
      const rect = trash.getBoundingClientRect();
      if (e.clientX > rect.left && e.clientX < rect.right && e.clientY > rect.top && e.clientY < rect.bottom) {
        trash.classList.add('trash-active');
      } else {
        trash.classList.remove('trash-active');
      }
    }
  };

  const handlePointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);

    // Calculate distance to distinguish between a drag and a click
    const dx = Math.abs(e.clientX - dragStart.current.x);
    const dy = Math.abs(e.clientY - dragStart.current.y);
    const timeElapsed = Date.now() - dragStart.current.time;

    // If movement is very small, it was a click!
    if (dx < 5 && dy < 5 && timeElapsed < 500) {
      setShowPopover(!showPopover);
    }

    // Handle dropping into the black hole
    const trash = document.getElementById('canvas-trash-zone');
    if (trash && trash.classList.contains('trash-active')) {
      trash.classList.remove('trash-active');
      setShowPopover(false);
      setIsDeleting(true);
      setTimeout(() => onRemove(item.prod_num), 400); 
    }
  };

  const miniBtn = {
    background: '#f4eee6',
    border: '1px solid #d1ccbf',
    borderRadius: '6px',
    fontSize: '12px',
    padding: '4px 8px',
    cursor: 'pointer',
    color: '#4a5d4e',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    transition: 'background 0.2s'
  };

  return (
    <div
      ref={wrapperRef}
      className={`cutout-${item.prod_num} canvas-item-wrapper ${isDeleting ? 'sucked-into-black-hole' : ''}`}
      style={{
        position: 'absolute',
        left: `${item.canvas_x}px`,
        top: `${item.canvas_y}px`,
        zIndex: item.z_index || 10,
        touchAction: 'none' // Prevent page scrolling on mobile while dragging
      }}
    >
      {/* 1. The Transformed Image Container */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          width: '160px',
          transform: `scaleX(${item.flip_x || 1}) scale(${item.canvas_scale || 1}) rotate(${item.canvas_rotation || 0}deg)`,
          transformOrigin: 'center center',
          cursor: isDragging.current ? 'grabbing' : 'grab',
          filter: showPopover ? 'drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.35))' : 'drop-shadow(2px 6px 10px rgba(0, 0, 0, 0.25))',
        }}
      >
        <img 
          src={item.image_url} 
          alt={item.prod_name} 
          style={{ 
            width: '100%', 
            height: 'auto', 
            display: 'block', 
            clipPath: getClipPathString(item.polygon),
            borderRadius: item.polygon ? '0' : '12px'
          }} 
          draggable={false} 
        />
      </div>

      {/* 2. The Popover Card (Outside the transform so it doesn't get squished/flipped!) */}
      {showPopover && (
        <div 
          onPointerDown={(e) => e.stopPropagation()} // Prevent clicking the card from starting a drag
          style={{
            position: 'absolute',
            left: '170px', // Pushed slightly right of the item
            top: '-20px',
            backgroundColor: '#ffffff',
            padding: '16px',
            borderRadius: '16px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
            zIndex: 5000,
            width: '220px',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          <a
            href={`https://global.musinsa.com/us/goods/${item.prod_num}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#33312e', marginBottom: '4px' }}>
              {item.brand_name || 'Brand'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#616a75', marginBottom: '12px', lineHeight: '1.4' }}>
              {item.prod_name}
            </div>
          </a>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <div style={{ fontWeight: 600, color: '#bc4749' }}>
              ${item.price}
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end', width: '120px' }}>
              <button title="Bring Forward" onClick={() => updateItem(item.prod_num, { z_index: (item.z_index || 10) + 1 })} style={miniBtn}>+Z</button>
              <button title="Send Backward" onClick={() => updateItem(item.prod_num, { z_index: (item.z_index || 10) - 1 })} style={miniBtn}>-Z</button>
              <button title="Scale Up" onClick={() => updateItem(item.prod_num, { canvas_scale: (item.canvas_scale || 1) + 0.1 })} style={miniBtn}>+</button>
              <button title="Scale Down" onClick={() => updateItem(item.prod_num, { canvas_scale: Math.max(0.4, (item.canvas_scale || 1) - 0.1) })} style={miniBtn}>-</button>
              <button title="Flip Horizontal" onClick={() => updateItem(item.prod_num, { flip_x: (item.flip_x === -1 ? 1 : -1) })} style={{...miniBtn, width: '100%'}}>Flip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}