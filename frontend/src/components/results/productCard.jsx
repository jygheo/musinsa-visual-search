import React from 'react';
import './resultGrid.css';

export default function ProductCard({ elm, onFindSimilar, onAddToBoard }) {
  return (
    <a
      href={`https://global.musinsa.com/us/goods/${elm.prod_num}`}
      className="product-link"
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'block', textDecoration: 'none' }}   // critical fix
    >
      <div className="product-card">
        {/* Image container – MUST be 'image-container' */}
        <div className="image-container">
          <img
            src={elm.image_url}
            alt={elm.prod_name}
            className="product-image"   // optional, keep as is
          />
          <div className="card-actions-overlay">
            <button
              className="card-action-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onFindSimilar) onFindSimilar(elm.garment_id, elm.image_url);
              }}
              title="Find Similar"
              aria-label="Find Similar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            <button
              className="card-action-btn pin-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onAddToBoard) onAddToBoard(elm);
              }}
              title="Pin to Board"
              aria-label="Pin to Board"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.87l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Product details */}
        <div className="brand-name">{elm.brand_name}</div>
        <div className="product-name">{elm.prod_name}</div>
        <div className="price">{`$${elm.price}`}</div>
      </div>
    </a>
  );
}