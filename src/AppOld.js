import React, { useState } from 'react';
import MarkdownSidebar from './components/MarkdownSidebar';
import PointCloudViewer from './components/PointCloudViewer';
import './App.css';

const App = () => {
  const [sidebarWidth, setSidebarWidth] = useState(30); // Percentage width for the sidebar

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
    <div className="app">
      <div className="sidebar" style={{ width: `${sidebarWidth}%` }}>
        <MarkdownSidebar />
      </div>
      <div
        className="resizer"
        onMouseDown={handleMouseDown}
      ></div>
      <div className="viewer" style={{ width: `${100 - sidebarWidth}%` }}>
        <PointCloudViewer zarrUrl={`https://storage.googleapis.com/rockhopper/dolomites.zarr`}/>
      </div>
    </div>
  );
};

// <PointCloudViewer zarrUrl={`http://localhost:8080/dolomites.zarr`}/>
// <PointCloudViewer zarrUrl={`https://storage.googleapis.com/rockhopper/dolomites.zarr`}/>
export default App;
