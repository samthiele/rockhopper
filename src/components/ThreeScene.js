import React, { useEffect, useRef, useState } from 'react';
import * as THREE from "three";
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { disposeObject3D, disposeSceneContents } from './dispose3d';
import { resetFrame } from './sceneFrame';
import './ThreeScene.css';

const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
sphereMaterial.userData.shared = true;

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
function EyeIcon({ off }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2"/>
            {off && <path d="M4 20L20 4" stroke="currentColor" strokeWidth="2"/>}
        </svg>
    );
}

function annotBucket(annotations, site, three, create) {
    const root = annotations && annotations[site];
    if (!root) return { lines: [], planes: [], traces: [] };
    if (three.current.mixed && three.current.viewMode === 'photosphere') {
        if (!root.photosphere) {
            if (!create) return { lines: [], planes: [], traces: [] };
            root.photosphere = { lines: [], planes: [], traces: [] };
        }
        return root.photosphere;
    }
    if (create) {
        if (!root.lines) root.lines = [];
        if (!root.planes) root.planes = [];
        if (!root.traces) root.traces = [];
    }
    return root;
}

const ThreeScene = ({ tour, site, three, annotations, setAnnotations,
                        fixCamera, mixed, init, setInit, children }) => {
    const [layers, setLayers] = useState([]);
    const [viewMode, setViewMode] = useState(() => three.current.viewMode || (fixCamera ? 'photosphere' : 'model'));

    // Assigned during render so child effects can register before this component's effects run.
    if (!three.current.frame) resetFrame(three);
    three.current.onViewMode = (mode) => setViewMode(mode);
    const layerAllowed = (entry) => {
        if (!three.current.mixed) return true;
        const photo = three.current.viewMode === 'photosphere';
        return photo ? entry.kind === 'photosphere' : entry.kind !== 'photosphere';
    };
    const publishLayers = (next) => {
        three.current.layerList = next;
        setLayers(next);
    };
    three.current.registerLayer = (entry) => {
        entry.kind = entry.kind || 'model';
        if (entry.eye === undefined) entry.eye = entry.visible !== false;
        entry.visible = entry.eye && layerAllowed(entry);
        entry.objects.current.forEach((object) => {
            object.visible = entry.visible && !object.userData.superseded;
        });
        publishLayers([...(three.current.layerList || []).filter((item) => item.id !== entry.id), entry]);
    };
    three.current.unregisterLayer = (id) => {
        publishLayers((three.current.layerList || []).filter((item) => item.id !== id));
    };
    three.current.setLayerVisible = (id, visible) => {
        const next = (three.current.layerList || []).map((item) => {
            if (item.id !== id) return item;
            item.eye = visible;
            item.visible = visible && layerAllowed(item);
            item.objects.current.forEach((object) => {
                object.visible = item.visible && !object.userData.superseded;
            });
            return { ...item };
        });
        publishLayers(next);
        if (three.current.invalidate) three.current.invalidate();
    };
    const mountRef = useRef(null);
                            
    // annotation states
    const [annotColor, setAnnotColor] = useState('#ffcd00'); // 0xffff00
    const [annotVis, setAnnotVis] = useState(true); // view or hide annotations
    const [labelVis, setLabelVis] = useState(true); // view or hide annotations
    const [selection, setSelection] = useState([]);
    three.current.clearSelection = () => setSelection([]);
    const labelFieldRef = useRef('labels');
    labelFieldRef.current = (mixed && viewMode === 'photosphere') ? 'photoLabels' : 'labels';
    
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
        if (fixCamera){
            three.current.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000); // wider default fov for photospheres
        } else{
            three.current.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 10000); // more zoomed view for clouds
        }
        if (!fixCamera) three.current.camera.up.set(0,0,1);

        // Orbit Controls
        three.current.controls  = new OrbitControls(three.current.camera, three.current.renderer.domElement);
        three.current.controls.enableDamping = true;
        three.current.controls.dampingFactor = 0.25;
        
        // Wheel changes field of view inside a photosphere. Orbit dolly is used on a model.
        function onMouseWheel(event) {
            if (three.current.viewMode !== 'photosphere') return;
            if (event.wheelDeltaY) { // WebKit
                three.current.camera.fov -= event.wheelDeltaY * 0.05;
            } else if (event.wheelDelta) { // Opera / IE9
                three.current.camera.fov -= event.wheelDelta * 0.05;
            } else if (event.detail) { // Firefox
                three.current.camera.fov += event.detail * 1.0;
            }
            three.current.camera.fov = Math.max(40, Math.min(100, three.current.camera.fov));
            three.current.camera.updateProjectionMatrix();
            if (three.current.invalidate) three.current.invalidate();
        }
        if (fixCamera){
            three.current.viewMode = 'photosphere';
            three.current.controls.screenSpacePanning = false;
            three.current.controls.enableZoom = false;
            three.current.controls.enablePan = false;
            three.current.camera.position.set(10,0,0); // orbit controls fail if the camera is at the origin
        }
        mount.addEventListener('mousewheel', onMouseWheel, false);
        mount.addEventListener('DOMMouseScroll', onMouseWheel, false);

        const captureCamera = () => ({
            pos: three.current.camera.position.toArray(),
            tgt: three.current.controls.target.toArray(),
            fov: three.current.camera.fov,
        });
        const seedCamera = (mode) => {
            const photo = mode === 'photosphere';
            const stored = photo ? three.current.photoView : three.current.modelView;
            const pos = stored && stored.pos ? stored.pos : (photo ? [10, 0, 0] : [0, -10, 4]);
            const tgt = stored && stored.tgt ? stored.tgt : [0, 0, 0];
            return { pos, tgt, fov: photo ? 75 : 40 };
        };
        three.current.applyViewMode = (mode, initial) => {
            if (initial) three.current.savedView = {};
            else if (three.current.camera && three.current.viewMode) {
                three.current.savedView = three.current.savedView || {};
                three.current.savedView[three.current.viewMode] = captureCamera();
            }
            three.current.viewMode = mode;
            if (three.current.onViewMode) three.current.onViewMode(mode);
            if (!initial && three.current.clearSelection) three.current.clearSelection();
            const photo = mode === 'photosphere';
            (three.current.layerList || []).forEach((entry) => {
                const allow = !three.current.mixed || (photo ? entry.kind === 'photosphere' : entry.kind !== 'photosphere');
                entry.visible = entry.eye !== false && allow;
                entry.objects.current.forEach((object) => {
                    object.visible = entry.visible && !object.userData.superseded;
                });
            });
            if (three.current.layerList) setLayers(three.current.layerList.map((item) => ({ ...item })));
            if (photo) {
                if (three.current._modelPointSize == null) three.current._modelPointSize = three.current.pointSize;
                three.current.pointSize = 0.25;
            } else if (three.current._modelPointSize != null) {
                three.current.pointSize = three.current._modelPointSize;
                three.current._modelPointSize = null;
            }
            if (!three.current.camera || !three.current.controls) {
                if (three.current.invalidate) three.current.invalidate();
                return;
            }
            const saved = (three.current.savedView && three.current.savedView[mode]) || seedCamera(mode);
            three.current.savedView = three.current.savedView || {};
            three.current.savedView[mode] = saved;
            const camera = three.current.camera;
            const controls = three.current.controls;
            camera.up.set(0, photo ? 1 : 0, photo ? 0 : 1);
            // OrbitControls freezes camera.up into a quaternion at creation.
            // A mixed site starts Z-up, so the panorama has to refresh that
            // quaternion or dragging orbits around the wrong axis.
            controls._quat.setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
            controls._quatInverse.copy(controls._quat).invert();
            controls._sphericalDelta.set(0, 0, 0);
            controls._panOffset.set(0, 0, 0);
            controls._scale = 1;
            camera.fov = saved.fov;
            camera.position.set(saved.pos[0], saved.pos[1], saved.pos[2]);
            const target = new THREE.Vector3(saved.tgt[0], saved.tgt[1], saved.tgt[2]);
            camera.lookAt(target);
            controls.target.copy(target);
            controls.enableZoom = !photo;
            controls.enablePan = !photo;
            controls.screenSpacePanning = !photo;
            // A point cloud sets far from its own size. The panorama is a
            // sphere of radius 100, so that near far-plane clips it to black.
            if (photo) {
                if (three.current._modelFar == null) three.current._modelFar = camera.far;
                camera.near = 0.1;
                camera.far = Math.max(camera.far, 10000);
            } else if (three.current._modelFar != null) {
                camera.far = three.current._modelFar;
                three.current._modelFar = null;
            }
            camera.updateProjectionMatrix();
            controls.update();
            if (three.current.invalidate) three.current.invalidate();
        };

        // Handle Resize
        const handleResize = () => {
            three.current.renderer.setSize(mount.clientWidth, mount.clientHeight);
            three.current.labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
            three.current.camera.aspect = mount.clientWidth / mount.clientHeight;
            three.current.camera.updateProjectionMatrix();
            if (three.current.invalidate) three.current.invalidate();
        };
        window.addEventListener("resize", handleResize);

        // Render only when the camera moves, damping is settling, or someone calls invalidate()
        let rafId = 0;
        const tick = () => {
            const damping = three.current.controls.update();
            three.current.renderer.render(three.current.scene, three.current.camera);
            three.current.labelRenderer.render(three.current.scene, three.current.camera);
            if (damping) {
                rafId = requestAnimationFrame(tick);
            } else {
                rafId = 0;
            }
        };
        const invalidate = () => {
            if (rafId !== 0) return;
            rafId = requestAnimationFrame(tick);
        };
        three.current.invalidate = invalidate;
        three.current.controls.addEventListener('start', invalidate);
        three.current.controls.addEventListener('change', invalidate);
                
        // setup complete!
        if (three.current.mixed || fixCamera) {
            three.current.applyViewMode(three.current.viewMode || (fixCamera ? 'photosphere' : 'model'), true);
        }
        console.log("Three.js setup complete.");
        setInit(true);
        invalidate();

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            three.current.invalidate = () => {};
            three.current.controls.removeEventListener('start', invalidate);
            three.current.controls.removeEventListener('change', invalidate);
            window.removeEventListener("resize", handleResize);
            mount.removeEventListener('mousewheel', onMouseWheel);
            mount.removeEventListener('DOMMouseScroll', onMouseWheel);
            disposeSceneContents(three.current.scene);
            if (three.current.labelRenderer && three.current.labelRenderer.domElement.parentNode) {
                mount.removeChild(three.current.labelRenderer.domElement);
            }
            if (three.current.renderer && three.current.renderer.domElement.parentNode) {
                mount.removeChild(three.current.renderer.domElement);
            }
            three.current.renderer.dispose();
            three.current.controls.dispose();
          };
    }, [fixCamera]);

    // Drop annotation handles when the site changes. SceneReset clears the
    // actual objects before the next content effect adds a cloud or mesh.
    useEffect(()=>{
        spheresRef.current = [];
        lineRef.current = [];
        planeRef.current = [];
        labelRef.current = [];
        setSelection([]);
        document.querySelectorAll('.outerdiv').forEach( (l)=>{
            l.innerHTML = '';
        });
    }, [site]);
    
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
            return raycaster.intersectObjects(three.current.scene.children, true).filter((hit) => {
                let object = hit.object;
                while (object) {
                    if (object.visible === false) return false;
                    object = object.parent;
                }
                return true;
            });
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
                if (three.current.viewMode !== 'photosphere'){ // a panorama stays inside the sphere
                    three.current.camera.lookAt(selectedPoint);
                    three.current.controls.target.copy(selectedPoint);
                    
                    three.current.controls.update();
                }
            } else { // otherwise, delete this object
                if (!annotations) return;

                // remove clicked element from annotations array (based on position)
                if (selectedObject.userData.annot){
                const bucket = annotBucket(annotations, site, three);
                ['lines','planes','traces'].forEach( (n) => {
                    if (!bucket[n]) return;
                    bucket[n]=bucket[n].filter( (l) => {
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
            const bucket = annotBucket(newAnnot, site, three, true);
            const labelField = (three.current.mixed && three.current.viewMode === 'photosphere') ? 'photoLabels' : 'labels';
            // add geometry to annotations
            if (selection.length === 1) {
                let txt = prompt("Enter label (text or html)").trim();
                if (txt.length > 0) {
                    const label = {html: txt, pos:[selection[0].x,
                                           selection[0].y,selection[0].z]}
                    
                    let k = 'label1';
                    if (tour.sites[site][labelField]) {
                        let n = 1;
                        while (k in tour.sites[site][labelField]){
                            n += 1;
                            k = `label${n}`
                        }
                        console.log(k);
                    }
                    if (!tour.sites[site][labelField]) tour.sites[site][labelField] = {};
                    tour.sites[site][labelField][k] = label;
                    drawLabel(txt, new THREE.Vector3(...selection[0]), k);
                    if (three.current.invalidate) three.current.invalidate();

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
                bucket.lines.push({
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
                bucket.planes.push({
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
                bucket.traces.push({
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
            disposeObject3D(obj);
        } );
        labelRef.current = [];

        // don't draw labels at all?
        if (!labelVis) return; 

        // add labels
        const labels = tour.sites[site] && tour.sites[site][labelFieldRef.current];
        if (labels) {
            Object.keys(labels).forEach( (k) => {
                const lab = labels[k];
                drawLabel(lab.html, new THREE.Vector3(...lab.pos), k);
            } );
        }
        if (three.current.invalidate) three.current.invalidate();
    },[site, init, labelVis, viewMode]);
    
      // ** Draw annotations **
      useEffect(()=>{
        if (!init) return;
        
        // clear annotations
        [spheresRef, lineRef, planeRef].forEach( (ref)=>{
          ref.current.forEach((obj) => {
            three.current.scene.remove(obj);
            disposeObject3D(obj);
        })});
        spheresRef.current = [];
        lineRef.current = [];
        planeRef.current = [];
        if (annotVis) {
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

            if (annotations && (site in annotations)) {
                const bucket = annotBucket(annotations, site, three);
                (bucket.lines || []).forEach( (l) => { drawLine(l) } );
                (bucket.planes || []).forEach( (l) => { drawPlane(l) } );
                (bucket.traces || []).forEach( (l) => { drawLine(l) } );
            }
        }
        if (three.current.invalidate) three.current.invalidate();
      }, [site, init, selection, annotations, annotColor, annotVis, viewMode]);
    
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
            if (three.current.invalidate) three.current.invalidate();

            // remove label from the tour
            delete tour.sites[site][labelFieldRef.current][key];

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
            {mixed && viewMode === 'model' && layers.filter((item) => item.kind !== 'photosphere').length > 1 &&
                <div className="layertoggle">
                    {layers.filter((item) => item.kind !== 'photosphere').map((item) => (
                    <div className="layerrow" key={item.id}>
                        <span>{item.name}</span>
                        <button
                            className="eye"
                            type="button"
                            aria-label={item.eye === false ? `Show ${item.name}` : `Hide ${item.name}`}
                            onClick={() => three.current.setLayerVisible(item.id, item.eye === false)}>
                            <EyeIcon off={item.eye === false}/>
                        </button>
                    </div>
                ))}
            </div>}
            {mixed && <div className="modebutton">
                <button
                    className="button"
                    type="button"
                    onClick={() => three.current.applyViewMode && three.current.applyViewMode(viewMode === 'photosphere' ? 'model' : 'photosphere')}>
                    {viewMode === 'photosphere' ? '3D View' : 'Photosphere'}
                </button>
            </div>}
            {!mixed && layers.length > 1 && <div className="layertoggle">
                {layers.map((item) => (
                    <div className="layerrow" key={item.id}>
                        <span>{item.name}</span>
                        <button
                            className="eye"
                            type="button"
                            aria-label={item.visible ? `Hide ${item.name}` : `Show ${item.name}`}
                            onClick={() => three.current.setLayerVisible(item.id, !item.visible)}>
                            <EyeIcon off={!item.visible}/>
                        </button>
                    </div>
                ))}
            </div>}
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
            <div className={`stylebar${mixed && viewMode === 'photosphere' ? ' photo-mode' : ''}`}>
                {children}
            </div>
            </div>);
};
export default ThreeScene;