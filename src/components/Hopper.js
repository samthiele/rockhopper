import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import * as THREE from "three";
import SplitScreen from './SplitScreen';
import MarkdownSidebar from './MarkdownSidebar'
import ThreeScene from './ThreeScene'
import PointStream from './PointStream'
import PhotosphereViewer from './Photosphere'
import './Hopper.css'

// fetch annotation JSON files
const fetchAnnotation = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        const jsonData = await response.json(); // Parse the JSON response
        return jsonData; // Return the JavaScript object
    } catch (error) {
        console.error('Error fetching JSON:', error);
        return null; // Return null or an empty object in case of an error
    }
};

const Hopper = ({tour}) => {
    const three = useRef({pointSize: 0.1}); // three.js objects
    const [annotations, setAnnotations] = useState({});
    const [init, setInit] = useState(false);
    const [site, setSite] = useState('');
    const [currentMedia, setCurrentMedia] = useState(null); // current media we are connected to
    const [fixCamera, setFixedCamera] = useState(false);

    // set current site
    const params = useParams();
    useEffect( ()=>{
        if ((!params.site in tour.synonyms)) return;

        // parse site
        const newSite = tour.synonyms[params.site];

        // fetch or create annotation JSON (if it does not already exist)
        if (!annotations[newSite]) {
            if (tour.sites[newSite].annotURL){
                // fetch from specified URL
                const annot =  fetchAnnotation(tour.sites[newSite].annotURL);
            } else {
                // initialise an empty annotation
                annotations[newSite] = {lines:[], planes:[], traces:[]}
                setAnnotations({...annotations}); // update
            }
        }
        // update site
        setSite(newSite);

        // update camera etc.
        if (newSite in tour.sites){
            if (tour.sites[newSite].view){
                if (three.current.camera){
                    if (tour.sites[newSite].view.pos){
                        three.current.camera.position.set(...tour.sites[newSite].view.pos);
                    }
                    if (tour.sites[newSite].view.tgt){
                        const center = new THREE.Vector3(...tour.sites[newSite].view.tgt);
                        three.current.camera.lookAt(center);
                        three.current.controls.target.copy(center);
                        three.current.controls.update();
                    }
                }
            }
        }

        // set media URL
        const mediaURL = tour.sites[ newSite ].mediaURL;
        if (mediaURL != currentMedia){
            setCurrentMedia(mediaURL);
        }

        // check media type
        const mediaType = tour.sites[ newSite ].mediaType;
        if (mediaType === 'photosphere') setFixedCamera(true);
        if (mediaType === 'cloud') setFixedCamera(false);
    }, [params]);

    if (!(site in tour.sites)){
        return <p>Site "{params.site}" not found</p>;
    }
    const mediaType = tour.sites[site].mediaType;

    // define media that will be displayed
    let media = <></>
    if (mediaType === 'photosphere') {
        media = <PhotosphereViewer  
                    tour={tour}  site={site} three={three}
                    currentMedia={currentMedia} init={init} key={"ps"}/>
    } else if (mediaType === 'cloud'){
        media = <PointStream tour={tour} site={site} three={three}
                        currentMedia={currentMedia} init={init} key={"ps"}/>
    }

    // return splitscreen with markdown (left) and 3D view (right)
    return (
            <div className="app">
            <SplitScreen left={[<MarkdownSidebar tour={tour} 
                                                 site={site}
                                                 annotations={annotations}
                                                 setAnnotations={setAnnotations}
                                                 three={three}
                                                 key={"md"}/>] } 
                        right={[<>
                            <ThreeScene tour={tour} site={site} three={three} 
                                        currentMedia={currentMedia}
                                        annotations={annotations}
                                        setAnnotations={setAnnotations}
                                        fixCamera={fixCamera} 
                                        init={init}
                                        setInit={setInit}
                                        key='3s'/>
                            {media}
                            </>]} 
                        split="40" three={three}/> 
            </div>
    );
};
export default Hopper;
