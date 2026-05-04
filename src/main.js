import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { UltraHDRLoader } from 'three/examples/jsm/loaders/UltraHDRLoader.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Setup BVH for all geometries
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let scene, camera, renderer;

scene = new THREE.Scene();

// --- IndexedDB for GLB Files ---
const dbName = 'CharlySpatialDB';
const storeName = 'filesStore';
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };
        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };
    });
}

function saveFileToDB(fileName, arrayBuffer) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(arrayBuffer, fileName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function getFileFromDB(fileName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(fileName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function deleteFileFromDB(fileName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(fileName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function disposeHierarchy(node) {
    node.traverse((child) => {
        if (child.isMesh) {
            // Nettoyer la géométrie et l'arbre BVH
            if (child.geometry) {
                if (child.geometry.boundsTree) child.geometry.disposeBoundsTree();
                child.geometry.dispose();
            }
            // Nettoyer les matériaux et textures
            if (child.material) {
                const cleanMaterial = (mat) => {
                    if (mat.map) mat.map.dispose();
                    if (mat.normalMap) mat.normalMap.dispose();
                    if (mat.roughnessMap) mat.roughnessMap.dispose();
                    if (mat.metalnessMap) mat.metalnessMap.dispose();
                    if (mat.aoMap) mat.aoMap.dispose();
                    if (mat.emissiveMap) mat.emissiveMap.dispose();
                    mat.dispose();
                };
                if (Array.isArray(child.material)) {
                    child.material.forEach(cleanMaterial);
                } else {
                    cleanMaterial(child.material);
                }
            }
        }
    });
}

function saveWorld() {
    const worldData = [];
    scene.traverse((obj) => {
        if (obj.userData && obj.userData.isSelectable) {
            worldData.push({
                type: obj.userData.type,
                fileName: obj.userData.fileName,
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
                collision: obj.userData.collision || false,
                collisionType: obj.userData.collisionType || 'mesh'
            });
        }
    });
    localStorage.setItem(`savedWorld_${activeMapName}`, JSON.stringify(worldData));
}

function updateInventoryUI() {
    const container = document.getElementById('inventory-container');
    const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
    if (inventory.length === 0) {
        container.innerHTML = '<p style="color: rgba(255,255,255,0.5); font-size: 14px;">Aucun modèle enregistré.</p>';
        return;
    }
    container.innerHTML = '';
    inventory.forEach(fileName => {
        const itemDiv = document.createElement('div');
        itemDiv.style.display = 'flex';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.gap = '5px';
        itemDiv.style.marginBottom = '5px';

        const btn = document.createElement('button');
        btn.className = 'hud-btn';
        btn.textContent = fileName;
        btn.style.flexGrow = '1';
        btn.onclick = async () => {
            const arrayBuffer = await getFileFromDB(fileName);
            if (arrayBuffer) {
                const blob = new Blob([arrayBuffer]);
                const url = URL.createObjectURL(blob);
                new GLTFLoader().load(url, (gltf) => {
                    spawnObject(gltf.scene, 'custom_glb', fileName);
                    URL.revokeObjectURL(url);
                }, undefined, (error) => {
                    console.error("Erreur de chargement GLTF:", error);
                    URL.revokeObjectURL(url);
                    if (confirm(`Impossible de charger le modèle 3D "${fileName}". Il semble corrompu. Voulez-vous le supprimer de l'inventaire ?`)) {
                        removeFileFromInventory(fileName);
                    }
                });
            } else {
                if (confirm(`Le fichier "${fileName}" est introuvable dans la base de données. Il n'est plus accessible. Voulez-vous le retirer de votre inventaire ?`)) {
                    removeFileFromInventory(fileName);
                }
            }
        };
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&#10006;'; // Crois (X)
        deleteBtn.style.background = '#ff3b30';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.borderRadius = '50%';
        deleteBtn.style.width = '24px';
        deleteBtn.style.height = '24px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.title = "Supprimer ce modèle";
        deleteBtn.onclick = () => {
            if (confirm(`Voulez-vous vraiment supprimer "${fileName}" de votre inventaire ?`)) {
                removeFileFromInventory(fileName);
            }
        };

        itemDiv.appendChild(btn);
        itemDiv.appendChild(deleteBtn);
        container.appendChild(itemDiv);
    });
}

function removeFileFromInventory(fileName) {
    // Delete from IndexedDB
    deleteFileFromDB(fileName).catch(e => console.error("Error deleting from DB:", e));
    // Remove from localStorage array
    let inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
    inventory = inventory.filter(name => name !== fileName);
    localStorage.setItem('inventory', JSON.stringify(inventory));
    // Update UI
    updateInventoryUI();
}

// Global loaders for reuse
const gltfLoader = new GLTFLoader();

async function loadWorld() {
    // Clear existing selectable objects
    const objectsToRemove = [];
    scene.traverse((obj) => {
        if (obj.userData && obj.userData.isSelectable) {
            objectsToRemove.push(obj);
        }
    });
    objectsToRemove.forEach(obj => {
        disposeHierarchy(obj);
        scene.remove(obj);
    });

    const saved = localStorage.getItem(`savedWorld_${activeMapName}`) || localStorage.getItem('savedWorld'); // Fallback for transition
    if (!saved) return;
    try {
        const worldData = JSON.parse(saved);
        
        // Helper to promisify GLTFLoader
        const loadGLTFAsync = (url) => new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject));

        for (const data of worldData) {
            let mesh = null;
            if (data.type === 'box') {
                mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
            } else if (data.type === 'sphere') {
                mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshStandardMaterial({ color: 0x00aaff }));
            } else if (data.type === 'cone') {
                mesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32), new THREE.MeshStandardMaterial({ color: 0x00ffaa }));
            } else if (data.type === 'custom_glb' && data.fileName) {
                const arrayBuffer = await getFileFromDB(data.fileName);
                if (arrayBuffer) {
                    const blob = new Blob([arrayBuffer]);
                    const url = URL.createObjectURL(blob);
                    
                    try {
                        const gltf = await loadGLTFAsync(url);
                        const loadedMesh = gltf.scene;
                        
                        // BVH calculation
                        loadedMesh.traverse(n => { 
                            if(n.isMesh && !n.geometry.boundsTree) n.geometry.computeBoundsTree(); 
                        });
                        
                        loadedMesh.position.set(data.position.x, data.position.y, data.position.z);
                        if (data.rotation) loadedMesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
                        if (data.scale) loadedMesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
                        
                        loadedMesh.userData.isSelectable = true;
                        loadedMesh.userData.type = data.type;
                        loadedMesh.userData.fileName = data.fileName;
                        loadedMesh.userData.collision = data.collision;
                        loadedMesh.userData.collisionType = data.collisionType || 'mesh';
                        
                        if (loadedMesh.userData.collisionType === 'box') {
                            createBoxProxy(loadedMesh);
                        }
                        
                        scene.add(loadedMesh);
                    } catch (err) {
                        console.error("Error loading GLB:", data.fileName, err);
                    } finally {
                        URL.revokeObjectURL(url);
                    }
                }
            }
            
            if (mesh) {
                if (mesh.isMesh && !mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree();
                mesh.position.set(data.position.x, data.position.y, data.position.z);
                if (data.rotation) mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
                if (data.scale) mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
                mesh.userData.isSelectable = true;
                mesh.userData.type = data.type;
                mesh.userData.collision = data.collision;
                mesh.userData.collisionType = data.collisionType || 'mesh';
                scene.add(mesh);
            }
        }
        
        updateCollisionMeshes();
    } catch (e) {
        console.error("Error loading world", e);
    }
}


camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

// add light
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

//add hdr for a natural light
const loader = new UltraHDRLoader();
const texture = await loader.loadAsync( '/models/textures/citrus_orchard_road_puresky_1k.jpg' );
texture.mapping = THREE.EquirectangularReflectionMapping;
scene.background = texture;
scene.environment = texture;

// add map group (content loaded dynamically via switchMap)
let map = new THREE.Group();
let mapLoaded = false;

// collision meshes array (flat list for faster raycasting)
let collisionMeshes = [];
let lastCollisionUpdate = 0;

function updateCollisionMeshes() {
    collisionMeshes = [];
    scene.traverse(node => {
        // Only consider meshes
        if (!node.isMesh) return;
        
        // Skip helper objects like TransformControls
        if (node.parent && (node.parent.isTransformControls || node.parent.type === 'TransformControls')) return;

        let isCollisionable = node.userData.isMap || false;
        let isProxy = node.userData.isCollisionProxy || false;
        
        let p = node;
        let collisionType = 'mesh';
        let mainObject = null;

        while(p && p !== scene) {
            if (p.userData && p.userData.collision) {
                isCollisionable = true;
                collisionType = p.userData.collisionType || 'mesh';
                mainObject = p;
            }
            p = p.parent;
        }
        
        if (isCollisionable) {
            if (node.userData.isMap) {
                collisionMeshes.push(node);
            } else if (mainObject) {
                // If it's a proxy box, always include it
                if (isProxy) {
                    collisionMeshes.push(node);
                } 
                // If it's the real geometry, only include if type is 'mesh'
                else if (collisionType === 'mesh') {
                    collisionMeshes.push(node);
                }
            }
        }
    });
}

function createBoxProxy(object) {
    // Remove existing proxies
    const existing = [];
    object.traverse(n => { if(n.userData.isCollisionProxy) existing.push(n); });
    existing.forEach(n => {
        disposeHierarchy(n);
        n.parent.remove(n);
    });

    object.updateMatrixWorld(true);

    // Calculate bounding box of the whole group
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, 
        wireframe: true, 
        visible: false // Hidden in game
    });
    const proxy = new THREE.Mesh(geo, mat);
    
    // Position proxy relative to the object
    object.worldToLocal(center);
    proxy.position.copy(center);
    proxy.userData.isCollisionProxy = true;
    
    object.add(proxy);
    return proxy;
}


