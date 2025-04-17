import React, { useEffect, useRef, useState } from "react";
import { useParams } from 'react-router-dom';
import * as THREE from "three";
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { openGroup, HTTPStore, slice, NestedArray } from "zarr";
import chroma from 'chroma-js';
import './ThreeScene.css';

const LOAD_INTERVAL = 100; // ms to sleep between loading new chunks
const nostream = false; // quickly disable streaming (for dev purposes)

// recompute a point cloud colour array from the source
// (typically using a different visualisation style)
function colourise(cloud, array, settings = null, key = null, offset=0){
  // parse colour mapping settings
  //let value = { 'R': [3, 0, 1], 'G': [4, 0, 1], 'B': [5, 0, 1] }; // default RGB mapping
  let value = {color:[2, {limits:[-100, 100, 25], scale:'viridis'}]};
  if (settings){
    if (key in settings) {
      value = settings[key];
    }
  }
  const n = cloud.geometry.drawRange.count; // number of points to colour
  if (Array.isArray(value.color)) {
      // Case 1: Colour ramp visualisation (scalar mapping)
      const [index, options] = value.color;

      // Compute limits using chroma.limits
      const domain = chroma.limits([options.limits[0],options.limits[1]], 'e', options.limits[2]);
      const scale = chroma.scale(options.scale).domain(domain);

      // update cloud colour array
      for (let i = offset; i < n; i++){
        const c = scale(array.get([i, index])).rgb(); // compute colour
        for (let j = 0; j<3; j++){c[j] = c[j] / 255;} // convert to 0 - 1 range
        cloud.geometry.attributes.color.array.set( c, i*3 );
      }
  } else {
      // Case 2: Ternary mapping (R, G, B)
      let [ix0, ix1, ix2] = [value.color['R'][0],
                                value.color['G'][0],
                                value.color['B'][0]];
      for (let i = offset; i < n; i++){ // compute colour or each point
        const c = [(array.get([i, ix0]) - value.color['R'][1])/(value.color['R'][2] - value.color['R'][1]),
        (array.get([i, ix1]) - value.color['G'][1])/(value.color['G'][2] - value.color['G'][1]),
        (array.get([i, ix2]) - value.color['B'][1])/(value.color['B'][2] - value.color['B'][1])]
        
        // update cloud colour array
        cloud.geometry.attributes.color.array.set( c, i*3 );
      }
  }
  // flag that updates are needed
  cloud.geometry.attributes.color.needsUpdate = true;
}

// define function to highlight points
const applyHighlight = (cloud, array, group, offset=0) => {
  const n = cloud.geometry.drawRange.count; // number of points to change colour
  // function for highlighting stuff
  const c2 = group.color || [1,1,0];
  const f = group.blend || 0.5;
  const blend = (c1) => {
    return [ // combine two colours
      c1[0]*(1-f) + c2[0]*f,
      c1[1]*(1-f) + c2[1]*f,
      c1[2]*(1-f) + c2[2]*f,
    ] };
  
  // update colours to include the highlight
  if (group.iq){
    const [index,iq,thresh] = group.iq;
    let [r,g,b,v] = [0,0,0,0];
    for (let i = offset; i < n; i++){
      r = cloud.geometry.attributes.color.array[i*3];
      g = cloud.geometry.attributes.color.array[i*3+1];
      b = cloud.geometry.attributes.color.array[i*3+2];
      v = array.get([i, index]);
      if (iq === '='){
        if (v === thresh) [r,g,b] = blend([r,g,b]); // blend colour
      } else if (iq === '<' ){
        if (v <= thresh) [r,g,b] = blend([r,g,b]); // blend colour
      } else if (iq === '>'){
        if (v >= thresh) [r,g,b] = blend([r,g,b]); // blend colour
      } else if (iq === '!='){
        if (v !== thresh) [r,g,b] = blend([r,g,b]); // blend colour
      }
      
      cloud.geometry.attributes.color.array.set( [r,g,b], i*3 );
    }
  }

  // mask points if needed
  if (group.mask){
    const [index,iq,thresh] = group.mask;
    let v = 0;
    for (let i = offset; i < n; i++){
      v = array.get([i, index]);
      if (iq === '='){
        if (v === thresh) cloud.geometry.attributes.color.array.set( [0,0,0], i*3 ); // N.B. black is invisible
      } else if (iq === '<' ){
        if (v <= thresh) cloud.geometry.attributes.color.array.set( [0,0,0], i*3 ); // N.B. black is invisible
      } else if (iq === '>'){
        if (v >= thresh) cloud.geometry.attributes.color.array.set( [0,0,0], i*3 ); // N.B. black is invisible
      } else if (iq === '!='){
        if (v !== thresh) cloud.geometry.attributes.color.array.set( [0,0,0], i*3 ); // N.B. black is invisible
      }
    }
  }

  cloud.geometry.attributes.color.needsUpdate = true;
}

