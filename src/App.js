import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useParams, Navigate } from 'react-router-dom';
import SplitScreen from './components/SplitScreen';
import MarkdownSidebar from './components/MarkdownSidebar'
import PointStream from './components/PointStream'
import './App.css';

const App = () => {
  // load index json file
  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/index.json')
      .then(response => response.json())
      .then(data => {
        setIndex(data);
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
  } else if (index) { // successfully loaded index
    return (
      <Router>
        <Routes>
        <Route path="/" element={<Navigate to='/start' replace />} />
        <Route path="/:site" element={ 
           <div className="app">
           <SplitScreen left={[<MarkdownSidebar index={index}/>]} 
                       right={[<PointStream index={index}/>]} 
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
