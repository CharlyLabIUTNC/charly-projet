import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { InteractiveGroup } from 'three/examples/jsm/interactive/InteractiveGroup.js';
import { HTMLMesh } from 'three/examples/jsm/interactive/HTMLMesh.js';

let vrGrabbedObject = null;
const vrRaycaster = new THREE.Raycaster();

export function initVR(deps) {
    const { 
        renderer, scene, camera, avatarGroup, controls, 
        getCollisionMeshes, saveWorld, updatePropertiesMenu,
        getCurrentPlacedObject, setCurrentPlacedObject, transformControls
    } = deps;

    renderer.xr.enabled = true;
    
    const vrButton = VRButton.createButton(renderer);
    // Supprimer les styles absolus par défaut de VRButton
    vrButton.style.position = 'static';
    vrButton.style.transform = 'none';
    vrButton.style.bottom = 'auto';
    vrButton.style.left = 'auto';
    vrButton.style.width = '100%';
    vrButton.style.margin = '0 0 10px 0';
    vrButton.classList.add('hud-btn');

    const hud = document.getElementById('hud');
    if (hud) {
        // Ajouter le bouton tout en haut du menu HUD
        hud.insertBefore(vrButton, hud.firstChild);
    } else {
        document.body.appendChild(vrButton);
    }

    const controllerModelFactory = new XRControllerModelFactory();

    const controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    controller1.addEventListener('connected', (e) => controller1.userData.source = e.data);
    scene.add(controller1);

    const controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    controller2.addEventListener('connected', (e) => controller2.userData.source = e.data);
    scene.add(controller2);

    const rayGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const rayLine = new THREE.Line(rayGeometry);
    rayLine.name = 'ray';
    rayLine.scale.z = 5;

    controller1.add(rayLine.clone());
    controller2.add(rayLine.clone());

    const controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    scene.add(controllerGrip1);

    const controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    scene.add(controllerGrip2);

    let hudMenu, propertiesMenu, addGlbMenu, mapModalMenu;

    renderer.xr.addEventListener('sessionstart', () => {
        // Hide avatar to avoid seeing inside mesh
        avatarGroup.children.forEach(child => {
            if (child !== camera && child !== controller1 && child !== controller2 && child !== controllerGrip1 && child !== controllerGrip2) {
                child.userData.wasVisibleBeforeVR = child.visible;
                child.visible = false;
            }
        });
        
        avatarGroup.add(camera);
        avatarGroup.add(controller1);
        avatarGroup.add(controller2);
        
        // Force refresh visibility for menus
        vrMenus.forEach(updateFn => updateFn());

        avatarGroup.add(controllerGrip1);
        avatarGroup.add(controllerGrip2);
        
        controls.enabled = false;
    });

    renderer.xr.addEventListener('sessionend', () => {
        avatarGroup.children.forEach(child => {
            if (child.userData.wasVisibleBeforeVR !== undefined) {
                child.visible = child.userData.wasVisibleBeforeVR;
                delete child.userData.wasVisibleBeforeVR;
            }
        });
        
        const hudEl = document.getElementById('hud');
        if (hudEl) hudEl.classList.remove('hidden');
        
        // Hide all menus
        vrMenus.forEach(updateFn => updateFn());
        
        scene.add(camera);
        scene.add(controller1);
        scene.add(controller2);
        scene.add(controllerGrip1);
        scene.add(controllerGrip2);
        
        // Visibility cleanup is handled automatically by the updateFn logic
        
        controls.enabled = true;
    });

    const interactiveGroup = new InteractiveGroup(renderer, camera);
    scene.add(interactiveGroup);
    interactiveGroup.add(avatarGroup);
    interactiveGroup.listenToXRControllerEvents(controller1);
    interactiveGroup.listenToXRControllerEvents(controller2);

    const vrMenus = [];

    function createVRMenu(domId, scale) {
        const el = document.getElementById(domId);
        if (!el) return { mesh: null };
        const contentEl = el.querySelector('.modal-content') || el;
        
        let mesh = null;

        const updateVisibility = () => {
            const shouldBeVisible = renderer.xr.isPresenting && !el.classList.contains('hidden');
            
            if (shouldBeVisible && !mesh) {
                // Instantiate HTMLMesh only when the menu first becomes visible
                mesh = new HTMLMesh(contentEl);
                mesh.scale.setScalar(scale);
                mesh.userData.domElement = el; // Store the original wrapper for scrolling
                interactiveGroup.add(mesh);
            }
            
            if (mesh) {
                mesh.visible = shouldBeVisible;
            }
        };

        const observer = new MutationObserver(updateVisibility);
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        
        updateVisibility();
        
        vrMenus.push(updateVisibility);
        
        return { 
            get mesh() { return mesh; } 
        };
    }

    hudMenu = createVRMenu('hud', 0.25);
    propertiesMenu = createVRMenu('properties-menu', 0.3);
    addGlbMenu = createVRMenu('add-glb-modal', 0.25);
    mapModalMenu = createVRMenu('map-modal', 0.25);

    // Position offsets for menus relative to the left controller
    const offsets = {
        hud: { pos: new THREE.Vector3(-0.25, 0.05, -0.15), rotX: -Math.PI / 4 },
        prop: { pos: new THREE.Vector3(-0.25, 0.05, -0.15), rotX: -Math.PI / 4 },
        glb: { pos: new THREE.Vector3(-0.25, 0.15, -0.2), rotX: -Math.PI / 6 },
        map: { pos: new THREE.Vector3(-0.25, 0.15, -0.2), rotX: -Math.PI / 6 }
    };

    function syncUIMesh(mesh, offsetInfo) {
        if (!mesh || !mesh.visible) return;
        mesh.matrix.identity();
        mesh.matrix.makeRotationX(offsetInfo.rotX);
        mesh.matrix.setPosition(offsetInfo.pos);
        mesh.matrix.premultiply(controller1.matrixWorld);
        mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    }

    function getIntersections(controller) {
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        vrRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        vrRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const selectableObjects = [];
        scene.traverse((obj) => {
            if (obj.userData && obj.userData.isSelectable) selectableObjects.push(obj);
        });
        return vrRaycaster.intersectObjects(selectableObjects, true);
    }

    function onSelectStart(event) {
        const controller = event.target;
        const intersections = getIntersections(controller);
        
        if (intersections.length > 0) {
            let intersection = intersections[0];
            let object = intersection.object;
            
            if (object instanceof HTMLMesh) return;

            while (object.parent && object.parent !== scene && !object.userData.isSelectable) {
                object = object.parent;
            }
            
            if (object.userData && object.userData.isSelectable) {
                setCurrentPlacedObject(object);
                vrGrabbedObject = object;
                controller.attach(vrGrabbedObject); // Use attach for free movement in VR
                updatePropertiesMenu(getCurrentPlacedObject());
                if (transformControls) transformControls.detach();
            }
        }
    }

    function onSelectEnd() {
        if (vrGrabbedObject) {
            scene.attach(vrGrabbedObject); // Detach and keep world transform
            vrGrabbedObject = null;
            saveWorld();
        }
    }

    function handleInteractionRay(controller) {
        if (!controller.visible) return;
        
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        vrRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        vrRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const interactables = [];
        scene.traverse((obj) => {
            if ((obj.userData && obj.userData.isSelectable) || obj instanceof HTMLMesh) interactables.push(obj);
        });

        const intersections = vrRaycaster.intersectObjects(interactables, true);
        const line = controller.getObjectByName('ray');
        
        if (intersections.length > 0) {
            let intersection = intersections[0];
            let obj = intersection.object;

            if (line) line.scale.z = intersection.distance;
            
            // Find root selectable or HTMLMesh
            while (obj.parent && obj.parent !== scene && !(obj.userData && obj.userData.isSelectable) && !(obj instanceof HTMLMesh)) {
                obj = obj.parent;
            }

            if (controller.userData.lastHovered !== obj) {
                controller.userData.lastHovered = obj;
                const source = controller.userData.source;
                if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                    source.gamepad.hapticActuators[0].pulse(0.3, 50);
                }
            }

            // Joystick Scroll for HTMLMesh
            if (obj instanceof HTMLMesh) {
                const source = controller.userData.source;
                if (source && source.gamepad) {
                    const axes = source.gamepad.axes;
                    const yAxis = axes[3] || 0; // Thumbstick Y
                    if (Math.abs(yAxis) > 0.1) {
                        const domElement = obj.userData.domElement;
                        if (domElement) {
                            let scrollable = domElement;
                            if (domElement.id === 'properties-menu') scrollable = document.getElementById('properties-content') || domElement;
                            else if (domElement.id === 'add-glb-modal') scrollable = domElement.querySelector('.modal-content') || domElement;
                            else if (domElement.id === 'map-modal') scrollable = domElement.querySelector('.modal-content') || domElement;
                            
                            scrollable.scrollTop += yAxis * 15;
                        }
                    }
                }
            }
        } else {
            if (line) line.scale.z = 5;
            controller.userData.lastHovered = null;
        }
    }

    function updateVRGrab() {
        if (vrGrabbedObject) {
            // Object is attached to controller, just update UI
            updatePropertiesMenu(vrGrabbedObject);
        }
    }

    let lastXButtonPressed = false;

    function updateVRInput() {
        deps.vrState.vrMoveVector.set(0, 0);
        deps.vrState.vrLookVector.set(0, 0);
        
        let isSprinting = false;
        let isJumping = false;
        
        const session = renderer.xr.getSession();
        if (session) {
            for (const source of session.inputSources) {
                if (source.gamepad) {
                    const axes = source.gamepad.axes;
                    if (source.handedness === 'left') {
                        deps.vrState.vrMoveVector.set(axes[2] || 0, -(axes[3] || 0));
                        // Grip button (usually button 1)
                        if (source.gamepad.buttons[1] && source.gamepad.buttons[1].pressed) isSprinting = true;
                        
                        // X Button (button 4 on left controller) to toggle HUD
                        if (source.gamepad.buttons[4]) {
                            const isXPressed = source.gamepad.buttons[4].pressed;
                            if (isXPressed && !lastXButtonPressed) {
                                const addGlb = document.getElementById('add-glb-modal');
                                const mapModal = document.getElementById('map-modal');
                                const propModal = document.getElementById('properties-menu');
                                
                                const isGlbOpen = addGlb && !addGlb.classList.contains('hidden');
                                const isMapOpen = mapModal && !mapModal.classList.contains('hidden');
                                const isPropOpen = propModal && !propModal.classList.contains('hidden');

                                if (isGlbOpen || isMapOpen || isPropOpen) {
                                    if (addGlb) addGlb.classList.add('hidden');
                                    if (mapModal) mapModal.classList.add('hidden');
                                    if (propModal) propModal.classList.add('hidden');
                                } else {
                                    const hudEl = document.getElementById('hud');
                                    if (hudEl) hudEl.classList.toggle('hidden');
                                }
                            }
                            lastXButtonPressed = isXPressed;
                        }
                    } else if (source.handedness === 'right') {
                        deps.vrState.vrLookVector.set(axes[2] || 0, -(axes[3] || 0));
                        // A button (usually button 4 or 5. We check both just in case, or stick to 4)
                        if (source.gamepad.buttons[4] && source.gamepad.buttons[4].pressed) isJumping = true;
                        if (source.gamepad.buttons[5] && source.gamepad.buttons[5].pressed) isJumping = true;
                    }
                }
            }
        }
        
        deps.vrState.isVRSprinting = isSprinting;
        deps.vrState.isVRJumping = isJumping;
        
        // Handle interaction rays (haptics, visual feedback, scrolling)
        handleInteractionRay(controller1);
        handleInteractionRay(controller2);

        // Update menu transforms to follow the left controller
        syncUIMesh(hudMenu.mesh, offsets.hud);
        syncUIMesh(propertiesMenu.mesh, offsets.prop);
        syncUIMesh(addGlbMenu.mesh, offsets.glb);
        syncUIMesh(mapModalMenu.mesh, offsets.map);
    }

    function onPropertiesMenuUpdated(object) {
        // Visibility is automatically managed by the MutationObserver
        // listening to the '.hidden' class on the DOM element.
        // syncUIMesh handles the positioning relative to the controller.
    }

    // Return the update function to be called in the main animation loop
    return {
        updateVRGrab,
        updateVRInput,
        onPropertiesMenuUpdated
    };
}


