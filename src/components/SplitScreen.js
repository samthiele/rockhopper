import React, { useState, useRef, useEffect } from 'react';
import './SplitScreen.css';

const SplitScreen = ({ left, right, split = 30, three }) => {
  const [sidebarWidth, setSidebarWidth] = useState(split); // Percentage width for the sidebar
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const leftDiv = useRef(null);
  const rightDiv = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // for resizing
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const startY = e.touches ? e.touches[0].clientY : e.clientY;  

    const handleMouseMove = (e) => {
      let newSidebarWidth;
      if (isLandscape) {
        const deltaX = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
        newSidebarWidth = ((sidebarWidth * window.innerWidth) / 100 + deltaX) / window.innerWidth * 100;
      } else {
        const deltaY = startY - (e.touches ? e.touches[0].clientY : e.clientY);
        newSidebarWidth = ((sidebarWidth * window.innerHeight) / 100 + deltaY) / window.innerHeight * 100;
      }
      if (newSidebarWidth >= 20 && newSidebarWidth <= 80) { // Restrict resizing between 20% and 80%
        setSidebarWidth(newSidebarWidth);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);

      // resize three.js renderer
      if (three.current && three.current.renderer) {
        const mount = rightDiv.current;
        three.current.renderer.setSize(mount.clientWidth, mount.clientHeight);
        three.current.labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
        three.current.camera.aspect = mount.clientWidth / mount.clientHeight;
        three.current.camera.updateProjectionMatrix();
        three.current.controls.update();
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
