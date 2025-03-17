import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, useParams, Navigate } from 'react-router-dom';
import SplitScreen from './components/SplitScreen';
import MarkdownSidebar from './components/MarkdownSidebar'
import PointStream from './components/PointStream'
import './App.css';

const App = () => {
  // load index json file
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState({lines:[], planes:[], traces:[]});
  const index = useRef(null);
  const scene = useRef(null); // three.js scene
  const renderer = useRef(null); // three.js renderer 
  const cameraRef = useRef(null); // camera object 
  const controlsRef = useRef(null); // orbit controls

  // visualisation properties
  const [activeStyle, setActiveStyle] = useState(null);

  useEffect(() => {
    fetch('/index.json')
      .then(response => response.json())
      .then(data => {
        index.current = data;
        //setIndex(data);
        setLoading(false);
        console.log(data);
      })
      .catch(error => {
        console.error('Error fetching index:', error);
        setLoading(false);
      });
  }, []);

  // return
  if (loading) { // still loading index
    return <div className="loading">Loading...</div>;
  } else if (index.current) { // successfully loaded index
    return (
      <Router>
        <Routes>
        <Route path="/" element={<Navigate to='/start' replace />} />
        <Route path="/:site" element={ 
           <div className="app">
           <SplitScreen left={[<MarkdownSidebar index={index} 
                                                annotations={annotations}
                                                setAnnotations={setAnnotations}
                                                scene={scene}
                                                renderer={renderer}
                                                cameraRef={cameraRef}
                                                controlsRef={controlsRef}
                                                activeStyle={activeStyle}/>]} 
                       right={[<PointStream index={index} 
                                            annotations={annotations} 
                                            setAnnotations={setAnnotations}
                                            scene={scene}
                                            renderer={renderer}
                                            cameraRef={cameraRef}
                                            controlsRef={controlsRef}
                                            activeStyle={activeStyle}
                                            setActiveStyle={setActiveStyle}/>]} 
                       split="40"/> 
           </div>
          }/>
        </Routes>
      </Router>
    );
  } else {
    return <div className="loading">Error; could not fetch index.json...</div>;
  }
};
export default App;
