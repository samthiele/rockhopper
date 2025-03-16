import React, { useEffect, useRef, useState } from "react";
import { useParams } from 'react-router-dom';
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { openGroup, HTTPStore, slice, NestedArray } from "zarr";
import chroma from 'chroma-js';
import './PointStream.css';

const LOAD_INTERVAL = 100; // ms to sleep between loading new chunks

// recompute a point cloud colour array from the source
// (typically using a different visualisation style)
function colourise(cloud, array, settings = null, key = null, offset=0){
  // parse colour mapping settings
  //let value = { 'R': [3, 0, 1], 'G': [4, 0, 1], 'B': [5, 0, 1] }; // default RGB mapping
  let value = [2, {limits:[-100, 100, 25], scale:'viridis'}]
  if (settings){
    if (key in settings) {
      value = settings[key];
    }
  }
  const n = cloud.geometry.drawRange.count; // number of points to colour
  if (Array.isArray(value)) {
      // Case 1: Colour ramp visualisation (scalar mapping)
      const [index, options] = value;
      const v = array.get([slice(offset,n), index]);

      // Compute limits using chroma.limits
      const domain = chroma.limits([options.limits[0],options.limits[1]], 'e', options.limits[2]);
      const scale = chroma.scale(options.scale).domain(domain);

      // update cloud colour array
      for (let i = offset; i < n; i++){
        const color = scale(v.get([i-offset])).rgb();
        cloud.geometry.attributes.color.array.set(
          [color[0]/255,color[1]/255,color[2]/255], i*3 );
      }
  } else {
      // Case 2: Ternary mapping (R, G, B)
      const r = array.get([slice(offset,n), value['R'][0]]);
      const g = array.get([slice(offset,n), value['G'][0]]);
      const b = array.get([slice(offset,n), value['B'][0]]);
      for (let i = offset; i < n; i++){
        // update cloud colour array
        cloud.geometry.attributes.color.array.set(
          [(r.get([i-offset]) - value['R'][1])/(value['R'][2] - value['R'][1]),
           (g.get([i-offset]) - value['G'][1])/(value['G'][2] - value['G'][1]),
           (b.get([i-offset]) - value['B'][1])/(value['B'][2] - value['B'][1])], i*3 );
      }
  }
  // flag that updates are needed
  cloud.geometry.attributes.color.needsUpdate = true;
}