// shaders used to draw points better
const vertexShader = `
varying vec3 vColor;
uniform float worldSize;
void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = worldSize / -mvPosition.z; // Keeps size fixed in world space
    gl_Position = projectionMatrix * mvPosition;
}`;
const fragmentShader = `
    varying vec3 vColor;
    void main() {
        // discard fragments where the color is black (masked points)
        if (vColor == vec3(0.0, 0.0, 0.0)) { discard; }

        // otherwise draw
        gl_FragColor = vec4(vColor, 1.0);
    }
`;

const PointStream = ({ tour, site, three, init, currentMedia }) => {
  // objects that will be added to three.js scene
  const seedPoints = useRef(null); // seeds for streaming dense point cloud
  const densePoints = useRef(null); // dense point cloud

  // point streaming state
  const [source, setSource] = useState(null);
  const [attrs, setAttrs] = useState(null);
  const [seeds, setSeeds] = useState(null); // seed points to load chunks
  const [points, setPoints] = useState(null); // streamed point array
  const [streamed, setStreamed] = useState({}); // track which chunks have been loaded
  const [streamCount, setStreamCount] = useState(0); // number of points already streamed

  // styling
  const [activeGroup, setActiveGroup] = useState(null); // selected highlights
  const prevRGB = useRef(null); // used for turning highlight off quickly
  const [activeStyle, setActiveStyle] = useState(null);

  // Load seeds (chunk centers) and draw them
  useEffect(()=> {
    if (!init || nostream ) return;

    // update style according to selected site
    if (tour.sites[site].view){
      if (tour.sites[site].view.style) setActiveStyle(tour.sites[site].view.style);
      if (tour.sites[site].view.group) setActiveGroup(tour.sites[site].view.group);
    }
    if (source){
      // no need to stream if dataset is already loaded! :-) 
      if (source.store.url === currentMedia) return; 
    }

    console.log(`Loading cloud for ${site} from from ${currentMedia}`);
    async function loadZarr() {
      try {
        // connect to zarr object
        const zGroup = await openGroup(new HTTPStore( currentMedia )); // dataset
        const zCenters = await zGroup.getItem("chunk_centers"); // chunk centers array
        const seeds = await zCenters.get([null, null]); // chunk centers data
        console.log(`Cloud containts points with shape ${seeds.shape}`)
        setSource(zGroup); // store zarr group for later access (during streaming)
        setSeeds(seeds); // store seed data
        console.log(zGroup.store.url);

        // get zarr attributes (these contain important metadata)
        const attributes = await zGroup.attrs.asObject();
        setAttrs(attributes); // store these for later :-)
        setActiveStyle(attributes.styles[0]);
        three.current.origin = attributes.origin; // update origin (not needed, just in case)
        three.current.pointSize =  tour.sites[site].pointSize || attributes.resolution; // update point size (very much needed)
        console.log("Cloud attributes are:");
        console.log(attributes);

        // add seed points to scene
        const geometry = new THREE.BufferGeometry();
        const xyz = seeds.get([null, slice(0,3)]).flatten();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        
        // initialise arrays that will hold our dense points
        // and create associated Three.js scene objects
        setPoints(new NestedArray(null, [attributes.total,seeds.shape[1]],'<f4'));
        setStreamed({});
        setStreamCount(0);
        if (seedPoints.current) { three.current.scene.remove(seedPoints.current); seedPoints.current=null;}
        if (densePoints.current) { three.current.scene.remove(densePoints.current); densePoints.current=null;}
        const material = new THREE.PointsMaterial({
            size: 2, vertexColors: false, sizeAttenuation: true });
        const points = new THREE.Points(geometry, material);
        three.current.scene.add(points);
        seedPoints.current = points;
    
        // Adjust Camera
        let center = new THREE.Vector3();
        let pos;
        bbox.getCenter(center);
        const size = bbox.getSize(new THREE.Vector3()).length();
        const maxDistance = size * 2;
        three.current.camera.far = maxDistance * 5; // set far clipping plane
        if (site in tour.sites 
            && tour.sites[site].view
            && tour.sites[site].view.tgt){
          center = new THREE.Vector3(...tour.sites[site].view.tgt);
          pos = tour.sites[site].view.pos;
        } else {
          pos = [center.x, center.y-maxDistance/3, center.z+maxDistance/3];
        }
        three.current.camera.updateProjectionMatrix();
        three.current.camera.position.set(...pos);
        three.current.camera.lookAt(center);
        three.current.controls.target.copy(center);
        three.current.controls.update();
      } catch (error) {console.error("Error loading Zarr dataset:", error);}
    }
    loadZarr();
  }, [site, init, currentMedia])

  // **Lazy Loading Closest Chunk**
  useEffect(() => {
    if (!three.current.camera || !seeds || !source || !points || nostream || !seedPoints.current) return;
    if (!init || nostream || !points ) return;

    const loadClosestChunk = async () => {
      const camPos = new THREE.Vector3();
      three.current.camera.getWorldPosition(camPos);

      // Find the closest chunk to the screen center (target of view)
      let closestIndex = -1;
      let closestDistance = Infinity;
      const xyz = seeds.get([null, slice(0,3)]);
      for (let i=0; i<seeds.shape[0]; i++){
        if (streamed[i]) continue; // skip already streamed points
        if (i==0) { // always stream chunk 0 first
          closestIndex = 0;
          seedPoints.current.visible = false; 
          break;
        } else { // then stream the closest
          const worldPos = new THREE.Vector3(xyz.get([i,0]), xyz.get([i,1]), xyz.get([i,2]));
          const screenPos = worldPos.project(three.current.camera); // Convert to normalized screen space (-1 to 1)
          const distSq = screenPos.x*screenPos.x + screenPos.y*screenPos.y; // Distance from screen center (0,0)
          if (distSq < closestDistance) {
            closestDistance = distSq;
            closestIndex = i;
          }
        }
      }
      
      // No new chunks to load
      if (closestIndex === -1) {
        seedPoints.current.visible = false; 
        return; 
      }
      
      // or there are...
      const chunk = await source.getItem(`c${closestIndex}`) // load chunk data
      const chunkData = await chunk.get([null, null]);
      try {
        points.set([slice(streamCount,streamCount+chunkData.shape[0]), null], 
                    chunkData);
        streamed[closestIndex] = true;
      } catch (error){
        return; // happens when someone changes the URL while fetch is being called
      }

      // create new point cloud? (this is the first chunk)
      if (!densePoints.current){
        const p = points.get([null, slice(0,3)]).flatten();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(p, 3)); // N.B. this is set to proper colours later
        geometry.setDrawRange( 0, streamCount+chunkData.shape[0] );

        //const size = attrs.resolution || 0.1; // Default to 0.1 if missing
        //const material = new THREE.PointsMaterial({ 
        //  size: 3.2*size,sizeAttenuation: true, vertexColors: true });
        const material = new THREE.ShaderMaterial({
          uniforms: {
            worldSize: { value:3000*three.current.pointSize } // window.innerHeight / 2 }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
          vertexColors: true,
          //transparent: true
        });

        const cloud = new THREE.Points(geometry, material);
        cloud.userData.blockDelete=true; // don't let this be deleted.
        cloud.userData.pickable=true; // allow picking.
        colourise( cloud, points, attrs.stylesheet, activeStyle, streamCount); // set colours
        prevRGB.current = cloud.geometry.attributes.color.clone();
        three.current.scene.add(cloud);
        densePoints.current = cloud;
      } else {
        // update existing point cloud (add new points)
        const p = chunkData.get([null, slice(0,3)]).flatten();
        densePoints.current.geometry.attributes.position.array.set(p,streamCount*3);
        densePoints.current.geometry.attributes.position.needsUpdate = true; 
        densePoints.current.geometry.setDrawRange( 0, streamCount+chunkData.shape[0] );
        //densePoints.current.geometry.computeBoundingBox(); // need to update the bbox?
        densePoints.current.geometry.computeBoundingSphere(); // this is needed for picking
        densePoints.current.geometry.attributes.color = prevRGB.current; // remove highlight
        colourise( densePoints.current, points, attrs.stylesheet, activeStyle, streamCount); // compute colours for new points
        densePoints.current.geometry.attributes.color = prevRGB.current.clone(); // store now "non-highlight" colours
      }
      
      // apply highlights and masks?
      if (activeGroup){
        densePoints.current.geometry.attributes.color = prevRGB.current.clone();
        if (attrs.groups && activeGroup in attrs.groups){
          applyHighlight(densePoints.current, points, attrs.groups[activeGroup]);
        }
      }
      // sleep a bit to not hog resources, then update everything
      await new Promise(r => setTimeout(r, LOAD_INTERVAL));
      setStreamed({...streamed} ); // update streamed object
      setStreamCount(streamCount+chunkData.shape[0]); // move stream cursor
      setPoints(points); // update points object
    }
    // Load closest chunk; note that this changes the streamCount which triggers a recall
    loadClosestChunk();
  }, [points, streamCount]);

  // ** Changed Style Or Group**
  useEffect( ()=> {
      if (!densePoints.current || !attrs || !points) return;
      if (activeStyle && attrs.stylesheet[activeStyle]){
        colourise(densePoints.current, points, attrs.stylesheet, activeStyle);
        prevRGB.current = densePoints.current.geometry.attributes.color.clone();
      }
      if (attrs.groups && activeGroup && attrs.groups[activeGroup]){
        applyHighlight(densePoints.current, points, attrs.groups[activeGroup]);
      }
      densePoints.current.geometry.attributes.color.needsUpdate = true;
  }, [activeStyle] );

  // ** Changed Group **
  useEffect( ()=> {
    if (!densePoints.current || !attrs || !prevRGB.current || !points) return;
    densePoints.current.geometry.attributes.color = prevRGB.current.clone(); // restore previous colour
    if (attrs.groups && activeGroup && attrs.groups[activeGroup]){
      applyHighlight(densePoints.current, points, attrs.groups[activeGroup]);
    }
    densePoints.current.geometry.attributes.color.needsUpdate = true;
  }, [activeGroup] );

  let buttons = <></>
  let buttons2 = <></>
  if (attrs){
    buttons = attrs.styles.map((k) => {
      return <button
      className={`button ${activeStyle === k ? 'active' : ''}`}
      onClick={() => { setActiveStyle(k); }}
      key={k}> {k} </button>
    });
    if (attrs.groups){
      buttons2 = Object.keys(attrs.groups).map((k) => {
        return <button
        className={`button ${activeGroup === k ? 'active' : ''}`}
        onClick={() => {if (activeGroup === k){ // turn highlight off
                          setActiveGroup(null);
                        } else { // turn highlight on
                          setActiveGroup(k);
                        }}}
        key={k}> {k} </button>
      });
    }
  }
  if (nostream) return <div id="cloud"></div>;
  
  //attributes
  return (
      <div className="topbuttons">
        <div className="row">
          { buttons }
        </div>
        <div className="row">
          { buttons2 }
        </div>
        {(points && (streamCount == points.shape[0])) ? <div className="row">
          <button className="button" onClick={() => {
              const points = densePoints.current;
              const positions = points.geometry.attributes.position.array;
              const colors = points.geometry.attributes.color.array;

              // Create the CSV file
              let csv = 'x,y,z,r,g,b\n';
              for (let i = 0; i < positions.length; i += 3) {
                  const x = positions[i] + attrs.origin[0];
                  const y = positions[i + 1] + attrs.origin[1];
                  const z = positions[i + 2] + attrs.origin[2];
                  const r = Math.floor( colors[i]*255 );
                  const g = Math.floor( colors[i + 1]*255 );
                  const b = Math.floor( colors[i + 2]*255 );
                  csv += `${x},${y},${z},${r},${g},${b}\n`;
              }

              // Download
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'points.csv'; // Set the file name
              document.body.appendChild(a); // Append the anchor to the body
              a.click(); // Programmatically click the anchor to start the download
              document.body.removeChild(a); // Remove the anchor from the body
              URL.revokeObjectURL(url);
          }}>Cloud ⬇</button>
        </div>:<></>}
      </div>
  );
};
export default PointStream;