// --- Map Manager State ---
let activeMapName = localStorage.getItem('activeMap') || 'CharlyVerse';
let isMapEditMode = false;

function getMapInventory() {
    return JSON.parse(localStorage.getItem('mapInventory') || '[]');
}
function saveMapInventory(inv) {
    localStorage.setItem('mapInventory', JSON.stringify(inv));
}
function getMapSpawnKey(name) { return `spawnPoint_${name}`; }
function saveMapTransform(name) {
    const t = {
        position: { x: map.position.x, y: map.position.y, z: map.position.z },
        rotation: { x: map.rotation.x, y: map.rotation.y, z: map.rotation.z },
        scale:    { x: map.scale.x,    y: map.scale.y,    z: map.scale.z }
    };
    localStorage.setItem(`mapTransform_${name}`, JSON.stringify(t));
}
function applyMapTransform(name) {
    const saved = localStorage.getItem(`mapTransform_${name}`);
    if (saved) {
        try {
            const t = JSON.parse(saved);
            map.position.set(t.position.x, t.position.y, t.position.z);
            map.rotation.set(t.rotation.x, t.rotation.y, t.rotation.z);
            map.scale.set(t.scale.x, t.scale.y, t.scale.z);
        } catch(e) {}
    }
}

function enterMapEditMode() {
    isMapEditMode = true;
    isGhostMode = true;
    if (avatar) avatar.visible = false;
    controls.enablePan = true;
    document.getElementById('btn-ghost').classList.add('active');
    transformControls.attach(map);
    document.getElementById('map-edit-toast').classList.remove('hidden');
    // Hide object-specific buttons, show the properties panel for the map
    document.getElementById('btn-collision-toggle').style.display = 'none';
    document.getElementById('btn-delete').style.display = 'none';
    setGizmoMode('translate');
    updatePropertiesMenu(map);
    syncMobileControls();
}

function exitMapEditMode() {
    isMapEditMode = false;
    isGhostMode = false;
    if (avatar && !renderer.xr.isPresenting) avatar.visible = true;
    controls.enablePan = false;
    document.getElementById('btn-ghost').classList.remove('active');
    transformControls.detach();
    document.getElementById('map-edit-toast').classList.add('hidden');
    document.getElementById('btn-collision-toggle').style.display = '';
    document.getElementById('btn-delete').style.display = '';
    saveMapTransform(activeMapName);
    updateMapInventoryUI();
    // Restore object panel if something was selected, else hide
    updatePropertiesMenu(currentPlacedObject || null);
    syncMobileControls();
}

function teleportTo(x, y, z) {
    avatarGroup.position.set(x, y, z);
    controls.target.set(x, y + currentHeadHeight, z);
    // Position camera behind and above the target
    camera.position.set(x, y + 2, z + 5);
    controls.update();
    verticalVelocity = 0;
}

