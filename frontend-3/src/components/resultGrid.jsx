import './resultGrid.css'

export default function ResultGrid({ searchRes }) {

  let gridElms = null

  if (searchRes=="error") {
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
          <img src={elm.image_url} loading='lazy' alt={elm.prod_name} />
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
  else if (searchRes == "loading") {
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
