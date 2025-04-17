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
    const [annotations, setAnnotations] = useState(null);
    const [init, setInit] = useState(false);
    const [site, setSite] = useState('');
    const [currentMedia, setCurrentMedia] = useState(null); // current media we are connected to
    const [fixCamera, setFixedCamera] = useState(false);

    // load annotations
    useEffect( ()=>{
        if (annotations) return;
        if (!tour.annotURL){
            tour['annotURL'] = 'annotations.json'
        }
        const fannot = async () => {
            let annot = {};
            if (tour.annotURL){
                // fetch from specified URL
                annot =  await fetchAnnotation(tour.annotURL)
            }
            setAnnotations(annot);
        }
        fannot();
    }, []);

    // save annotations when they are updated
    // (if running on a dev server)
    useEffect( ()=>{
        if (tour.devURL && annotations) {
            // send a POST that updates markdown file
            fetch("./update", {
                method : 'POST', 
                headers : { 'Content-Type':'application/json; charset=utf-8'},
                body: JSON.stringify(
                {   filename: tour.annotURL,
                    content: JSON.stringify(annotations),
                    dtype: 'application/json'
                })
            }).then( (response) => {if (response.status!=200) console.log(`Error saving file ${tour.annotURL}`)});  
        }
    }, [annotations] );

    // set current site
    const params = useParams();
    useEffect( ()=>{
        if (!(params.site.toLowerCase() in tour.synonyms)) return;

        // parse site
        const newSite = tour.synonyms[params.site.toLowerCase()];

        // create annotation if it does not already exist
        if (annotations && !annotations[newSite]) {
                annotations[newSite] = {lines:[], planes:[], traces:[]};
                setAnnotations({...annotations}); // update
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
        let mediaURL = tour.sites[ newSite ].mediaURL;
        if (tour.sites[ newSite ].mediaType === "cloud"){
            if (!mediaURL.startsWith("http")){ // allow absolute URLS
                if (tour.devURL){ // use local dev server
                    mediaURL = `${tour.devURL}/${mediaURL}`
                } else { // otherwise use defined remote server
                    mediaURL = `${tour.cloudURL}/${mediaURL}`
                }
            }
        }
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