function switchMap(mapName, isBuiltin = false) {
    // Clear current map
    while (map.children.length > 0) {
        const child = map.children[0];
        disposeHierarchy(child);
        map.remove(child);
    }
    map.position.set(0, 0, 0);
    map.rotation.set(0, 0, 0);
    map.scale.set(1, 1, 1);
    mapLoaded = false;
    activeMapName = mapName;
    localStorage.setItem('activeMap', mapName);
    const onLoad = (gltf) => {
        map.add(gltf.scene);
        gltf.scene.traverse(n => { 
            if(n.isMesh) {
                n.userData.isMap = true;
                n.geometry.computeBoundsTree(); // Generate BVH
            } 
        });
        if (!scene.children.includes(map)) scene.add(map);
        mapLoaded = true;
        updateCollisionMeshes();

        applyMapTransform(mapName);

        // Check spawn point
        const spawnKey = getMapSpawnKey(mapName);
        let savedSpawn = localStorage.getItem(spawnKey);
        if (!savedSpawn && isBuiltin && localStorage.getItem('spawnPoint')) {
            // Migrate old key
            savedSpawn = localStorage.getItem('spawnPoint');
            localStorage.setItem(spawnKey, savedSpawn);
        }

        if (!savedSpawn) {
            // No spawn point — teleport to origin and enter edit mode
            teleportTo(0, 0, 0);
            enterMapEditMode();
            document.getElementById('map-edit-toast-msg').innerHTML =
                '🗺️ Bienvenue ! Placez votre map ou déplacez-vous, puis cliquez sur <strong>Set Respawn</strong> pour définir votre point d\'apparition.';
        } else {
            const spawnPos = JSON.parse(savedSpawn);
            teleportTo(spawnPos.x, spawnPos.y, spawnPos.z);
        }

        updateMapInventoryUI();
        loadWorld();
    };

    if (isBuiltin) {
        gltfLoader.load(`/models/terrain/${mapName}.glb`, onLoad);
    } else {
        getFileFromDB(mapName).then(arrayBuffer => {
            if (arrayBuffer) {
                const url = URL.createObjectURL(new Blob([arrayBuffer]));
                gltfLoader.load(url, (gltf) => { onLoad(gltf); URL.revokeObjectURL(url); });
            }
        });
    }
}

function updateMapInventoryUI() {
    const container = document.getElementById('map-inventory-container');
    if (!container) return;
    const inv = getMapInventory();
    container.innerHTML = '';
    inv.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'map-inventory-row' + (entry.name === activeMapName ? ' active-map' : '');

        const label = document.createElement('span');
        label.textContent = (entry.isBuiltin ? '🌍 ' : '📂 ') + entry.name;
        row.appendChild(label);

        const btns = document.createElement('div');
        btns.className = 'map-row-btns';

        const loadBtn = document.createElement('button');
        loadBtn.className = 'hud-btn';
        loadBtn.textContent = entry.name === activeMapName ? 'Active' : 'Charger';
        loadBtn.disabled = entry.name === activeMapName;
        loadBtn.onclick = () => {
            document.getElementById('map-modal').classList.add('hidden');
            switchMap(entry.name, entry.isBuiltin);
        };
        btns.appendChild(loadBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'hud-btn';
        editBtn.textContent = '✏️ Éditer';
        editBtn.onclick = () => {
            document.getElementById('map-modal').classList.add('hidden');
            if (entry.name !== activeMapName) switchMap(entry.name, entry.isBuiltin);
            else enterMapEditMode();
        };
        btns.appendChild(editBtn);

        row.appendChild(btns);
        
        // Mobile UX: Make the entire row clickable to load the map
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            // Only trigger if we didn't click another button inside
            if (e.target.tagName !== 'BUTTON') {
                if (entry.name !== activeMapName) {
                    document.getElementById('map-modal').classList.add('hidden');
                    switchMap(entry.name, entry.isBuiltin);
                }
            }
        });

        container.appendChild(row);
    });
}

// group for the avatar
let avatarGroup = new THREE.Group();
// will be added to interactiveGroup later

// Load initial spawn point handled by switchMap

// OrbitControls setup
const controls = new OrbitControls(camera, document.querySelector('canvas'));
controls.enableDamping = true;
controls.dampingFactor = 0.2; // Sharper feel, less inertia
controls.minDistance = 0.1; // for 1st person
controls.maxDistance = 10;
controls.enablePan = false; // we want to orbit around the character only

// Reliable detection of manual camera rotation
controls.addEventListener('start', () => {
    isUserRotatingCamera = true;
});
controls.addEventListener('end', () => {
    isUserRotatingCamera = false;
    lastManualRotationTime = Date.now();
});

const canvas = document.querySelector('canvas');
const hideModifiers = (e) => {
    Object.defineProperty(e, 'shiftKey', { value: false });
    Object.defineProperty(e, 'ctrlKey', { value: false });
    Object.defineProperty(e, 'metaKey', { value: false });
};
canvas.addEventListener('pointerdown', hideModifiers, { capture: true });
canvas.addEventListener('pointermove', hideModifiers, { capture: true });
canvas.addEventListener('pointerup', hideModifiers, { capture: true });


// --- Reusable objects for high performance (No GC) ---
const _flyDir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDirection = new THREE.Vector3();
const _wallRayPos = new THREE.Vector3();
const _floorRayPos = new THREE.Vector3();
const _downVector = new THREE.Vector3(0, -1, 0);
const _oldAvatarPos = new THREE.Vector3();
const _deltaPos = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _nearbyMeshes = []; 
const _tempVec = new THREE.Vector3();


// Physics variables
let verticalVelocity = 0;
let gravity = 0.005;
let isGrounded = false;
let jumpForce = 0.2;



// State variables for camera
let isCrouching = false;
let isSliding = false;
let isUserRotatingCamera = false;
let lastManualRotationTime = 0;
let currentHeadHeight = 1.5;

// HUD State
let isDancing = null;
let isGhostMode = false;
let currentPlacedObject = null;

// avatar raycast to detect collision with the floor direction -y
let raycasterAvatar = new THREE.Raycaster();
raycasterAvatar.near = 0;
raycasterAvatar.far = 2.5; // Increased to reach from head height (1.5) down past the feet (-1.0)

// raycast for wall collisions
let raycasterWall = new THREE.Raycaster();
raycasterWall.near = 0;
raycasterWall.far = 0.5; // distance of detection for walls


// add avatar glb
let avatar = new THREE.Group();

let gltf;
let mixer;
const actions = {};
let activeAction = null;

function fadeToAction(name, duration) {
    if (!actions[name]) return;
    const nextAction = actions[name];
    if (activeAction !== nextAction) {
        if (activeAction) activeAction.fadeOut(duration);
        nextAction.reset().fadeIn(duration).play();
        activeAction = nextAction;
    }
}

new GLTFLoader().load('/models/avatar/avatar.glb', function (model) {
    gltf = model;
    avatar.add(gltf.scene);
    avatarGroup.add(avatar);
    avatar.position.set(0, 0, 0);
    avatar.rotateY(Math.PI);
    // create an animation mixer for the avatar
    mixer = new THREE.AnimationMixer(avatar);

    // Store all animations by name
    gltf.animations.forEach(animation => {
        actions[animation.name] = mixer.clipAction(animation);
    });

    activeAction = actions['Idle Listening'];
    if (activeAction) activeAction.play();
});

/*
list animations : 
Crouch_Fwd_Loop
Crouch_Idle_Loop
Dance Body Roll
Dance Charleston
Idle Listening
Jog_Fwd_Loop
Jump_Land
Jump_Start
Slide_Exit
Slide_Loop
Slide_Start
Sprint_Loop
Walk_Loop
*/

scene.add(avatarGroup);


// keyboard controls for the avatar
const keys = {};

document.addEventListener('keydown', (event) => {
    keys[event.code] = true;
});

document.addEventListener('keyup', (event) => {
    keys[event.code] = false;
});

