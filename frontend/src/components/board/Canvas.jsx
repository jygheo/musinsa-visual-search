import React from 'react';
import CanvasItem from './canvasItem';
import './canvas.css';

export default function Canvas({ wardrobe, setWardrobe }) {
  
  const updateItemTransform = (id, changes) => {
    setWardrobe(prev => prev.map(item =>
      item.prod_num === id ? { ...item, ...changes } : item
    ));
  };

  const handleRemoveItem = (id) => {
    setWardrobe(prev => prev.filter(item => item.prod_num !== id));
  };

  const loadTemplate = () => {
    const cx = window.innerWidth / 2 - 80;
    const cy = window.innerHeight / 2 - 150;
    
    setWardrobe([
   
    ]);
  };

  return (
    <div className="canvas-workspace">
      
      {wardrobe.length === 0 && (
        <div className="empty-canvas-state">
          <div className="empty-canvas-text">
            Your board is empty. Search for items or start with a template.
          </div>
          <button className="template-btn" onClick={loadTemplate}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
            Start with Outfit Template
          </button>
        </div>
      )}

      {wardrobe.map((item) => (
        <CanvasItem 
          key={item.prod_num} 
          item={item} 
          updateItem={updateItemTransform} 
          onRemove={handleRemoveItem} 
        />
      ))}

      {/* Persistent Trash Zone for Black Hole deletion */}
      <div id="canvas-trash-zone" className="trash-zone" title="Drag here to remove">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </div>

    </div>
  );
}