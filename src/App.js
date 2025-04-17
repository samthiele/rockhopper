import React, { useEffect, useRef, useState } from 'react';
import { HashRouter as Router, Routes, Route, useParams, Navigate } from 'react-router-dom';
import Hopper from './components/Hopper';

const App = () => {
  // load index json file
  const [loading, setLoading] = useState(true);
  const tour = useRef(null);
  const params = useParams();
  useEffect(() => {
    fetch('./index.json')
      .then(response => response.json())
      .then(data => {
        tour.current = data;
        
        // add site names to synonyms
        Object.keys( tour.current.sites ).forEach( (k) => {
          tour.current.synonyms[k] = k; // makes for easier lookups
        })
        setLoading(false);
        console.log(data);
      })
      .catch(error => {
        console.error('Error fetching index:', error);
        setLoading(false);
      });
  }, []);

  // return
  if (loading.current) { // still loading index
    return <div className="loading">Loading...</div>;
  } else if (tour.current) { // successfully loaded index
    return (
      <Router>
        <Routes>
        <Route path="/" element={<Navigate to='/start' replace />} />
        <Route path="/:site" element={<Hopper tour={tour.current}/>}/>
        </Routes>
      </Router>
    );
  } else {
    return <div className="loading">Error; could not fetch index.json...</div>;
  }
};
export default App;
