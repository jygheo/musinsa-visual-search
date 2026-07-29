import React from 'react';
import './header.css';

export default function Header({ wardrobeCount = 0, activeTab, onToggleTab, onGoHome, showHome }) {
  const isBoard = activeTab === 'board';

  return (
    <header className={`hero-section ${isBoard ? 'collapsed' : ''}`}>
      {showHome && (
        <div className="header-home">
          <button className="home-btn" onClick={onGoHome} title="Back to search" aria-label="Back to search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l9-8 9 8" />
              <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
            </svg>
          </button>
        </div>
      )}

      <div className="header-actions">
        <button className="board-toggle-btn" onClick={onToggleTab} title={isBoard ? "Back to Search" : "View Board"}>
          {isBoard ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              Search
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
              Board
            </>
          )}
          {wardrobeCount > 0 && !isBoard && (
            <span className="wardrobe-badge">{wardrobeCount}</span>
          )}
        </button>
      </div>

      <div className="hero-content">
        <div className="tag-mark" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.6 2.6a2 2 0 0 1 1.41.59l6.8 6.8a2 2 0 0 1 0 2.82l-7.8 7.8a2 2 0 0 1-2.82 0l-6.8-6.8a2 2 0 0 1-.59-1.41V4.6a2 2 0 0 1 2-2Z" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round"/>
            <circle cx="7.6" cy="7.6" r="1.6" fill="var(--rust)"/>
          </svg>
        </div>
        <p className="eyebrow">Visual Search &middot; Musinsa</p>
        <h1>Find the look, not the words.</h1>
        {/* <p className="description">
          Drop a photo. We'll dig up every piece that matches — down to the stitching.
        </p> */}
      </div>
    </header>
  );
}