// --- Mobile Joysticks Logic ---
export const mobileState = {
    joystickMoveVector: new THREE.Vector2(0, 0),
    joystickLookVector: new THREE.Vector2(0, 0),
    isMobileSprinting: false,
    isMobileCrouching: false,
    isMobileJumping: false
};

export const vrState = {
    vrMoveVector: new THREE.Vector2(0, 0),
    vrLookVector: new THREE.Vector2(0, 0)
};

// Expose variables for backward compatibility within main.js without renaming everything
let joystickMoveVector = mobileState.joystickMoveVector;
let joystickLookVector = mobileState.joystickLookVector;
let vrMoveVector = vrState.vrMoveVector;
let vrLookVector = vrState.vrLookVector;

// Create getter properties so the variables sync with the state object
Object.defineProperty(window, 'isMobileCrouching', { get: () => mobileState.isMobileCrouching, set: (val) => mobileState.isMobileCrouching = val });
Object.defineProperty(window, 'isMobileJumping', { get: () => mobileState.isMobileJumping, set: (val) => mobileState.isMobileJumping = val });
Object.defineProperty(window, 'isMobileSprinting', { get: () => mobileState.isMobileSprinting, set: (val) => mobileState.isMobileSprinting = val });

function syncMobileControls() {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isMobile) return;
    
    // Fallback sync before the module loads
    const actionButtons = document.getElementById('mobile-actions');
    const lookJoystick = document.getElementById('joystick-look-container');

    if (isGhostMode || isMapEditMode) {
        if (actionButtons) actionButtons.classList.add('hidden');
        if (lookJoystick) lookJoystick.classList.remove('hidden');
    } else {
        if (actionButtons) actionButtons.classList.remove('hidden');
        if (lookJoystick) lookJoystick.classList.add('hidden');
    }
}

// Dynamically load mobile controls if on mobile device
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    import('./mobile.js').then(module => {
        module.initMobileControls(mobileState, isGhostMode, isMapEditMode);
        // Override sync function to use the one from module
        window.syncMobileControls = () => module.syncMobileControls(isGhostMode, isMapEditMode);
    }).catch(err => console.error("Error loading mobile controls:", err));
}


