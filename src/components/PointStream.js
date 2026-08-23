import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { openGroup, HTTPStore, slice, NestedArray } from "zarr";
import chroma from 'chroma-js';
import { disposeAndRemove } from './dispose3d';
import './ThreeScene.css';

const LOAD_INTERVAL = 100; // ms to sleep between loading new chunks
const nostream = false; // quickly disable streaming (for dev purposes)
const LUT_SIZE = 256;

// zarr NestedArray stores rank>1 data as TypedArray[] (one row each), not a
// single buffer. flatten() is the supported way to get xyz as a contiguous array.
function nestedFloats(arr) {
  if (!arr) return null;
  if (arr instanceof Float32Array) return arr;
  const flat = typeof arr.flatten === 'function' ? arr.flatten() : arr;
  if (flat instanceof Float32Array) return flat;
  return Float32Array.from(flat);
}

function scalarAt(array, i, band) {
  const data = array && array.data;
  if (Array.isArray(data) && data[i]) return data[i][band];
  if (data && data.BYTES_PER_ELEMENT) {
    return data[i * ((array.shape && array.shape[1]) || 1) + band];
  }
  return array.get([i, band]);
}

function matches(iq, v, thresh) {
  if (iq === '=') return v === thresh;
  if (iq === '<') return v <= thresh;
  if (iq === '>') return v >= thresh;
  if (iq === '!=') return v !== thresh;
  return false;
}

function copyRange(dst, src, offset, n) {
  dst.set(src.subarray(offset * 3, n * 3), offset * 3);
}

// recompute a point cloud colour array from the source
// (typically using a different visualisation style)
function colourise(cloud, array, settings = null, key = null, offset=0, baseColor=null){
  // parse colour mapping settings
  //let value = { 'R': [3, 0, 1], 'G': [4, 0, 1], 'B': [5, 0, 1] }; // default RGB mapping
  let value = {color:[2, {limits:[-100, 100, 25], scale:'viridis'}]};
  if (settings){
    if (key in settings) {
      value = settings[key];
    }
  }
  const n = cloud.geometry.drawRange.count; // number of points to colour
  const dest = baseColor || cloud.geometry.attributes.color.array;

  if (Array.isArray(value.color)) {
      // Case 1: Colour ramp visualisation (scalar mapping)
      const [index, options] = value.color;
      const vmin = options.limits[0];
      const vmax = options.limits[1];
      const span = (vmax - vmin) || 1;
      const domain = chroma.limits([vmin, vmax], 'e', options.limits[2]);
      const scale = chroma.scale(options.scale).domain(domain);
      const lut = new Float32Array(LUT_SIZE * 3);
      for (let li = 0; li < LUT_SIZE; li++){
        const sample = vmin + span * (li / (LUT_SIZE - 1));
        const rgb = scale(sample).rgb();
        lut[li * 3] = rgb[0] / 255;
        lut[li * 3 + 1] = rgb[1] / 255;
        lut[li * 3 + 2] = rgb[2] / 255;
      }
      const last = LUT_SIZE - 1;
      for (let i = offset; i < n; i++){
        const t = (scalarAt(array, i, index) - vmin) / span;
        const li = t <= 0 ? 0 : t >= 1 ? last : (t * last + 0.5) | 0;
        const o = i * 3;
        dest[o] = lut[li * 3];
        dest[o + 1] = lut[li * 3 + 1];
        dest[o + 2] = lut[li * 3 + 2];
      }
  } else {
      // Case 2: Ternary mapping (R, G, B)
      const rMap = value.color['R'];
      const gMap = value.color['G'];
      const bMap = value.color['B'];
      const [ix0, ix1, ix2] = [rMap[0], gMap[0], bMap[0]];
      const rs = 1 / ((rMap[2] - rMap[1]) || 1);
      const gs = 1 / ((gMap[2] - gMap[1]) || 1);
      const bs = 1 / ((bMap[2] - bMap[1]) || 1);
      for (let i = offset; i < n; i++){
        const o = i * 3;
        dest[o]     = (scalarAt(array, i, ix0) - rMap[1]) * rs;
        dest[o + 1] = (scalarAt(array, i, ix1) - gMap[1]) * gs;
        dest[o + 2] = (scalarAt(array, i, ix2) - bMap[1]) * bs;
      }
  }
  if (baseColor) {
    copyRange(cloud.geometry.attributes.color.array, baseColor, offset, n);
  }
  cloud.geometry.attributes.color.needsUpdate = true;
}

