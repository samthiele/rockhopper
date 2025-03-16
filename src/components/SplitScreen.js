import React, { useState } from 'react';
import './SplitScreen.css';

const SplitScreen = ( {left, right, split=30} ) => {
  const [sidebarWidth, setSidebarWidth] = useState(split); // Percentage width for the sidebar
  // for resizing
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const handleMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const newSidebarWidth = ((sidebarWidth * window.innerWidth) / 100 + deltaX) / window.innerWidth * 100;
      if (newSidebarWidth >= 20 && newSidebarWidth <= 80) { // Restrict resizing between 20% and 80%
        setSidebarWidth(newSidebarWidth);
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="outer">
      <div className="left" style={{ width: `${sidebarWidth}vw` }}>
          {[...left]}
      </div>
      <div
        className="resizer"
        onMouseDown={handleMouseDown}
      ></div>
      <div className="right" style={{ width: `${100 - sidebarWidth}vw` }}>
          {[...right]}
      </div>
    </div>
  );
};
export default SplitScreen;
