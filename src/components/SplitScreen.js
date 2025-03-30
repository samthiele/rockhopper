import React, { useState, useRef } from 'react';
import './SplitScreen.css';

const SplitScreen = ( {left, right, split=30, three} ) => {
  const [sidebarWidth, setSidebarWidth] = useState(split); // Percentage width for the sidebar
  const leftDiv = useRef(null);
  const rightDiv = useRef(null);

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

      // resize three.js renderer
      if (three.current && three.current.renderer)
      {
          const mount = rightDiv.current;
          three.current.renderer.setSize(mount.clientWidth, mount.clientHeight);
          three.current.labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
          three.current.camera.aspect = mount.clientWidth / mount.clientHeight;
          three.current.camera.updateProjectionMatrix();
          three.current.controls.update();
      };
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="outer">
      <div className="left" ref={leftDiv} style={{ width: `${sidebarWidth}vw` }}>
          {[...left]}
      </div>
      <div
        className="resizer"
        onMouseDown={handleMouseDown}
      ></div>
      <div className="right" ref={rightDiv} style={{ width: `${100 - sidebarWidth}vw` }}>
          {[...right]}
      </div>
    </div>
  );
};
export default SplitScreen;
