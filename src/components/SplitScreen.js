import React, { useState, useRef, useEffect } from 'react';
import './SplitScreen.css';

const SplitScreen = ({ left, right, split = 30, three }) => {
  const [sidebarWidth, setSidebarWidth] = useState(split); // Percentage width for the sidebar
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const leftDiv = useRef(null);
  const rightDiv = useRef(null);
  const sidebarWidthRef = useRef(split);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const applyPaneSizes = (widthPct, landscape) => {
    if (landscape) {
      if (leftDiv.current) leftDiv.current.style.width = `${widthPct}vw`;
      if (rightDiv.current) rightDiv.current.style.width = `${100 - widthPct}vw`;
    } else {
      if (leftDiv.current) leftDiv.current.style.height = `${widthPct}vh`;
      if (rightDiv.current) rightDiv.current.style.height = `${100 - widthPct}vh`;
    }
  };

  // for resizing — update the DOM during drag; commit React state on mouseup
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const startWidth = sidebarWidthRef.current;
    const landscape = isLandscape;

    const handleMouseMove = (e) => {
      let newSidebarWidth;
      if (landscape) {
        const deltaX = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
        newSidebarWidth = ((startWidth * window.innerWidth) / 100 + deltaX) / window.innerWidth * 100;
      } else {
        const deltaY = startY - (e.touches ? e.touches[0].clientY : e.clientY);
        newSidebarWidth = ((startWidth * window.innerHeight) / 100 + deltaY) / window.innerHeight * 100;
      }
      if (newSidebarWidth >= 20 && newSidebarWidth <= 80) { // Restrict resizing between 20% and 80%
        sidebarWidthRef.current = newSidebarWidth;
        applyPaneSizes(newSidebarWidth, landscape);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);

      setSidebarWidth(sidebarWidthRef.current);

      // resize three.js renderer
      if (three.current && three.current.renderer) {
        const mount = rightDiv.current;
        three.current.renderer.setSize(mount.clientWidth, mount.clientHeight);
        three.current.labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
        three.current.camera.aspect = mount.clientWidth / mount.clientHeight;
        three.current.camera.updateProjectionMatrix();
        if (three.current.invalidate) three.current.invalidate();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove);
    document.addEventListener('touchend', handleMouseUp);
  };

  if (isLandscape){
    return (
      <div className={`outer landscape`}>
        <div
          className="left"
          ref={leftDiv}
          style={
            isLandscape
              ? { width: `${sidebarWidth}vw` }
              : { height: `${sidebarWidth}vh` }
          }
        >
          {[...left]}
        </div>
        <div className={`resizer landscape`} onMouseDown={handleMouseDown}></div>
        <div
          className="right"
          ref={rightDiv}
          style={
            isLandscape
              ? { width: `${100 - sidebarWidth}vw` }
              : { height: `${100 - sidebarWidth}vh` }
          }
        >
          {[...right]}
        </div>
      </div>
    );
  } else {
    return (
      <div className={`outer ${isLandscape ? 'landscape' : 'portrait'}`}>
        <div
          className="right"
          ref={rightDiv}
          style={
            isLandscape
              ? { width: `${100 - sidebarWidth}vw` }
              : { height: `${100 - sidebarWidth}vh` }
          }
        >
          {[...right]}
        </div>
        <div className={`resizer portrait`} onMouseDown={handleMouseDown}></div>
        <div
          className="left"
          ref={leftDiv}
          style={
            isLandscape
              ? { width: `${sidebarWidth}vw` }
              : { height: `${sidebarWidth}vh` }
          }
        >
          {[...left]}
        </div>
      </div>
    );
  }
  
};

export default SplitScreen;