// keyboard movement function
function moveAvatar() {
    const isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isGhostMode) {
        _flyDir.set(0, 0, 0);
        camera.getWorldDirection(_fwd);
        _right.crossVectors(_fwd, _upVec);

        if (keys['KeyW']) _flyDir.add(_fwd);
        if (keys['KeyS']) _flyDir.sub(_fwd);
        if (keys['KeyA']) _flyDir.sub(_right);
        if (keys['KeyD']) _flyDir.add(_right);
        if (keys['Space']) _flyDir.add(_upVec);
        if (keys['ControlLeft']) _flyDir.sub(_upVec);

        // Add Joystick input for ghost mode
        if (joystickMoveVector.length() > 0.1) {
            _flyDir.addScaledVector(_fwd, joystickMoveVector.y);
            _flyDir.addScaledVector(_right, joystickMoveVector.x);
        }
        
        if (isMobileDevice) {
            controls.enabled = false;
        }
        
        // Look Joystick in Ghost Mode - Uniform control
        if (joystickLookVector.length() > 0.05) {
            const lookSpeed = 0.03; 
            controls.rotateLeft(joystickLookVector.x * lookSpeed);
            controls.rotateUp(-joystickLookVector.y * lookSpeed);
        }

        // Add VR input for ghost mode flying
        if (vrMoveVector.length() > 0.1) {
            _flyDir.addScaledVector(_fwd, vrMoveVector.y);
            _flyDir.addScaledVector(_right, vrMoveVector.x);
        }

        let ghostFlySpeed = 0.2;
        if (keys['ShiftLeft'] || keys['ShiftRight'] || vrState.isVRSprinting) ghostFlySpeed = 0.5;

        if (renderer.xr.isPresenting) {
            // In VR, move the avatar group to fly, because camera position is locked to headset
            avatarGroup.position.addScaledVector(_flyDir, ghostFlySpeed);
            // Right stick turns the player in VR in Ghost mode
            if (Math.abs(vrLookVector.x) > 0.1) {
                avatarGroup.rotation.y -= vrLookVector.x * 0.05;
            }
        } else {
            camera.position.addScaledVector(_flyDir, ghostFlySpeed);
            // Force the controls target to follow the camera
            controls.target.copy(camera.position).add(_fwd);
        }
        return;
    }

    // Wait for both avatar and map to be fully loaded before moving/falling
    if (!mixer || !gltf || !mapLoaded) return;

    let isMoving = false;
    let isSprinting = false;
    isCrouching = keys['ControlLeft'] || keys['ControlRight'] || keys['MetaLeft'] || keys['MetaRight'] || isMobileCrouching;
    let walkSpeed = 0.02;

    // Auto-sprint on mobile if joystick is pushed far
    const isJoystickSprinting = joystickMoveVector.length() > 0.8;
    const isVRSprintActive = vrState.isVRSprinting && vrMoveVector.length() > 0.1;

    if ((keys['ShiftLeft'] || keys['ShiftRight'] || isJoystickSprinting || isVRSprintActive) && (keys['KeyW'] || joystickMoveVector.length() > 0.1 || vrMoveVector.length() > 0.1)) {
        isSprinting = true;
    }

    isSliding = false; // Reset each frame to recalculate based on conditions

    if (isSprinting && isCrouching) {
        isSliding = true;
        isSprinting = false;
        isCrouching = false;
        walkSpeed = 0.14; // keep sprint speed for sliding
    } else if (isCrouching) {
        walkSpeed = 0.01;
    } else if (isSprinting) {
        walkSpeed = 0.14;
    }

    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    _fwd.normalize();
    _right.crossVectors(_fwd, _upVec);

    _moveDirection.set(0, 0, 0);

    if (renderer.xr.isPresenting) {
        // VR Movement
        if (vrMoveVector.length() > 0.1) {
            _moveDirection.addScaledVector(_fwd, vrMoveVector.y);
            _moveDirection.addScaledVector(_right, vrMoveVector.x);
        }
        if (Math.abs(vrLookVector.x) > 0.1) {
            avatarGroup.rotation.y -= vrLookVector.x * 0.05;
        }
        _moveDirection.normalize();
        // Skip rotationOffset and camera-sync logic in VR
    } else {
        // Standard Movement
        if (!isMobileDevice) {
            if (keys['KeyW']) _moveDirection.add(_fwd);
            if (keys['KeyS']) _moveDirection.sub(_fwd);
            if (keys['KeyA']) _moveDirection.sub(_right);
            if (keys['KeyD']) _moveDirection.add(_right);
        } else if (isMobileDevice) {
            if (joystickMoveVector.length() > 0.1) {
                _moveDirection.addScaledVector(_fwd, joystickMoveVector.y);
                _moveDirection.addScaledVector(_right, joystickMoveVector.x);
                
                const now = Date.now();
                controls.enabled = false;
                
                if (!isUserRotatingCamera && (now - lastManualRotationTime > 1000)) {
                    const rotationFactor = 0.08; 
                    controls.rotateLeft(joystickMoveVector.x * rotationFactor);
                }
            } else {
                controls.enabled = true;
            }
        }

        _moveDirection.normalize();

        // Calculate rotation offset for strafing (moving left/right)
        let rotationOffset = 0;
        
        // If using joystick, rotation is directly from vector
        if (joystickMoveVector.length() > 0.1) {
            rotationOffset = -Math.atan2(joystickMoveVector.x, joystickMoveVector.y);
        } else {
            if (keys['KeyA'] && !keys['KeyW'] && !keys['KeyS']) rotationOffset = Math.PI / 2;
            else if (keys['KeyD'] && !keys['KeyW'] && !keys['KeyS']) rotationOffset = -Math.PI / 2;
            else if (keys['KeyA'] && keys['KeyW']) rotationOffset = Math.PI / 4;
            else if (keys['KeyD'] && keys['KeyW']) rotationOffset = -Math.PI / 4;
            else if (keys['KeyA'] && keys['KeyS']) rotationOffset = 3 * Math.PI / 4;
            else if (keys['KeyD'] && keys['KeyS']) rotationOffset = -3 * Math.PI / 4;
            else if (keys['KeyS']) rotationOffset = Math.PI;
        }

        // Character rotation logic
        if (!isMobileDevice || _moveDirection.length() > 0.01) {
            avatarGroup.rotation.y = Math.atan2(_fwd.x, _fwd.z) + Math.PI + rotationOffset;
        }
    }


    // Fast spatial filter without allocating new arrays - REUSED for both wall and floor
    _nearbyMeshes.length = 0;
    for (let i = 0; i < collisionMeshes.length; i++) {
        const m = collisionMeshes[i];
        m.getWorldPosition(_tempVec);
        if (m.userData.isMap || _tempVec.distanceToSquared(avatarGroup.position) < 1600) { 
            _nearbyMeshes.push(m);
        }
    }

    // Wall collision detection
    if (_moveDirection.length() > 0) {
        _wallRayPos.copy(avatarGroup.position);
        _wallRayPos.y += 0.8;
        raycasterWall.set(_wallRayPos, _moveDirection);

        let wallIntersections = raycasterWall.intersectObjects(_nearbyMeshes, false);
        
        let isBlocked = false;
        for (let i = 0; i < wallIntersections.length; i++) {
            const intersect = wallIntersections[i];
            if (intersect.face && intersect.face.normal.y > 0.5) continue;
            if (intersect.object === avatar || intersect.object.parent === avatarGroup) continue;
            
            isBlocked = true;
            break;
        }

        if (!isBlocked) {
            avatarGroup.position.addScaledVector(_moveDirection, walkSpeed);
            isMoving = true;
            isDancing = null; // Cancel dance on movement
        }
    }

    // Jump logic
    if ((keys['Space'] || isMobileJumping || vrState.isVRJumping) && isGrounded) {
        verticalVelocity = jumpForce;
        isGrounded = false;
    }

    // Apply gravity
    if (!isGrounded) {
        verticalVelocity -= gravity;
    } else {
        verticalVelocity = 0;
    }

    avatarGroup.position.y += verticalVelocity;

    // Floor detection
    _floorRayPos.copy(avatarGroup.position);
    _floorRayPos.y += 1.5;
    raycasterAvatar.set(_floorRayPos, _downVector);
 
    let floorIntersections = raycasterAvatar.intersectObjects(_nearbyMeshes, false);
    
    // Pick the first horizontal surface
    let bestFloorHit = null;
    for (let i = 0; i < floorIntersections.length; i++) {
        const hit = floorIntersections[i];
        if (hit.face && hit.face.normal.y > 0.5) {
            bestFloorHit = hit;
            break;
        }
    }

    if (bestFloorHit) {
        let hitPointY = bestFloorHit.point.y;
        let diff = hitPointY - avatarGroup.position.y;
        
        // diff is positive if floor is ABOVE avatar's feet (e.g. going up stairs)
        // diff is negative if floor is BELOW avatar's feet (e.g. going down slopes or falling)

        if (isGrounded) {
            // Allow stepping up (max 0.8) and stepping down (max -0.5 to stick to downward slopes)
            if (diff <= 0.8 && diff >= -0.5) {
                avatarGroup.position.y = hitPointY;
                isGrounded = true;
                verticalVelocity = 0;
            } else {
                isGrounded = false;
            }
        } else {
            // In the air: snap to floor only if falling and the floor is exactly at or slightly above our feet
            if (verticalVelocity <= 0 && diff >= 0) {
                avatarGroup.position.y = hitPointY;
                isGrounded = true;
                verticalVelocity = 0;
            } else {
                isGrounded = false;
            }
        }
    } else {
        isGrounded = false;
    }

    // Animation management
    let targetAnimation = 'Idle Listening';

    if (!isGrounded) {
        targetAnimation = 'Jump_Start';
    } else if (isSliding) {
        targetAnimation = 'Slide_Loop';
    } else if (isCrouching) {
        if (isMoving) {
            targetAnimation = 'Crouch_Fwd_Loop';
        } else {
            targetAnimation = 'Crouch_Idle_Loop';
        }
    } else if (isMoving) {
        if (isSprinting) {
            targetAnimation = 'Sprint_Loop';
        } else {
            targetAnimation = 'Walk_Loop';
        }
    } else if (isDancing) {
        targetAnimation = isDancing;
    }

    fadeToAction(targetAnimation, 0.2);
}

const glCanvas = document.getElementById('app');
if (!glCanvas) console.error("Canvas #app not found!");

// Fix for WebXR Emulator / Polyfill: hide XRWebGLBinding to avoid type errors
// during session initialization when a polyfilled XRSession is used.
if (window.XRWebGLBinding) {
    window._XRWebGLBinding = window.XRWebGLBinding; // backup
    window.XRWebGLBinding = undefined;
}

renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: false,
    alpha: true
});
renderer.xr.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

let updateVRGrab = () => {};
let updateVRInput = () => {};
let onVRPropertiesMenuUpdated = () => {};

if ('xr' in navigator) {
    navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
        if (supported) {
            import('./vr.js').then(module => {
                const vrApi = module.initVR({
                    renderer, scene, camera, avatarGroup, controls,
                    getCollisionMeshes: () => collisionMeshes,
                    updateCollisionMeshes,
                    saveWorld, updatePropertiesMenu,
                    getCurrentPlacedObject: () => currentPlacedObject,
                    setCurrentPlacedObject: (obj) => currentPlacedObject = obj,
                    transformControls,
                    vrState
                });
                updateVRGrab = vrApi.updateVRGrab;
                updateVRInput = vrApi.updateVRInput;
                onVRPropertiesMenuUpdated = vrApi.onPropertiesMenuUpdated;
            }).catch(err => console.error("Error loading VR module:", err));
        }
    });
}

// --- HUD & Interaction Logic ---