// define function to highlight points
const applyHighlight = (cloud, array, group, offset=0) => {
  const n = cloud.geometry.drawRange.count; // number of points to change colour
  const colors = cloud.geometry.attributes.color.array;
  // function for highlighting stuff
  const c2 = group.color || [1,1,0];
  const f = group.blend || 0.5;
  const inv = 1 - f;

  // update colours to include the highlight
  if (group.iq){
    const [index,iq,thresh] = group.iq;
    for (let i = offset; i < n; i++){
      const o = i * 3;
      const v = scalarAt(array, i, index);
      if (matches(iq, v, thresh)) {
        colors[o]     = colors[o] * inv + c2[0] * f;
        colors[o + 1] = colors[o + 1] * inv + c2[1] * f;
        colors[o + 2] = colors[o + 2] * inv + c2[2] * f;
      }
    }
  }

  // mask points if needed
  if (group.mask){
    const [index,iq,thresh] = group.mask;
    for (let i = offset; i < n; i++){
      const v = scalarAt(array, i, index);
      if (matches(iq, v, thresh)) {
        const o = i * 3;
        colors[o] = 0;
        colors[o + 1] = 0;
        colors[o + 2] = 0;
      }
    }
  }

  cloud.geometry.attributes.color.needsUpdate = true;
}

function restoreBaseColors(cloud, baseColor) {
  if (!cloud || !baseColor) return;
  const n = cloud.geometry.drawRange.count;
  copyRange(cloud.geometry.attributes.color.array, baseColor, 0, n);
  cloud.geometry.attributes.color.needsUpdate = true;
}

