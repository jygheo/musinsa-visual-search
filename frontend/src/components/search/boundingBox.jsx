import React from 'react';

export default function BoundingBox({ bbox, onClick }) {
    return (
        <div
            className="bounding-box-brackets"
            style={{
                left: `${bbox.x * 100}%`,
                top: `${bbox.y * 100}%`,
                width: `${bbox.w * 100}%`,
                height: `${bbox.h * 100}%`
            }}
            onClick={(e) => {
                e.stopPropagation();
                onClick(bbox);
            }}
            title="Click to search this item"
        >
            <div className="corner top-left"></div>
            <div className="corner top-right"></div>
            <div className="corner bottom-left"></div>
            <div className="corner bottom-right"></div>
        </div>
    );
}