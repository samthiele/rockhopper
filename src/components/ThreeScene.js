import React, { useEffect, useRef, useState } from 'react';
import * as THREE from "three";
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import './ThreeScene.css';

const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });

const download = (text, filename, type) => {
    // build a blob ready to download
    const blob = new Blob([text], { type: type }); // Create a Blob from the JSON string
    const url = URL.createObjectURL(blob); // Create a URL for the Blob

    // Create a temporary anchor element to trigger the download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename; // Set the file name
    document.body.appendChild(a); // Append the anchor to the body
    a.click(); // Programmatically click the anchor to start the download
    document.body.removeChild(a); // Remove the anchor from the body

    // Revoke the object URL to free up memory
    URL.revokeObjectURL(url);
}
const ThreeScene = ({ tour, site, three, annotations, setAnnotations,
                        fixCamera, init, setInit, currentMedia }) => {
    const mountRef = useRef(null);
                            
    // annotation states
    const [annotColor, setAnnotColor] = useState('#ffcd00'); // 0xffff00
    const [annotVis, setAnnotVis] = useState(true); // view or hide annotations
    const [labelVis, setLabelVis] = useState(true); // view or hide annotations
    const [selection, setSelection] = useState([]);
    
    const spheresRef = useRef([]); // Stores annotation spheres
    const lineRef = useRef([]); // Stores annotation lines
    const planeRef = useRef([]); // Stores annotation lines
    const labelRef = useRef([]); // Stores label elements
    
    // SETUP THREE.JS SCENE
    useEffect(() => {        
        // Initialize Renderer
        const mount = mountRef.current;
        const width = mount.clientWidth;
        const height = mount.clientHeight;
        three.current.renderer = new THREE.WebGLRenderer({ antialias: true });
        three.current.renderer.setSize(width, height);
        mount.appendChild(three.current.renderer.domElement);

        // Initialize CSS2DRenderer
        three.current.labelRenderer = new CSS2DRenderer();
        three.current.labelRenderer.setSize(width, height);
        three.current.labelRenderer.domElement.style.position = 'absolute';
        three.current.labelRenderer.domElement.style.top = '0px';
        three.current.labelRenderer.domElement.style.pointerEvents = 'none';
        mount.appendChild(three.current.labelRenderer.domElement);

        // Set up the scene
        three.current.scene = new THREE.Scene();

        // Initialize Camera
        three.current.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 10000); // 75
        if (!fixCamera) three.current.camera.up.set(0,0,1);

        // Orbit Controls
        three.current.controls  = new OrbitControls(three.current.camera, three.current.renderer.domElement);
        three.current.controls.enableDamping = true;
        three.current.controls.dampingFactor = 0.25;
        
        // handle fixed camera (and zoom approach for fixed cameras)
        function onMouseWheel(event) {
            if (event.wheelDeltaY) { // WebKit
                three.current.camera.fov -= event.wheelDeltaY * 0.05;
            } else if (event.wheelDelta) { // Opera / IE9
                three.current.camera.fov -= event.wheelDelta * 0.05;
            } else if (event.detail) { // Firefox
                three.current.camera.fov += event.detail * 1.0;
            }
            three.current.camera.fov = Math.max(40, Math.min(100, three.current.camera.fov));
            three.current.camera.updateProjectionMatrix();
        }
        if (fixCamera){
            three.current.controls.screenSpacePanning = false;
            three.current.camera.fov = 65; // wider default fov for photospheres
            three.current.controls.enableZoom = false;
            three.current.controls.enablePan = false;
            three.current.camera.position.set(10,0,0); // for some reason orbit controls don't work if camera is at origin...
            mount.addEventListener('mousewheel', onMouseWheel, false);
            mount.addEventListener('DOMMouseScroll', onMouseWheel, false);
        }

        // Handle Resize
        const handleResize = () => {
            three.current.renderer.setSize(mount.clientWidth, mount.clientHeight);
            three.current.labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
            three.current.camera.aspect = mount.clientWidth / mount.clientHeight;
            three.current.camera.updateProjectionMatrix();
            three.current.controls.update();
        };
        window.addEventListener("resize", handleResize);
                
        // setup complete!
        console.log("Three.js setup complete.");
        setInit(true);

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            three.current.controls.update();
            three.current.renderer.render(three.current.scene, three.current.camera);
            three.current.labelRenderer.render(three.current.scene, three.current.camera);
        };
        animate();

        return () => {
            window.removeEventListener("resize", handleResize);
            mount.removeEventListener('mousewheel', onMouseWheel);
            mount.removeEventListener('DOMMouseScroll', onMouseWheel);
            mount.removeChild(three.current.renderer.domElement);
            three.current.controls.dispose();
          };
    }, [fixCamera]);

    // handle changes in site (clear scene contents)
    useEffect(()=>{
        if (currentMedia && three.current.scene){
            for( var i = three.current.scene.children.length - 1; i >= 0; i--) { 
                three.current.scene.remove(three.current.scene.children[i]); 
            }
        }
        setSelection([]);
        // clear any (accidentally) remaining labels
        document.querySelectorAll('.outerdiv').forEach( (l)=>{
            l.innerHTML = '';
        });
    }, [currentMedia]);
    
    // SETUP PICKING
    useEffect(() => {
        if (!init) return;    
        const getIntersects = ( event ) => {
            const rect = three.current.renderer.domElement.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            )
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, three.current.camera);
            raycaster.params.Points.threshold = three.current.pointSize; // point size for picking
            return raycaster.intersectObjects(three.current.scene.children, true)
        }

        const handleSingleClick = (event) => {
            if (!(event.ctrlKey || event.altKey || event.metaKey)) return; // Only if Ctrl is held
            const intersects = getIntersects(event);
            for (const i in intersects){
                if (intersects[i].object.userData.pickable){ // must be set to allow picking on this object
                    const selectedPoint = intersects[i].point.clone();
                    const ray = three.current.camera.position.clone();
                    ray.subVectors(ray, selectedPoint).normalize();
                    ray.multiplyScalar(3*three.current.pointSize); 
                    selectedPoint.addVectors(selectedPoint, ray); // move point towards camera a little to avoid zblending issues
                    selection.push(selectedPoint)
                    setSelection([ ...selection ]); // update selection
                    return;
                }
            }
        };

        const handleDoubleClick = (event) => {
            const intersects = getIntersects(event);
            if (intersects.length > 0) {
            const selectedObject = intersects[0].object; // clicked object
            const selectedPoint = intersects[0].point;

            // set center of rotation
            if (selectedObject.userData.blockDelete){
                if (!fixCamera){ // not allowed with fixed cameras
                    three.current.camera.lookAt(selectedPoint);
                    three.current.controls.target.copy(selectedPoint);
                    
                    three.current.controls.update();
                }
            } else { // otherwise, delete this object
                if (!annotations) return;

                // remove clicked element from annotations array (based on position)
                if (selectedObject.userData.annot){
                ['lines','planes','traces'].forEach( (n) => {
                    annotations[site][n]=annotations[site][n].filter( (l) => {
                    const v = l.verts[0];
                    const v2 = selectedObject.userData.annot.verts[0];
                    return !((v.x == v2.x) && (v.y == v2.y) && (v.z == v2.z));
                    //return !l.verts[0].equals(selectedObject.userData.annot.verts[0]);
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
            if (!(site in newAnnot)){
                newAnnot[site] = {lines:[], planes:[], traces:[]};
            }
            // add geometry to annotations
            if (selection.length === 1) {
                let txt = prompt("Enter label (text or html)").trim();
                if (txt.length > 0) {
                    const label = {html: txt, pos:[selection[0].x,
                                           selection[0].y,selection[0].z]}
                    
                    let k = 'label1';
                    if (tour.sites[site].labels) {
                        const n = Object.keys(tour.sites[site].labels).length;
                        k = `label${n+1}`;
                    }
                    if (!tour.sites[site].labels) tour.sites[site].labels = {};
                    tour.sites[site].labels[k] = label;
                    drawLabel(txt, new THREE.Vector3(...selection[0]), k);

                    // send a POST that updates JSON file
                    if (tour.devURL){
                        fetch("./update", {
                        method : 'POST', 
                        headers : { 'Content-Type':'application/json; charset=utf-8'},
                        body: JSON.stringify(
                            {filename: "./index.json",
                            content: JSON.stringify(tour, null, 2),
                            dtype: 'application/json'
                            })
                        }).then( (response) => {if (response.status!=200) console.log(`Error saving file index.json`)}); 
                    };
                }
            }
            else if (selection.length === 2) {
                const v1 = selection[0];
                const v2 = selection[1];
                const direction = new THREE.Vector3().subVectors(v2, v1).normalize();
                let trend = (Math.atan2(direction.x, direction.y) * 180) / Math.PI;
                let plunge = (Math.asin(direction.z) * 180) / Math.PI;
                if (plunge < 0){
                plunge = -plunge;
                trend = trend - 180; }
                const distance = v1.distanceTo(v2);
                newAnnot[site].lines.push({
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
                newAnnot[site].planes.push({
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
                newAnnot[site].traces.push({
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
        three.current.renderer.domElement.addEventListener("dblclick", handleDoubleClick);
        three.current.renderer.domElement.addEventListener("click", handleSingleClick);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            three.current.renderer.domElement.removeEventListener("dblclick", handleDoubleClick);
            three.current.renderer.domElement.removeEventListener("click", handleSingleClick);
        };
    }, [site, init, selection, annotations]);

    // Create and add html labels
    useEffect(()=>{
        if (!init) return;

        // clear previous labels
        labelRef.current.forEach( (obj) => {
            three.current.scene.remove(obj);
            obj.children.forEach( (c) => {obj.remove(c)});
        } );
        labelRef.current = [];

        // don't draw labels at all?
        if (!labelVis) return; 

        // add labels
        if (tour.sites[site].labels) {
            Object.keys(tour.sites[site].labels).forEach( (k) => {
                const lab = tour.sites[site].labels[k];
                drawLabel(lab.html, new THREE.Vector3(...lab.pos), k);
            } );
        }
    },[site, init, labelVis]);
    
      // ** Draw annotations **
      useEffect(()=>{
        if (!init) return;
        
        // clear annotations
        [spheresRef, lineRef, planeRef].forEach( (ref)=>{
          ref.current.forEach((obj) => {
            three.current.scene.remove(obj);
            obj.geometry.dispose();
            obj.material.dispose();
        })});
        spheresRef.current = [];
        if (!annotVis) return; // don't draw annotations
    
        // Add a yellow sphere to highlight selected points
        const sphereGeometry = new THREE.SphereGeometry(three.current.pointSize*3, 16, 16);
        selection.forEach((point)=>{
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.copy(point);
            three.current.scene.add(sphere);
            spheresRef.current.push(sphere);
        });
        
        // add current line, plane or polyline
        if (selection.length === 2) {
          drawLine({verts:[selection[0], selection[1]], color:annotColor});
        } else if (selection.length === 3) {
          drawPlane({verts:[selection[0], selection[1], selection[2]], color:annotColor});
        } else if (selection.length > 3){
          drawLine({verts:selection, color:annotColor});
        }
        
        if (!annotations) return;
        if (!(site in annotations)) return;
        
        // add annotation lines / planes / polylines
        annotations[site].lines.forEach( (l) => { drawLine(l) } );
        annotations[site].planes.forEach( (l) => { drawPlane(l) } );
        annotations[site].traces.forEach( (l) => { drawLine(l) } );
      }, [site, init, selection, annotations, annotColor, annotVis]);
    
    // **Add labels **
    const drawLabel = (html, position, key) => {
        // add corresponding 2D (HTML) object
        const labelDiv = document.createElement( 'div' );
        labelDiv.className = 'outerdiv';
        labelDiv.innerHTML = '<div class="labeldiv">' + html + '</div>';
        const label = new CSS2DObject( labelDiv );
        label.position.copy(position);
        label.userData = {key: key};
        labelRef.current.push(label);
        three.current.scene.add( label );

        const dblclick = (evt) => {
            // Remove the label from labelRef
            const index = labelRef.current.indexOf(label);
            if (index > -1) {
                labelRef.current.splice(index, 1);
            }

            // Remove the label from three.current.scene
            three.current.scene.remove(label);

            // remove label from the tour
            delete tour.sites[site].labels[key];

            // save index.json if in dev mode
            if (tour.devURL){
                fetch("./update", {
                    method : 'POST', 
                    headers : { 'Content-Type':'application/json; charset=utf-8'},
                    body: JSON.stringify(
                      {filename: "./index.json",
                       content: JSON.stringify(tour, null, 2),
                       dtype: 'application/json'
                      })
                  }).then((response) => {if (response.status!=200) console.log(`Error saving index.json`)}); 
            }
        }
        labelDiv.addEventListener("dblclick", dblclick);
    };

    // **Function to Draw a Line Between Two Points**
    const drawLine = (points) => {
    if (lineRef.current) three.current.scene.remove(lineRef.current); // Remove old line if exists
        const geometry = new LineGeometry();//.setFromPoints([point1, point2]);
        const v = [];
        points.verts.forEach( (p) => {v.push(p.x);v.push(p.y);v.push(p.z);} );
            geometry.setPositions(v);
        const colour = points.color ? points.color : 0xffff00;
        const lineMaterial = new LineMaterial({ color: colour, linewidth: 5, vertexColors: false });
        const line = new Line2(geometry, lineMaterial);
        line.userData = {annot:points};
        three.current.scene.add(line);
        lineRef.current.push(line);
    };

    // **Function to Draw a Plane Defined by Three Points**
    const drawPlane = (points) => {
    // compute plane orientation
    if (planeRef.current) three.current.scene.remove(planeRef.current); // Remove old plane if exists
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
        three.current.scene.add(plane);
        planeRef.current.push(plane);
    };

    // return
    return (<div style={{ height: "100%", width: "100%", position: "relative"}}>
            <div className="bottombuttons">
                <div className="row">
                    <button className="button" onClick={() => {
                        // download annotations
                        const annotationsJSON = JSON.stringify(annotations, null, 2); // Convert annotations to JSON string
                        download( annotationsJSON, 'annotations.json', 'applications/json'); 
                        }}>Annotations ⬇</button>
                    <input type="file" accept=".json" onChange={(event) => {
                            const file = event.target.files[0]; // Get the uploaded file
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                    try {
                                        const annotations = JSON.parse(e.target.result); // Parse the JSON file
                                        if (!(site in annotations)){
                                            annotations[site] = {lines:[], planes:[], traces:[]};
                                        }
                                        setAnnotations(annotations); // Set the annotations state
                                        setSelection([]); // clear selection
                                    } catch (error) {
                                        console.error('Error parsing uploaded JSON file:', error);
                                    }
                                };
                                reader.readAsText(file); // Read the file as text
                            }
                        }}
                        style={{ display: 'none' }} // Hide the file input
                        id="upload-annotations"
                    />
                    <button
                        className="button"
                        onClick={() => { document.getElementById('upload-annotations').click(); }}>
                        ⬆
                    </button>

                    <button className={`button ${labelVis ? 'active' : ''}`} onClick={() => { setLabelVis(!labelVis)}}>Labels</button>
                    <button className={`button ${annotVis ? 'active' : ''}`} onClick={() => { setAnnotVis(!annotVis)}}>Annotations</button>
                    <input type="color" key="cols" value={annotColor} onChange={(e)=>{setAnnotColor(e.target.value)}} 
                            style={{ width: '36px', height: '26px', border: 'none', padding: '0', background: 'none', cursor: 'pointer' }}/>
                </div>

            </div>
            <div className="viewer" ref={mountRef} style={{ height: "100%", width: "100%"}} />
            </div>);
};
export default ThreeScene;