function applyCurrentStyle(cloud, points, attrs, style, group, offset, baseColor) {
  if (!cloud || !points || !attrs) return;
  colourise(cloud, points, attrs.stylesheet, style, offset, baseColor);
  if (group && attrs.groups && group in attrs.groups) {
    applyHighlight(cloud, points, attrs.groups[group], offset);
  }
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

  // point streaming (refs so each chunk does not re-render React)
  const sourceRef = useRef(null);
  const seedsRef = useRef(null);
  const pointsRef = useRef(null);
  const attrsRef = useRef(null);
  const streamedRef = useRef({});
  const streamCountRef = useRef(0);
  const baseColorRef = useRef(null);
  const activeStyleRef = useRef(null);
  const activeGroupRef = useRef(null);

  // styling / UI
  const [attrs, setAttrs] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null); // selected highlights
  const [activeStyle, setActiveStyle] = useState(null);
  const [streamDone, setStreamDone] = useState(false);

  activeStyleRef.current = activeStyle;
  activeGroupRef.current = activeGroup;

  // apply per-site default style / group (including same-cloud site changes)
  useEffect(() => {
    if (!tour.sites[site] || !tour.sites[site].view) return;
    if (tour.sites[site].view.style) setActiveStyle(tour.sites[site].view.style);
    if (tour.sites[site].view.group) setActiveGroup(tour.sites[site].view.group);
  }, [site]);

  // Load seeds and stream chunks without per-chunk setState
  useEffect(()=> {
    if (!init || nostream ) return;
    if (sourceRef.current && sourceRef.current.store.url === currentMedia) return;

    let cancelled = false;
    const controller = new AbortController();
    console.log(`Loading cloud for ${site} from from ${currentMedia}`);

    async function loadZarr() {
      try {
        // connect to zarr object (signal aborts in-flight chunk fetches on site change)
        const zGroup = await openGroup(new HTTPStore( currentMedia, {
          fetchOptions: { signal: controller.signal }
        })); // dataset
        if (cancelled) return;
        const zCenters = await zGroup.getItem("chunk_centers"); // chunk centers array
        const seeds = await zCenters.get([null, null]); // chunk centers data
        if (cancelled) return;
        console.log(`Cloud containts points with shape ${seeds.shape}`)
        sourceRef.current = zGroup;
        seedsRef.current = seeds;
        console.log(zGroup.store.url);

        // get zarr attributes (these contain important metadata)
        const attributes = await zGroup.attrs.asObject();
        if (cancelled) return;
        attrsRef.current = attributes;
        setAttrs(attributes);
        setStreamDone(false);
        if (!(tour.sites[site].view && tour.sites[site].view.style)) {
          setActiveStyle(attributes.styles[0]);
          activeStyleRef.current = attributes.styles[0];
        }
        three.current.origin = attributes.origin; // update origin (not needed, just in case)
        three.current.pointSize =  tour.sites[site].pointSize || attributes.resolution; // update point size (very much needed)
        console.log("Cloud attributes are:");
        console.log(attributes);

        // add seed points to scene
        const geometry = new THREE.BufferGeometry();
        const xyz = nestedFloats(seeds.get([null, slice(0,3)]));
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        
        // initialise arrays that will hold our dense points
        pointsRef.current = new NestedArray(null, [attributes.total,seeds.shape[1]],'<f4');
        streamedRef.current = {};
        streamCountRef.current = 0;
        baseColorRef.current = null;
        if (seedPoints.current) { disposeAndRemove(three.current.scene, seedPoints.current); seedPoints.current=null;}
        if (densePoints.current) { disposeAndRemove(three.current.scene, densePoints.current); densePoints.current=null;}
        const material = new THREE.PointsMaterial({
            size: 2, vertexColors: false, sizeAttenuation: true });
        const seedCloud = new THREE.Points(geometry, material);
        three.current.scene.add(seedCloud);
        seedPoints.current = seedCloud;
    
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
        if (three.current.invalidate) three.current.invalidate();

        while (!cancelled) {
          const loaded = await loadClosestChunk(cancelled);
          if (!loaded) break;
          await new Promise(r => setTimeout(r, LOAD_INTERVAL));
        }
        if (!cancelled && pointsRef.current &&
            streamCountRef.current === pointsRef.current.shape[0]) {
          setStreamDone(true);
        }
      } catch (error) {
        if (cancelled || (error && error.name === 'AbortError')) return;
        console.error("Error loading Zarr dataset:", error);
      }
    }

    const loadClosestChunk = async (cancelled) => {
      const seeds = seedsRef.current;
      const source = sourceRef.current;
      const points = pointsRef.current;
      const attributes = attrsRef.current;
      if (!three.current.camera || !seeds || !source || !points || !seedPoints.current) return false;

      // Find the closest chunk to the screen center (target of view)
      let closestIndex = -1;
      let closestDistance = Infinity;
      const xyz = seeds.get([null, slice(0,3)]);
      const streamed = streamedRef.current;
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
        return false; 
      }
      
      const chunk = await source.getItem(`c${closestIndex}`) // load chunk data
      if (cancelled) return false;
      const chunkData = await chunk.get([null, null]);
      if (cancelled) return false;
      const streamCount = streamCountRef.current;
      try {
        points.set([slice(streamCount,streamCount+chunkData.shape[0]), null], 
                    chunkData);
        streamed[closestIndex] = true;
      } catch (error){
        return false; // happens when someone changes the URL while fetch is being called
      }

      const chunkXYZ = nestedFloats(chunkData.get([null, slice(0,3)]));
      const nextCount = streamCount + chunkData.shape[0];

      // create new point cloud? (this is the first chunk)
      if (!densePoints.current){
        const positions = new Float32Array(attributes.total * 3);
        const colors = new Float32Array(attributes.total * 3);
        positions.set(chunkXYZ, 0);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.setDrawRange( 0, nextCount );
        geometry.computeBoundingSphere();

        const material = new THREE.ShaderMaterial({
          uniforms: {
            worldSize: { value:2000*three.current.pointSize } // window.innerHeight / 2 }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
          vertexColors: true,
        });

        const cloud = new THREE.Points(geometry, material);
        cloud.userData.blockDelete=true; // don't let this be deleted.
        cloud.userData.pickable=true; // allow picking.
        baseColorRef.current = new Float32Array(attributes.total * 3);
        applyCurrentStyle(cloud, points, attributes, activeStyleRef.current, activeGroupRef.current, streamCount, baseColorRef.current);
        three.current.scene.add(cloud);
        densePoints.current = cloud;
      } else {
        // update existing point cloud (add new points)
        densePoints.current.geometry.attributes.position.array.set(chunkXYZ, streamCount*3);
        densePoints.current.geometry.attributes.position.needsUpdate = true; 
        densePoints.current.geometry.setDrawRange( 0, nextCount );
        densePoints.current.geometry.computeBoundingSphere(); // this is needed for picking
        applyCurrentStyle(densePoints.current, points, attributes, activeStyleRef.current, activeGroupRef.current, streamCount, baseColorRef.current);
      }

      streamCountRef.current = nextCount;
      if (three.current.invalidate) three.current.invalidate();
      return true;
    }

    loadZarr();
    return () => {
      cancelled = true;
      controller.abort();
      disposeAndRemove(three.current.scene, seedPoints.current);
      disposeAndRemove(three.current.scene, densePoints.current);
      seedPoints.current = null;
      densePoints.current = null;
      sourceRef.current = null;
      seedsRef.current = null;
      pointsRef.current = null;
      baseColorRef.current = null;
      attrsRef.current = null;
      setAttrs(null);
      setStreamDone(false);
    };
  }, [init, currentMedia])

  // ** Changed Style **
  useEffect( ()=> {
      if (!densePoints.current || !attrsRef.current || !pointsRef.current) return;
      applyCurrentStyle(densePoints.current, pointsRef.current, attrsRef.current, activeStyle, activeGroup, 0, baseColorRef.current);
      if (three.current.invalidate) three.current.invalidate();
  }, [activeStyle] );

  // ** Changed Group **
  useEffect( ()=> {
    if (!densePoints.current || !attrsRef.current || !baseColorRef.current || !pointsRef.current) return;
    restoreBaseColors(densePoints.current, baseColorRef.current);
    if (attrsRef.current.groups && activeGroup && attrsRef.current.groups[activeGroup]){
      applyHighlight(densePoints.current, pointsRef.current, attrsRef.current.groups[activeGroup]);
    }
    if (three.current.invalidate) three.current.invalidate();
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
        {streamDone ? <div className="row">
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
