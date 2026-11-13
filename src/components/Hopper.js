import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import * as THREE from "three";
import SplitScreen from './SplitScreen';
import MarkdownSidebar from './MarkdownSidebar'
import ThreeScene from './ThreeScene'
import PointStream from './PointStream'
import PhotosphereViewer from './Photosphere'
import TexMesh from './TexMesh'
import SceneReset from './SceneReset'
import './Hopper.css'

function contentName(item) {
    if (item.name) return item.name;
    const parts = String(item.mediaURL || '').split('/').filter(Boolean);
    const last = parts[parts.length - 1] || 'object';
    if (/\.json$/i.test(last) && parts.length > 1) return parts[parts.length - 2];
    return last.replace(/\.(zarr|ply|jpg|jpeg)$/i, '');
}

function resolveContents(tour, spec) {
    if (!spec) return [];
    const items = (spec.media && spec.media.length)
        ? spec.media
        : [{ mediaType: spec.mediaType, mediaURL: spec.mediaURL, name: spec.name, pointSize: spec.pointSize }];
    return items.map((item) => {
        let url = item.mediaURL || '';
        const mediaType = item.mediaType;
        if ((mediaType === 'cloud' || mediaType === 'mesh') && url && !url.startsWith('http')) {
            const base = tour.devURL || tour.cloudURL || '';
            url = `${String(base).replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        }
        return {
            ...item,
            mediaType,
            url,
            name: contentName(item),
            pointSize: item.pointSize,
        };
    });
}

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
    const [contents, setContents] = useState([]); // resolved media objects for this site

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
        
        const spec = tour.sites[newSite];
        const next = resolveContents(tour, spec);
        const nextMixed = next.some((item) => item.mediaType === 'photosphere')
            && next.some((item) => item.mediaType === 'cloud' || item.mediaType === 'mesh');
        const photoOnly = next.length > 0 && next.every((item) => item.mediaType === 'photosphere');
        const startMode = (nextMixed && spec.view && spec.view.mode === 'photosphere') || photoOnly
            ? 'photosphere' : 'model';
        const photo = next.find((item) => item.mediaType === 'photosphere');
        three.current.mixed = nextMixed;
        three.current.modeSite = newSite;
        three.current.viewMode = startMode;
        three.current.savedView = {};
        three.current.photoView = (photo && photo.view) || (photoOnly ? spec.view : null);
        three.current.modelView = spec.view || null;
        setSite(newSite);
        setContents(next);

        if (three.current.applyViewMode) {
            three.current.applyViewMode(startMode, true);
        } else if (three.current.camera && spec && spec.view){
            if (spec.view.pos){
                three.current.camera.position.set(...spec.view.pos);
            }
            if (spec.view.tgt){
                const center = new THREE.Vector3(...spec.view.tgt);
                three.current.camera.lookAt(center);
                three.current.controls.target.copy(center);
                three.current.controls.update();
            }
            if (three.current.invalidate) three.current.invalidate();
        }
    }, [params]);

    if (!(site in tour.sites)){
        return <p>Site "{params.site}" not found</p>;
    }
    const mediaKey = contents.map((item) => item.url).join('|');
    const hasPhoto = contents.some((item) => item.mediaType === 'photosphere');
    const hasModel = contents.some((item) => item.mediaType === 'cloud' || item.mediaType === 'mesh');
    const mixed = hasPhoto && hasModel;
    const fixCamera = contents.length > 0 && contents.every((item) => item.mediaType === 'photosphere');
    const hasCloud = contents.some((item) => item.mediaType === 'cloud');
    const photo = contents.find((item) => item.mediaType === 'photosphere');
    const models = contents.filter((item) => item.mediaType !== 'photosphere');
    const startPhoto = mixed && tour.sites[site].view && tour.sites[site].view.mode === 'photosphere';
    three.current.mixed = mixed;
    three.current.photoView = (photo && photo.view) || (fixCamera ? tour.sites[site].view : null);
    three.current.modelView = (tour.sites[site] && tour.sites[site].view) || null;
    if (three.current.modeSite !== site) {
        three.current.viewMode = startPhoto || fixCamera ? 'photosphere' : 'model';
        three.current.modeSite = site;
        three.current.savedView = {};
    }

    const nodes = contents.map((item, index) => {
        const frameCamera = mixed
            ? (item.mediaType === 'photosphere' ? startPhoto : item === models[0] && !startPhoto)
            : index === 0;
        if (item.mediaType === 'photosphere') {
            return <PhotosphereViewer key={item.url} tour={tour} site={site} three={three}
                        url={item.url} name={item.name} view={item.view} init={init} frameCamera={frameCamera}/>;
        }
        if (item.mediaType === 'mesh') {
            return <TexMesh key={item.url} tour={tour} site={site} three={three}
                        url={item.url} name={item.name} init={init} frameCamera={frameCamera}
                        setPointSize={!hasCloud}/>;
        }
        return <PointStream key={item.url} tour={tour} site={site} three={three}
                    url={item.url} name={item.name} init={init} frameCamera={frameCamera}
                    pointSize={item.pointSize}/>;
    });

    // return splitscreen with markdown (left) and 3D view (right)
    return (
            <div className="app">
            <SplitScreen left={[<MarkdownSidebar tour={tour} 
                                                 site={site}
                                                 annotations={annotations}
                                                 setAnnotations={setAnnotations}
                                                 three={three}
                                                 key={"md"}/>] } 
                        right={[
                            <ThreeScene tour={tour} site={site} three={three}
                                        mediaKey={mediaKey}
                                        annotations={annotations}
                                        setAnnotations={setAnnotations}
                                        fixCamera={fixCamera}
                                        mixed={mixed}
                                        modelName={models.length === 1 ? models[0].name : 'Model'}
                                        photoName={photo ? photo.name : 'Photo'}
                                        init={init}
                                        setInit={setInit}
                                        key='3s'>
                                <SceneReset three={three} mediaKey={mediaKey} key="reset"/>
                                {nodes}
                            </ThreeScene>
                        ]} 
                        split="40" three={three}/> 
            </div>
    );
};
export default Hopper;