// TransformControls setup for Object Placement
const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls.getHelper());

// Disable OrbitControls while dragging the gizmo
transformControls.addEventListener('dragging-changed', function (event) {
    controls.enabled = !event.value;
    if (!event.value) {
        // Just finished dragging
        updateCollisionMeshes();
        saveWorld();
        if (currentPlacedObject) {
            updatePropertiesMenu(currentPlacedObject);
        }
    }
});

const snapRaycaster = new THREE.Raycaster();
transformControls.addEventListener('change', () => {
    if (isMapEditMode) {
        updatePropertiesMenu(map);
        saveMapTransform(activeMapName);
        return;
    }
    if (currentPlacedObject) {
        // Snap to floor
        let pos = currentPlacedObject.position.clone();
        pos.y += 5; // Cast from high up
        snapRaycaster.set(pos, new THREE.Vector3(0, -1, 0));
        let intersects = snapRaycaster.intersectObjects(collisionMeshes, false);
        
        // Ignore the object itself
        intersects = intersects.filter(hit => {
            let obj = hit.object;
            while (obj) {
                if (obj === currentPlacedObject) return false;
                obj = obj.parent;
            }
            return true;
        });

        if (intersects.length > 0 && currentPlacedObject.userData.collision) {
            // Only snap if collision is ON
            currentPlacedObject.position.y = Math.max(currentPlacedObject.position.y, intersects[0].point.y);
        }
        updatePropertiesMenu(currentPlacedObject);
        saveWorld();
    }
});

// --- Properties Menu Logic ---
const propMenu = document.getElementById('properties-menu');
const propInputs = ['x', 'y', 'z'].reduce((acc, axis) => {
    acc[axis] = {
        slider: document.getElementById(`prop-${axis}-slider`),
        input: document.getElementById(`prop-${axis}-input`)
    };
    return acc;
}, {});
const rotInputs = ['x', 'y', 'z'].reduce((acc, axis) => {
    acc[axis] = {
        slider: document.getElementById(`prop-r${axis}-slider`),
        input: document.getElementById(`prop-r${axis}-input`)
    };
    return acc;
}, {});
const scaleInputs = ['x', 'y', 'z'].reduce((acc, axis) => {
    acc[axis] = {
        slider: document.getElementById(`prop-s${axis}-slider`),
        input: document.getElementById(`prop-s${axis}-input`)
    };
    return acc;
}, {});

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

let isUniformScale = false;
const btnUniformScale = document.getElementById('btn-uniform-scale');
btnUniformScale.addEventListener('click', () => {
    isUniformScale = !isUniformScale;
    btnUniformScale.classList.toggle('active', isUniformScale);
});

document.getElementById('properties-header').addEventListener('click', () => {
    propMenu.classList.toggle('collapsed');
});

function updatePropertiesMenu(object) {
    onVRPropertiesMenuUpdated(object);
    
    if (!object) {
        propMenu.classList.add('hidden');
        return;
    }
    propMenu.classList.remove('hidden');
    ['x', 'y', 'z'].forEach(axis => {
        const val = object.position[axis].toFixed(2);
        propInputs[axis].slider.value = val;
        propInputs[axis].input.value = val;
    });
    ['x', 'y', 'z'].forEach(axis => {
        const deg = (object.rotation[axis] * RAD2DEG).toFixed(1);
        rotInputs[axis].slider.value = deg;
        rotInputs[axis].input.value = deg;
    });
    ['x', 'y', 'z'].forEach(axis => {
        const val = object.scale[axis].toFixed(2);
        scaleInputs[axis].slider.value = val;
        scaleInputs[axis].input.value = val;
    });

    const btnCollision = document.getElementById('btn-collision-toggle');
    if (object.userData.collision) {
        btnCollision.textContent = 'Collision: ON';
        btnCollision.classList.add('collision-on');
    } else {
        btnCollision.textContent = 'Collision: OFF';
        btnCollision.classList.remove('collision-on');
    }
    const btnCollisionType = document.getElementById('btn-collision-type');
    const cType = object.userData.collisionType || 'mesh';
    btnCollisionType.textContent = `Shape: ${cType.toUpperCase()}`;
    // Show/hide based on whether it's a map (map always uses mesh)
    btnCollisionType.style.display = object.userData.isMap ? 'none' : 'block';
}

['x', 'y', 'z'].forEach(axis => {
    const updatePos = (e) => {
        const target = isMapEditMode ? map : currentPlacedObject;
        if (target) {
            target.position[axis] = parseFloat(e.target.value);
            propInputs[axis].slider.value = e.target.value;
            propInputs[axis].input.value = e.target.value;
            if (isMapEditMode) saveMapTransform(activeMapName);
            else saveWorld();
        }
    };
    propInputs[axis].slider.addEventListener('input', updatePos);
    propInputs[axis].input.addEventListener('change', updatePos);
    
    const updateRot = (e) => {
        const target = isMapEditMode ? map : currentPlacedObject;
        if (target) {
            target.rotation[axis] = parseFloat(e.target.value) * DEG2RAD;
            rotInputs[axis].slider.value = e.target.value;
            rotInputs[axis].input.value = e.target.value;
            if (isMapEditMode) saveMapTransform(activeMapName);
            else saveWorld();
        }
    };
    rotInputs[axis].slider.addEventListener('input', updateRot);
    rotInputs[axis].input.addEventListener('change', updateRot);

    const updateScale = (e) => {
        const target = isMapEditMode ? map : currentPlacedObject;
        if (target) {
            const val = Math.max(0.01, parseFloat(e.target.value));
            
            if (isUniformScale) {
                target.scale.set(val, val, val);
                ['x', 'y', 'z'].forEach(a => {
                    scaleInputs[a].slider.value = val;
                    scaleInputs[a].input.value = val;
                });
            } else {
                target.scale[axis] = val;
                scaleInputs[axis].slider.value = e.target.value;
                scaleInputs[axis].input.value = e.target.value;
            }
            
            if (isMapEditMode) saveMapTransform(activeMapName);
            else saveWorld();
        }
    };
    scaleInputs[axis].slider.addEventListener('input', updateScale);
    scaleInputs[axis].input.addEventListener('change', updateScale);
});

// --- Gizmo Mode Buttons ---
const gizmoModeBtns = {
    translate: document.getElementById('btn-mode-translate'),
    rotate:    document.getElementById('btn-mode-rotate'),
    scale:     document.getElementById('btn-mode-scale'),
};

function setGizmoMode(mode) {
    transformControls.setMode(mode);
    Object.entries(gizmoModeBtns).forEach(([key, btn]) => {
        btn.classList.toggle('active', key === mode);
    });
}

gizmoModeBtns.translate.addEventListener('click', () => setGizmoMode('translate'));
gizmoModeBtns.rotate.addEventListener('click',    () => setGizmoMode('rotate'));
gizmoModeBtns.scale.addEventListener('click',     () => setGizmoMode('scale'));

