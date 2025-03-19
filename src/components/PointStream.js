import React, { useEffect, useRef, useState } from "react";
import { useParams } from 'react-router-dom';
import * as THREE from "three";
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { openGroup, HTTPStore, slice, NestedArray } from "zarr";
import chroma from 'chroma-js';
import './PointStream.css';

const LOAD_INTERVAL = 100; // ms to sleep between loading new chunks
const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const nostream = false; // quickly disable streaming (for dev purposes)

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

const PointStream = ({ index, annotations, setAnnotations,
                       scene, renderer, cameraRef, controlsRef, 
                       activeStyle, setActiveStyle}) => {
  const mountRef = useRef(null); // three.js mount component
  const seedPoints = useRef(null); // seeds for streaming dense point cloud
  const densePoints = useRef(null); // dense point cloud

  // point streaming state
  const [source, setSource] = useState(null);
  const [attrs, setAttrs] = useState(null);
  const [seeds, setSeeds] = useState(null); // seed points to load chunks
  const [points, setPoints] = useState(null); // streamed point array
  const [streamed, setStreamed] = useState({}); // track which chunks have been loaded
  
  const [streamCount, setStreamCount] = useState(0); // number of points already streamed
  const [currentSite, setCurrentSite] = useState('start');
  const [currentMedia, setCurrentMedia] = useState(''); // current media we are connected to

  // annotation states
  const [annotColor, setAnnotColor] = useState('#ffcd00'); // 0xffff00
  const [selection, setSelection] = useState([]);
  const spheresRef = useRef([]); // Stores annotation spheres
  const lineRef = useRef([]); // Stores annotation lines
  const planeRef = useRef([]); // Stores annotation planes

  // Setup three.js scene, renderer, camera and view controls
  useEffect(() => {
    if (nostream){ return };
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    
    // Create a new Scene
    scene.current = new THREE.Scene();

    // Initialize Renderer
    renderer.current = new THREE.WebGLRenderer({ antialias: true });
    renderer.current.setSize(width, height);
    mount.appendChild(renderer.current.domElement);

    // Initialize Camera
    cameraRef.current = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
    cameraRef.current.up.set(0, 0, 1);

    // Orbit Controls
    const controls = new OrbitControls(cameraRef.current, renderer.current.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    // Handle Resize
    const handleResize = () => {
      renderer.current.setSize(mount.clientWidth, mount.clientHeight);
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
      renderer.current.render(scene.current, cameraRef.current);
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      mount.removeChild(renderer.current.domElement);
      controls.dispose();
    };
  }, []);
  
  // handle site from URL
  const params = useParams();
  const site = index.current.synonyms[currentSite];
  useEffect(()=>{
    if (!controlsRef || !cameraRef || nostream) return; //nothing to do here
    if (params.site === currentSite) return; //nothing to do here
    const site = index.current.synonyms[params.site];
    if (site in index.current.sites){
      if (attrs && densePoints.current && points){
        colourise(densePoints.current, points, attrs.stylesheet, index.current.sites[site].view.style);
      }
      setActiveStyle(index.current.sites[site].style);
      setCurrentSite(params.site); // store that this is the current scene so we don't redraw unecessarily
      const center = new THREE.Vector3(...index.current.sites[site].view.tgt);
      cameraRef.current.position.set(...index.current.sites[site].view.pos);
      cameraRef.current.lookAt(center);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    } else if (site === 'downloadPoints'){
      console.log("TODO - download our point cloud as CSV");
    }
  },[params, currentSite]);

  // Handle click and key events
  useEffect(() => {
    if (!renderer || !cameraRef || nostream) return;

    const getIntersects = ( event ) => {
      const rect = renderer.current.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      return raycaster.intersectObjects(scene.current.children, true)
    }

    const handleSingleClick = (event) => {
      if (!event.shiftKey) return; // Only if Shift is held
      const intersects = getIntersects(event);
      if (intersects.length > 0) {
        const selectedPoint = intersects[0].point.clone();
        selection.push(selectedPoint)
        setSelection([ ...selection ]); // update selection
      }
    };

    const handleDoubleClick = (event) => {
      const intersects = getIntersects(event);

      if (intersects.length > 0) {
        const selectedObject = intersects[0].object; // clicked object
        const selectedPoint = intersects[0].point;
        // set center of rotation
        if (seedPoints.current && (seedPoints.current === selectedObject)) {
          controlsRef.current.target.copy(selectedPoint);
          controlsRef.current.update();
        } else if (densePoints.current && (densePoints.current === selectedObject)) {
          controlsRef.current.target.copy(selectedPoint);
          controlsRef.current.update();
        } else {
          // remove clicked element from annotations array (based on position)
          if (selectedObject.userData.annot){
            ['lines','planes','traces'].forEach( (n) => {
              annotations[n]=annotations[n].filter( (l) => {
                return !l.verts[0].equals(selectedObject.userData.annot.verts[0]);
              });
            } );
            setAnnotations({...annotations}); // N.B. this then triggers a redraw that removes the annotation from the scene :-) 
          }
        }
      }
    };
    // keydown events
    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        const newAnnot = {...annotations};

        // add geometry to annotations
        if (selection.length === 2) {
          const v1 = selection[0];
          const v2 = selection[1];
          const direction = new THREE.Vector3().subVectors(v2, v1).normalize();
          let trend = (Math.atan2(direction.x, direction.y) * 180) / Math.PI;
          let plunge = (Math.asin(direction.z) * 180) / Math.PI;
          if (plunge < 0){
            plunge = -plunge;
            trend = trend - 180; }
          const distance = v1.distanceTo(v2);
          newAnnot.lines.push({
            verts: [v1, v2],
            color: annotColor,
            trend: trend < 0 ? trend + 360 : trend,
            plunge,
            length: distance,
          });
        } else if (selection.length === 3) {
          const v1 = selection[0];
          const v2 = selection[1];
          const v3 = selection[2];
          const normal = new THREE.Vector3()
            .crossVectors(new THREE.Vector3().subVectors(v2, v1), new THREE.Vector3().subVectors(v3, v1))
            .normalize();
          const dip = (Math.acos(Math.abs(normal.z)) * 180) / Math.PI;
          let strike = (Math.atan2(normal.x, normal.y) * 180) / Math.PI;
          if (strike < 0) strike += 360;
          const dipdir = (strike + 90) % 360;
          newAnnot.planes.push({
            verts: [v1, v2, v3],
            color: annotColor,
            strike,
            dip,
            dipdir,
          });
        } else if (selection.length > 3) {
          let totalLength = 0;
          for (let i = 0; i < selection.length - 1; i++) {
            totalLength += selection[i].distanceTo(selection[i + 1]);
          }
          newAnnot.traces.push({
            verts: [...selection],
            color: annotColor,
            length: totalLength,
          });
        }
        setAnnotations(newAnnot);
        setSelection([]); // clear selection
      } else if (event.key === 'Escape'){
        setSelection([]); // clear selection
      }
    };
    document.addEventListener("keydown", handleKeyDown, false);
    renderer.current.domElement.addEventListener("dblclick", handleDoubleClick);
    renderer.current.domElement.addEventListener("click", handleSingleClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      renderer.current.domElement.removeEventListener("dblclick", handleDoubleClick);
      renderer.current.domElement.removeEventListener("click", handleSingleClick);
    };
  }, [selection]);
  
  // Load seeds (chunk centers) and draw them
  useEffect(()=> {
    if (!controlsRef.current || !cameraRef.current || nostream) return;
    const url = index.current.sites[ site ].mediaURL;
    if (url === currentMedia) return; // nothing to do here
    console.log(`Loading cloud from ${url}`);
    async function loadZarr() {
      try {
        // connect to zarr object
        const zGroup = await openGroup(new HTTPStore( url )); // dataset
        const zCenters = await zGroup.getItem("chunk_centers"); // chunk centers array
        const seeds = await zCenters.get([null, null]); // chunk centers data
        setSource(zGroup); // store zarr group for later access (during streaming)
        setSeeds(seeds); // store seed data

        // get zarr attributes (these contain important metadata)
        const attributes = await zGroup.attrs.asObject();
        setAttrs(attributes); // store these for later :-)
        setActiveStyle(attributes.styles[0]);
        
        // initialise arrays that will hold our dense points
        setPoints(new NestedArray(null, [attributes.total,seeds.shape[1]],'<f4'));
        
        // add seed points to scene
        const geometry = new THREE.BufferGeometry();
        const xyz = seeds.get([null, slice(0,3)]).flatten();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        
        // add seed points element
        if (seedPoints.current) { scene.current.remove(seedPoints.current); }
        const material = new THREE.PointsMaterial({
          size: 2, vertexColors: false, sizeAttenuation: true });
        const points = new THREE.Points(geometry, material);
        scene.current.add(points);
        seedPoints.current = points;
    
        // Adjust Camera
        const site = params.site;
        let center = new THREE.Vector3();
        let pos;
        if (site in index.current.sites){
          center = new THREE.Vector3(...index.current.sites[site].view.tgt);
          pos = index.current.sites[site].view.pos;
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
    setCurrentMedia( url );
  }, [])

  // **Lazy Loading Closest Chunk**
  useEffect(() => {
    if (!cameraRef || !seeds || !source || !points || nostream) return;

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
        scene.current.add(cloud);
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

  // ** Draw annotations **
  useEffect(()=>{
    if (nostream){ return };

    // clear annotations
    [spheresRef, lineRef, planeRef].forEach( (ref)=>{
      ref.current.forEach((obj) => {
        scene.current.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
    })});

    spheresRef.current = [];
    
    // Add a yellow sphere to highlight selected points
    if (attrs){
      const size = attrs.resolution || 0.1; // Default to 0.1 if missing
      const sphereGeometry = new THREE.SphereGeometry(size*3, 16, 16);
      selection.forEach((point)=>{
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(point);
        scene.current.add(sphere);
        spheresRef.current.push(sphere);
      });
    }

    // add current line, plane or polyline
    if (selection.length === 2) {
      drawLine({verts:[selection[0], selection[1]], color:annotColor});
    } else if (selection.length === 3) {
      drawPlane({verts:[selection[0], selection[1], selection[2]], color:annotColor});
    } else if (selection.length > 3){
      drawLine({verts:selection, color:annotColor});
    }

    // add annotation lines / planes / polylines
    annotations.lines.forEach( (l) => { drawLine(l) } );
    annotations.planes.forEach( (l) => { drawPlane(l) } );
    annotations.traces.forEach( (l) => { drawLine(l) } );
  }, [selection, attrs, annotations, annotColor]);

  // **Function to Draw a Line Between Two Points**
  const drawLine = (points) => {
    if (lineRef.current) scene.current.remove(lineRef.current); // Remove old line if exists
    const geometry = new LineGeometry();//.setFromPoints([point1, point2]);
    const v = [];
    points.verts.forEach( (p) => {v.push(p.x);v.push(p.y);v.push(p.z);} );
		geometry.setPositions(v);
    const colour = points.color ? points.color : 0xffff00;
    const lineMaterial = new LineMaterial({ color: colour, linewidth: 5, vertexColors: false });
    const line = new Line2(geometry, lineMaterial);
    line.userData = {annot:points};
    scene.current.add(line);
    lineRef.current.push(line);
  };
  
  // **Function to Draw a Plane Defined by Three Points**
  const drawPlane = (points) => {
    // compute plane orientation
    if (planeRef.current) scene.current.remove(planeRef.current); // Remove old plane if exists
    const colour = points.color ? points.color : 0xffff00;
    const material = new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const normal = new THREE.Vector3(); // Compute normal for plane orientation
    const [point1, point2, point3] = points.verts;
    const v1 = new THREE.Vector3().subVectors(point2, point1);
    const v2 = new THREE.Vector3().subVectors(point3, point1);
    normal.crossVectors(v1, v2).normalize();
    
    // add disk
    const geometry = new THREE.CircleGeometry( Math.max(v1.length(), v2.length())/2, 32 ); 
    const plane = new THREE.Mesh(geometry, material); // Set plane orientation
    plane.position.copy(new THREE.Vector3().addVectors(point1, point2).add(point3).divideScalar(3));
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    plane.setRotationFromQuaternion(quaternion);
    plane.userData = {annot:points}; // needed to flag when objects are deleted
    scene.current.add(plane);
    planeRef.current.push(plane);
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
    buttons.push(<input
      type="color"
      key="cols"
      value={annotColor}
      onChange={(e)=>{setAnnotColor(e.target.value)}}
      style={{ width: '36px', height: '26px',
        border: 'none', padding: '0', background: 'none', cursor: 'pointer' }}
    />);
  }
  if (nostream) return <div className="viewer" ref={mountRef} style={{ height: "100%", width: "100%" }} />
  
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