const PointStream = ({ index }) => {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);  
  const cameraRef = useRef(null);  
  const seedPoints = useRef(null);
  const densePoints = useRef(null);
  const selectedPointsRef = useRef([]); // Stores selected points
  const spheresRef = useRef([]); // Stores spheres for visualization
  const lineRef = useRef(null); // Stores the line
  const planeRef = useRef(null); // Stores the plane

  // three.js components
  const [scene] = useState(new THREE.Scene());
  const [renderer, setRenderer] = useState(null);

  // point streaming state
  const [source, setSource] = useState(null);
  const [attrs, setAttrs] = useState(null);
  const [seeds, setSeeds] = useState(null); // seed points to load chunks
  const [points, setPoints] = useState(null); // streamed point array
  const [streamed, setStreamed] = useState({}); // track which chunks have been loaded
  const [streamCount, setStreamCount] = useState(0); // number of points already streamed

  // visualisation properties
  const [activeStyle, setActiveStyle] = useState(null);

  // Setup three.js scene, renderer, camera and view controls
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Initialize Renderer
    const newRenderer = new THREE.WebGLRenderer({ antialias: true });
    newRenderer.setSize(width, height);
    mount.appendChild(newRenderer.domElement);
    setRenderer(newRenderer);

    // Initialize Camera
    const newCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
    newCamera.up.set(0, 0, 1);
    cameraRef.current = newCamera; // update reference 

    // Orbit Controls
    const controls = new OrbitControls(newCamera, newRenderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    // Handle Resize
    const handleResize = () => {
      newRenderer.setSize(mount.clientWidth, mount.clientHeight);
      cameraRef.current.aspect = mount.clientWidth / mount.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      controlsRef.current.update();
    };
    window.addEventListener("resize", handleResize);

    // Animation loop
    const animate = () => {
      // render
      requestAnimationFrame(animate);
      controls.update();
      newRenderer.render(scene, newCamera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      mount.removeChild(newRenderer.domElement);
      controls.dispose();
    };
  }, []);
  
  // handle site from URL
  const params = useParams();
  useEffect(()=>{
    if (!controlsRef || !cameraRef) return;
    const site = params.site;
    if (site in index.sites){
      const center = new THREE.Vector3(...index.sites[site].tgt);
      cameraRef.current.position.set(...index.sites[site].pos);
      cameraRef.current.lookAt(center);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    } else if (site === 'downloadPoints'){
      console.log("TODO - download our point cloud as CSV");
    }
  },[cameraRef, controlsRef, renderer, scene, params]);

  // Handle click events
  useEffect(() => {
    if (!renderer || !cameraRef || !scene) return;

    const getIntersects = ( event ) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      return raycaster.intersectObjects(scene.children, true)
    }
    const handleSingleClick = (event) => {
      if (!event.shiftKey) return; // Only if Shift is held
      const intersects = getIntersects(event);
      if (intersects.length > 0) {
        const selectedPoint = intersects[0].point;

        // Add a yellow sphere to highlight the point
        const sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(selectedPoint);
        scene.add(sphere);
        spheresRef.current.push(sphere);

        // Store the selected point
        selectedPointsRef.current.push(selectedPoint);

        // Update visualizations
        if (selectedPointsRef.current.length === 2) {
          drawLine(selectedPointsRef.current[0], selectedPointsRef.current[1]);
        } else if (selectedPointsRef.current.length === 3) {
          drawPlane(selectedPointsRef.current[0], selectedPointsRef.current[1], selectedPointsRef.current[2]);
        }
      }
    };

    const handleDoubleClick = (event) => {
      const intersects = getIntersects(event);
      if (intersects.length > 0) {
        const selectedPoint = intersects[0].point;
        controlsRef.current.target.copy(selectedPoint);
        controlsRef.current.update();
      }
    };

    renderer.domElement.addEventListener("dblclick", handleDoubleClick);
    renderer.domElement.addEventListener("click", handleSingleClick);
    return () => {
      renderer.domElement.removeEventListener("dblclick", handleDoubleClick);
      renderer.domElement.removeEventListener("click", handleSingleClick);
    };
  }, [renderer, cameraRef, scene]);
  
  // Load seeds (chunk centers) and draw them
  useEffect(()=> {
    if (!controlsRef || !cameraRef.current) return;
    async function loadZarr() {
      try {
        // connect to zarr object
        const zGroup = await openGroup(new HTTPStore( index.mediaURL )); // dataset
        const zCenters = await zGroup.getItem("chunk_centers"); // chunk centers array
        const seeds = await zCenters.get([null, null]); // chunk centers data
        setSource(zGroup); // store zarr group for later access (during streaming)
        setSeeds(seeds); // store seed data

        // get zarr attributes (these contain important metadata)
        const attributes = await zGroup.attrs.asObject();
        //attributes.stylesheet.illu[0] = 6;
        setAttrs(attributes); // store these for later :-)
        setActiveStyle(attributes.styles[0]);
        //console.log(attributes);
        
        // initialise arrays that will hold our dense points
        setPoints(new NestedArray(null, [attributes.total,seeds.shape[1]],'<f4'));
        
        // add seed points to scene
        const geometry = new THREE.BufferGeometry();
        const xyz = seeds.get([null, slice(0,3)]).flatten();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        
        // add seed points element
        if (seedPoints.current) { scene.remove(seedPoints.current); }
        const material = new THREE.PointsMaterial({
          size: 2, vertexColors: false, sizeAttenuation: true });
        const points = new THREE.Points(geometry, material);
        scene.add(points);
        seedPoints.current = points;
    
        // Adjust Camera
        const site = params.site;
        let center = new THREE.Vector3();
        let pos;
        if (site in index.sites){
          center = new THREE.Vector3(...index.sites[site].tgt);
          pos = index.sites[site].pos
        } else {
          bbox.getCenter(center);
          const size = bbox.getSize(new THREE.Vector3()).length();
          const maxDistance = size * 2;
          cameraRef.current.far = maxDistance * 5;
          pos = [center.x, center.y-maxDistance/3, center.z+maxDistance/3];
        }
        cameraRef.current.updateProjectionMatrix();
        cameraRef.current.position.set(...pos);
        cameraRef.current.lookAt(center);
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      } catch (error) {console.error("Error loading Zarr dataset:", error);}
    }
    loadZarr();

  }, [renderer, cameraRef, scene])

  // **Lazy Loading Closest Chunk**
  useEffect(() => {
    if (!cameraRef || !seeds || !source || !points) return;

    const loadClosestChunk = async () => {
      const camPos = new THREE.Vector3();
      cameraRef.current.getWorldPosition(camPos);

      // Find the closest chunk to the screen center (target of view)
      let closestIndex = -1;
      let closestDistance = Infinity;
      const xyz = seeds.get([null, slice(0,3)]);
      for (let i=0; i<seeds.shape[0]; i++){
        if (streamed[i]) continue; // skip already streamed points
        const worldPos = new THREE.Vector3(xyz.get([i,0]), xyz.get([i,1]), xyz.get([i,2]));
        const screenPos = worldPos.project(cameraRef.current); // Convert to normalized screen space (-1 to 1)
        const distSq = screenPos.x*screenPos.x + screenPos.y*screenPos.y; // Distance from screen center (0,0)
        if (distSq < closestDistance) {
          closestDistance = distSq;
          closestIndex = i;
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
      points.set([slice(streamCount,streamCount+chunkData.shape[0]), null], 
                  chunkData);
      streamed[closestIndex] = true;
      
      // create new point cloud? (this is the first chunk)
      if (!densePoints.current){
        const p = points.get([null, slice(0,3)]).flatten();
        //const c = points.get([null, slice(3,6)]).flatten();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(p, 3)); // N.B. this is set to proper colours later
        geometry.setDrawRange( 0, streamCount+chunkData.shape[0] );

        const size = attrs.resolution || 0.1; // Default to 0.1 if missing
        const material = new THREE.PointsMaterial({ 
          size: 3.2*size,sizeAttenuation: true, vertexColors: true });
        
        const cloud = new THREE.Points(geometry, material);
        colourise( cloud, points, attrs.stylesheet, activeStyle, streamCount); // set colours
        scene.add(cloud);
        densePoints.current = cloud;
      } else {
        // update existing point cloud (add new points)
        const p = chunkData.get([null, slice(0,3)]).flatten();
        densePoints.current.geometry.attributes.position.array.set(p,streamCount*3);
        densePoints.current.geometry.attributes.position.needsUpdate = true; 
        densePoints.current.geometry.setDrawRange( 0, streamCount+chunkData.shape[0] );
        //densePoints.current.geometry.computeBoundingBox(); // need to update the bbox?
        densePoints.current.geometry.computeBoundingSphere(); // this is needed for picking
        colourise( densePoints.current, points, attrs.stylesheet, activeStyle, streamCount);
      }
      
      // sleep a bit to not hog resources, then update everything
      await new Promise(r => setTimeout(r, LOAD_INTERVAL));
      setStreamed({...streamed} ); // update streamed object
      setStreamCount(streamCount+chunkData.shape[0]); // move stream cursor
      setPoints(points); // update points object
    }
    // Load closest chunk; note that this changes the streamCount which triggers a recall
    loadClosestChunk();
  }, [seeds, points, streamCount]);

  // **Function to Draw a Line Between Two Points**
  const drawLine = (point1, point2) => {
    if (lineRef.current) scene.remove(lineRef.current); // Remove old line if exists

    const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
    const geometry = new THREE.BufferGeometry().setFromPoints([point1, point2]);
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    lineRef.current = line;
  };
  
  // **Function to Draw a Plane Defined by Three Points**
  const drawPlane = (point1, point2, point3) => {
    if (planeRef.current) scene.remove(planeRef.current); // Remove old plane if exists

    const geometry = new THREE.PlaneGeometry(10, 10);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });

    // Compute normal for plane orientation
    const normal = new THREE.Vector3();
    const v1 = new THREE.Vector3().subVectors(point2, point1);
    const v2 = new THREE.Vector3().subVectors(point3, point1);
    normal.crossVectors(v1, v2).normalize();

    // Set plane orientation
    const plane = new THREE.Mesh(geometry, material);
    plane.position.copy(point1);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    plane.setRotationFromQuaternion(quaternion);

    scene.add(plane);
    planeRef.current = plane;
  };

  let buttons = <></>
  if (attrs){
    buttons = attrs.styles.map((k) => {
      return <button
      className={`button ${activeStyle === k ? 'active' : ''}`}
      onClick={() => {setActiveStyle(k); 
                      colourise(densePoints.current, points, attrs.stylesheet, k); }}
      key={k}> {k} </button>
    });
  }

  //attributes
  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <div className="buttons">
        <div className="row">
          { buttons }
        </div>
      </div>
      <div className="viewer" ref={mountRef} style={{ height: "100%", width: "100%" }} />
      </div>
  );
};
export default PointStream;