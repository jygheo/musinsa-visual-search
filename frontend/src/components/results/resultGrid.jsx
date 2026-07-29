import React from 'react';
import ProductCard from './productCard';
import './resultGrid.css';

export default function ResultGrid({ searchRes, onFindSimilar, onAddToBoard }) {
  let gridElms = null;

  if (searchRes === "error") {
    gridElms = Array.from({ length: 20 }).map((_, i) => (
      <div key={i} className="skeleton-card">
        <div className="skeleton-img" />          {/* fixed: was skeleton-image */}
        <div className="skeleton-text" />
        <div className="skeleton-text short" />
      </div>
    ));
  } else if (Array.isArray(searchRes)) {
    gridElms = searchRes.map((elm) => (
      <ProductCard
        key={elm.garment_id || elm.prod_num}
        elm={elm}
        onFindSimilar={onFindSimilar}
        onAddToBoard={onAddToBoard}
      />
    ));
  } else if (searchRes === "loading") {
    gridElms = Array.from({ length: 20 }).map((_, i) => (
      <div key={i} className="skeleton-card">
        <div className="skeleton-img" />
        <div className="skeleton-text" />
        <div className="skeleton-text short" />
      </div>
    ));
  }

  return <div className="product-grid-container">{gridElms}</div>;  // fixed class name
}