// Keyboard shortcuts: G = move, R = rotate, T = scale
window.addEventListener('keydown', (e) => {
    if (!currentPlacedObject && !isMapEditMode) return;
    if (document.activeElement.tagName === 'INPUT') return; // don't trigger when typing
    if (e.code === 'KeyG') setGizmoMode('translate');
    if (e.code === 'KeyR') setGizmoMode('rotate');
    if (e.code === 'KeyT') setGizmoMode('scale');
});

document.getElementById('btn-collision-toggle').addEventListener('click', (e) => {
    if (currentPlacedObject) {
        if (currentPlacedObject.userData.collision) {
            currentPlacedObject.userData.collision = false;
            e.target.textContent = 'Collision: OFF';
            e.target.classList.remove('collision-on');
        } else {
            currentPlacedObject.userData.collision = true;
            e.target.textContent = 'Collision: ON';
            e.target.classList.add('collision-on');
        }
        updateCollisionMeshes();
        saveWorld();
    }
});

document.getElementById('btn-collision-type').addEventListener('click', (e) => {
    if (currentPlacedObject) {
        const current = currentPlacedObject.userData.collisionType || 'mesh';
        const next = current === 'mesh' ? 'box' : 'mesh';
        currentPlacedObject.userData.collisionType = next;
        
        if (next === 'box') {
            createBoxProxy(currentPlacedObject);
        }
        
        e.target.textContent = `Shape: ${next.toUpperCase()}`;
        updateCollisionMeshes();
        saveWorld();
    }
});

document.getElementById('btn-delete').addEventListener('click', () => {
    if (currentPlacedObject) {
        transformControls.detach();
        disposeHierarchy(currentPlacedObject);
        scene.remove(currentPlacedObject);
        currentPlacedObject = null;
        updatePropertiesMenu(null);
        updateCollisionMeshes();
        saveWorld();
    }
});

// --- Object Selection (Mouse Raycaster) ---
const mouse = new THREE.Vector2();
const selectionRaycaster = new THREE.Raycaster();

document.querySelector('canvas').addEventListener('pointerdown', (event) => {
    if (transformControls.dragging) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    selectionRaycaster.setFromCamera(mouse, camera);

    const selectableObjects = [];
    scene.traverse((obj) => {
        if (obj.userData && obj.userData.isSelectable) {
            selectableObjects.push(obj);
        }
    });

    const intersects = selectionRaycaster.intersectObjects(selectableObjects, true);

    if (intersects.length > 0) {
        let object = intersects[0].object;
        while (object.parent && object.parent !== scene && !object.userData.isSelectable && object !== currentPlacedObject) {
            object = object.parent;
        }
        
        currentPlacedObject = object;
        transformControls.attach(currentPlacedObject);
        transformControls.visible = true; // Ensure visibility
        updatePropertiesMenu(currentPlacedObject);
    } else if (!isMapEditMode) {
        // Deselect if clicking empty space, BUT only if not in map edit mode
        transformControls.detach();
        currentPlacedObject = null;
        updatePropertiesMenu(null);
    }
});
// Don't select objects when in map edit mode
document.querySelector('canvas').addEventListener('pointerdown', () => {
    if (isMapEditMode) return; // handled by the listener above but guard just in case
}, { capture: true });

// HUD Buttons
document.getElementById('btn-emotes-toggle').addEventListener('click', () => {
    document.getElementById('circular-menu').classList.toggle('hidden');
});
document.getElementById('btn-dance1').addEventListener('click', () => {
    isDancing = 'Dance Body Roll';
    document.getElementById('circular-menu').classList.add('hidden');
});
document.getElementById('btn-dance2').addEventListener('click', () => {
    isDancing = 'Dance Charleston';
    document.getElementById('circular-menu').classList.add('hidden');
});

document.getElementById('btn-set-respawn').addEventListener('click', (e) => {
    e.stopPropagation();
    const spawnKey = getMapSpawnKey(activeMapName);
    let pos;
    if (isGhostMode) {
        // If flying (ghost or edit), use camera position but adjust to be on floor
        pos = camera.position.clone();
        pos.y -= 1.5; // Offset to account for eye level
    } else {
        pos = avatarGroup.position.clone();
    }
    
    localStorage.setItem(spawnKey, JSON.stringify({ x: pos.x, y: pos.y, z: pos.z }));
    localStorage.setItem('spawnPoint', JSON.stringify({ x: pos.x, y: pos.y, z: pos.z }));
    
    showToast("Point de spawn défini !");
    if (isMapEditMode) exitMapEditMode();
});

document.getElementById('btn-respawn').addEventListener('click', (e) => {
    e.stopPropagation();
    const spawnKey = getMapSpawnKey(activeMapName);
    const savedSpawn = localStorage.getItem(spawnKey) || localStorage.getItem('spawnPoint');
    if (savedSpawn) {
        const spawnPos = JSON.parse(savedSpawn);
        teleportTo(spawnPos.x, spawnPos.y, spawnPos.z);
        showToast("Retour au point de spawn");
    } else {
        teleportTo(0, 0, 0);
        showToast("Aucun point de spawn défini");
    }
});

document.getElementById('btn-ghost').addEventListener('click', (e) => {
    isGhostMode = !isGhostMode;
    e.target.classList.toggle('active', isGhostMode);
    
    if (isGhostMode) {
        if (avatar) avatar.visible = false;
        controls.enablePan = true;
    } else {
        if (avatar && !renderer.xr.isPresenting) avatar.visible = true;
        controls.enablePan = false;
        // Teleport camera back to avatar
        let offset = new THREE.Vector3(0, 2, 5).applyAxisAngle(new THREE.Vector3(0,1,0), avatarGroup.rotation.y + Math.PI);
        camera.position.copy(avatarGroup.position).add(offset);
        controls.target.copy(avatarGroup.position);
        controls.target.y += currentHeadHeight;
    }
    syncMobileControls();
});

// Function to spawn a mesh in front of the camera
function spawnObject(mesh, type, fileName = null) {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    
    // Use getWorldPosition since camera might be child of avatar in VR
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    mesh.position.copy(camPos).addScaledVector(fwd, 1.5);
    
    mesh.userData.isSelectable = true;
    mesh.userData.type = type;
    mesh.userData.fileName = fileName;
    
    // Default to box collision for better performance
    mesh.userData.collision = true;
    mesh.userData.collisionType = 'box';
    createBoxProxy(mesh);
    
    scene.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.traverse(n => { 
        if(n.isMesh && !n.geometry.boundsTree) n.geometry.computeBoundsTree(); 
    });
    
    if (currentPlacedObject) {
        transformControls.detach();
    }
    currentPlacedObject = mesh;
    transformControls.attach(mesh);
    transformControls.visible = true;
    updatePropertiesMenu(mesh);
    
    updateCollisionMeshes();
    document.getElementById('add-glb-modal').classList.add('hidden');
    saveWorld();
}


