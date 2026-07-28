import './resultGrid.css'

export default function ResultGrid({ searchRes, onFindSimilar }) {

  let gridElms = null

  if (searchRes === "error") {
    gridElms = Array.from({ length: 20 }).map((_, i) => (
      <div className="product-card" key={i}>
        <div className="blank-img"></div>
        <div className="blank-text short" />
        <div className="blank-text" />
        <div className="blank-text price" />
      </div>
    ))
  }
  else if (Array.isArray(searchRes)) {
    gridElms = searchRes.map((elm) => (
      <a href={`https://global.musinsa.com/us/goods/${elm.prod_num}`}
        className="product-link"
        target="_blank"
        key={elm.prod_num}>

        <div className="product-card">
          <div className="image-container">
            <img src={elm.image_url} loading='lazy' alt={elm.prod_name} />
            <button 
              className="find-similar-btn"
              onClick={(e) => {
                e.preventDefault(); // Stop link navigation
                e.stopPropagation(); // Stop event bubbling
                if (onFindSimilar) onFindSimilar(elm.garment_id, elm.image_url);
              }}
              title="Find Similar"
              aria-label="Find Similar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </div>
          <div
            className="brand-name"
            target="_blank"
            rel="noopener noreferrer"
          >
            {elm.brand_name}
          </div>
          <div
            className="product-name"
            target="_blank"
            rel="noopener noreferrer"
          >
            {elm.prod_name}
          </div>
          <div className="price">{`$${elm.price}`}</div>
        </div>
      </a>
    ))
  }
  else if (searchRes === "loading") {
    gridElms = Array.from({ length: 20 }).map((_, i) => (
      <div className="product-card" key={i}>
        <div className="skeleton skeleton-img"></div>
        <div className="skeleton skeleton-text short" />
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text price" />
      </div>
    ))
  }

  return (
    <div>
      <div className="product-grid-container">
        {gridElms}
      </div>
    </div>
  )
}