document.getElementById('btn-add-glb').addEventListener('click', () => {
    document.getElementById('add-glb-modal').classList.remove('hidden');
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('add-glb-modal').classList.add('hidden');
});

document.getElementById('btn-hud-toggle').addEventListener('click', () => {
    const wrapper = document.getElementById('hud-wrapper');
    const btn = document.getElementById('btn-hud-toggle');
    wrapper.classList.toggle('minimized');
    btn.classList.toggle('minimized');
    btn.textContent = wrapper.classList.contains('minimized') ? '▲' : '▼';
});

document.getElementById('btn-add-box').addEventListener('click', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
    spawnObject(mesh, 'box');
});

document.getElementById('btn-add-sphere').addEventListener('click', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshStandardMaterial({ color: 0x00aaff }));
    spawnObject(mesh, 'sphere');
});

document.getElementById('btn-add-cone').addEventListener('click', () => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32), new THREE.MeshStandardMaterial({ color: 0x00ffaa }));
    spawnObject(mesh, 'cone');
});

// --- Toast Notification ---
function showToast(message) {
    const toast = document.getElementById('toast-notification');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// --- Drop Zone & File Input ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('glb-file-input');

dropZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        if (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')) {
            const arrayBuffer = await file.arrayBuffer();
            await saveFileToDB(file.name, arrayBuffer);
            updateInventoryUI();
            document.getElementById('add-glb-modal').classList.add('hidden');
            showToast("Modèle importé !");
        }
    }
});

// --- GLB File Input Logic (Click support) ---
const glbFileInput = document.getElementById('glb-file-input');
dropZone.addEventListener('click', () => glbFileInput.click());

glbFileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        if (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')) {
            const arrayBuffer = await file.arrayBuffer();
            await saveFileToDB(file.name, arrayBuffer);
            
            const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
            if (!inventory.includes(file.name)) {
                inventory.push(file.name);
                localStorage.setItem('inventory', JSON.stringify(inventory));
                updateInventoryUI();
            }
        }
    }
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')) {
            const arrayBuffer = await file.arrayBuffer();
            await saveFileToDB(file.name, arrayBuffer);
            
            // Add to inventory
            const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
            if (!inventory.includes(file.name)) {
                inventory.push(file.name);
                localStorage.setItem('inventory', JSON.stringify(inventory));
                updateInventoryUI();
            }
            
            const blob = new Blob([arrayBuffer]);
            const url = URL.createObjectURL(blob);
            new GLTFLoader().load(url, (gltf) => {
                const mesh = gltf.scene;
                spawnObject(mesh, 'custom_glb', file.name);
                URL.revokeObjectURL(url);
            });
        } else {
            alert("Veuillez déposer un fichier .glb ou .gltf");
        }
    }
});

// --- Map Modal & Map Management Event Listeners ---
document.getElementById('btn-change-map').addEventListener('click', () => {
    updateMapInventoryUI();
    document.getElementById('map-modal').classList.remove('hidden');
});
document.getElementById('btn-close-map-modal').addEventListener('click', () => {
    document.getElementById('map-modal').classList.add('hidden');
});
document.getElementById('btn-exit-map-edit').addEventListener('click', () => {
    exitMapEditMode();
});

// --- Map File Input Logic (Click support) ---
const mapDropZone = document.getElementById('map-drop-zone');
const mapFileInput = document.getElementById('map-file-input');
mapDropZone.addEventListener('click', () => mapFileInput.click());

mapFileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        if (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')) {
            const arrayBuffer = await file.arrayBuffer();
            await saveFileToDB(file.name, arrayBuffer);
            
            const inv = getMapInventory();
            if (!inv.find(m => m.name === file.name)) {
                inv.push({ name: file.name, isBuiltin: false });
                saveMapInventory(inv);
                updateMapInventoryUI();
            }
        }
    }
});

mapDropZone.addEventListener('dragover', (e) => { e.preventDefault(); mapDropZone.classList.add('dragover'); });
mapDropZone.addEventListener('dragleave', (e) => { e.preventDefault(); mapDropZone.classList.remove('dragover'); });
mapDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    mapDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')) {
            const arrayBuffer = await file.arrayBuffer();
            await saveFileToDB(file.name, arrayBuffer);
            
            const inv = getMapInventory();
            if (!inv.find(m => m.name === file.name)) {
                inv.push({ name: file.name, isBuiltin: false });
                saveMapInventory(inv);
            }
            document.getElementById('map-modal').classList.add('hidden');
            switchMap(file.name, false);
        } else {
            alert('Veuillez déposer un fichier .glb ou .gltf');
        }
    }
});

// Initialise IndexedDB puis charge le monde sauvegardé
initDB().then(() => {
    updateInventoryUI();
    
    // Ensure CharlyVerse is in map inventory
    const inv = getMapInventory();
    if (!inv.find(m => m.name === 'CharlyVerse')) {
        inv.unshift({ name: 'CharlyVerse', isBuiltin: true });
        saveMapInventory(inv);
    }
    
    // Load the active map
    const activeEntry = inv.find(m => m.name === activeMapName) || { name: 'CharlyVerse', isBuiltin: true };
    switchMap(activeEntry.name, activeEntry.isBuiltin);
});

const stats = new Stats();
document.body.appendChild(stats.dom);

// Use a simple timer if Clock/Timer is problematic
let lastTime = performance.now();


function animate() {
    stats.begin();
    
    updateVRInput();
    updateVRGrab();
    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1); // Cap delta to avoid huge jumps
    lastTime = time;

    _oldAvatarPos.copy(avatarGroup.position);

    moveAvatar();

    _deltaPos.copy(avatarGroup.position).sub(_oldAvatarPos);

    // Calculate target head height based on state
    let targetHeadHeight = 1.5;
    if (isSliding) targetHeadHeight = 0.5;
    else if (isCrouching) targetHeadHeight = 1.0;

    // Smoothly transition head height
    let heightDiff = targetHeadHeight - currentHeadHeight;
    let step = heightDiff * 0.1;
    currentHeadHeight += step;

    if (!isGhostMode && !renderer.xr.isPresenting) {
        // Move the camera by the exact same amount the avatar moved
        _deltaPos.y += step;
        camera.position.add(_deltaPos);
        
        // Update controls target to follow avatar
        controls.target.copy(avatarGroup.position);
        controls.target.y += currentHeadHeight;
    } else if (isGhostMode) {
        // In ghost mode, the target must stay in front of the camera
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        controls.target.copy(camera.position).add(fwd);
    }

    if (!renderer.xr.isPresenting) {
        controls.update();
    }

    // Zoom logic: 1st vs 3rd person
    if (!isGhostMode && !renderer.xr.isPresenting) {
        if (controls.getDistance() < 1) {
            if (avatar) avatar.visible = false;
        } else {
            if (avatar) avatar.visible = true;
        }
    }
    
    renderer.render(scene, camera);
    if (mixer) mixer.update(delta);
    
    stats.end();
}
renderer.setAnimationLoop(animate);

//resize canvas
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});