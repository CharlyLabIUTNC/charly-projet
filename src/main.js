import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { UltraHDRLoader } from 'three/examples/jsm/loaders/UltraHDRLoader.js';

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
                collision: groupCollisionObjects.includes(obj)
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
        const btn = document.createElement('button');
        btn.className = 'hud-btn';
        btn.textContent = fileName;
        btn.onclick = async () => {
            const arrayBuffer = await getFileFromDB(fileName);
            if (arrayBuffer) {
                const blob = new Blob([arrayBuffer]);
                const url = URL.createObjectURL(blob);
                new GLTFLoader().load(url, (gltf) => {
                    spawnObject(gltf.scene, 'custom_glb', fileName);
                    URL.revokeObjectURL(url);
                });
            } else {
                alert("Erreur: fichier introuvable dans la base de données.");
            }
        };
        container.appendChild(btn);
    });
}

function loadWorld() {
    // Clear existing selectable objects
    const objectsToRemove = [];
    scene.traverse((obj) => {
        if (obj.userData && obj.userData.isSelectable) {
            objectsToRemove.push(obj);
        }
    });
    objectsToRemove.forEach(obj => {
        scene.remove(obj);
        const idx = groupCollisionObjects.indexOf(obj);
        if (idx !== -1) groupCollisionObjects.splice(idx, 1);
    });

    const saved = localStorage.getItem(`savedWorld_${activeMapName}`) || localStorage.getItem('savedWorld'); // Fallback for transition
    if (!saved) return;
    try {
        const worldData = JSON.parse(saved);
        worldData.forEach(async (data) => {
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
                    new GLTFLoader().load(url, (gltf) => {
                        const loadedMesh = gltf.scene;
                        loadedMesh.position.set(data.position.x, data.position.y, data.position.z);
                        if (data.rotation) loadedMesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
                        if (data.scale) loadedMesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
                        loadedMesh.userData.isSelectable = true;
                        loadedMesh.userData.type = data.type;
                        loadedMesh.userData.fileName = data.fileName;
                        scene.add(loadedMesh);
                        if (data.collision) {
                            groupCollisionObjects.push(loadedMesh);
                        }
                        URL.revokeObjectURL(url);
                    });
                }
            }
            
            if (mesh) {
                mesh.position.set(data.position.x, data.position.y, data.position.z);
                if (data.rotation) mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
                if (data.scale) mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
                mesh.userData.isSelectable = true;
                mesh.userData.type = data.type;
                scene.add(mesh);
                if (data.collision) {
                    groupCollisionObjects.push(mesh);
                }
            }
        });
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
const texture = await loader.loadAsync( '/models/textures/pav_studio_02_1k.jpg' );
texture.mapping = THREE.EquirectangularReflectionMapping;
scene.background = texture;
scene.environment = texture;

// add map group (content loaded dynamically via switchMap)
let map = new THREE.Group();
let mapLoaded = false;

// collision objects array
let groupCollisionObjects = [];
// We push the 'map' group. Once the GLB loads, its meshes will be inside this group and intersected recursively.
groupCollisionObjects.push(map);

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
    if (avatar) avatar.visible = true;
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

function switchMap(mapName, isBuiltin = false) {
    // Clear current map
    while (map.children.length > 0) map.remove(map.children[0]);
    map.position.set(0, 0, 0);
    map.rotation.set(0, 0, 0);
    map.scale.set(1, 1, 1);
    mapLoaded = false;
    activeMapName = mapName;
    localStorage.setItem('activeMap', mapName);

    const onLoad = (gltf) => {
        map.add(gltf.scene);
        if (!scene.children.includes(map)) scene.add(map);
        if (!groupCollisionObjects.includes(map)) groupCollisionObjects.push(map);
        mapLoaded = true;

        applyMapTransform(mapName);

        // Check spawn point (with backward compat for old 'spawnPoint' key)
        const spawnKey = getMapSpawnKey(mapName);
        let savedSpawn = localStorage.getItem(spawnKey);
        if (!savedSpawn && isBuiltin && localStorage.getItem('spawnPoint')) {
            // Migrate old key
            savedSpawn = localStorage.getItem('spawnPoint');
            localStorage.setItem(spawnKey, savedSpawn);
        }

        if (!savedSpawn) {
            // No spawn point — enter onboarding ghost mode
            camera.position.set(0, 25, 35);
            controls.target.set(0, 0, 0);
            enterMapEditMode();
            document.getElementById('map-edit-toast-msg').innerHTML =
                '🗺️ Placez votre map, puis cliquez sur <strong>Set Respawn</strong> pour définir le point d\'apparition.';
        } else {
            const spawnPos = JSON.parse(savedSpawn);
            avatarGroup.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
        }

        updateMapInventoryUI();
        loadWorld();
    };

    if (isBuiltin) {
        new GLTFLoader().load(`/models/terrain/${mapName}.glb`, onLoad);
    } else {
        getFileFromDB(mapName).then(arrayBuffer => {
            if (arrayBuffer) {
                const url = URL.createObjectURL(new Blob([arrayBuffer]));
                new GLTFLoader().load(url, (gltf) => { onLoad(gltf); URL.revokeObjectURL(url); });
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
        container.appendChild(row);
    });
}

// group for the avatar
let avatarGroup = new THREE.Group();
scene.add(avatarGroup);

// Load spawn point if it exists
let savedSpawn = localStorage.getItem('spawnPoint');
if (savedSpawn) {
    try {
        let spawnPos = JSON.parse(savedSpawn);
        avatarGroup.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    } catch (e) {
        console.error("Invalid spawn point in localStorage", e);
    }
}

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

// --- Mobile Joystick Logic ---
const joystickContainer = document.getElementById('joystick-container');
// --- Mobile Joysticks Logic ---
let joystickMoveVector = new THREE.Vector2(0, 0);
let joystickLookVector = new THREE.Vector2(0, 0);
let isMobileSprinting = false;
let isMobileCrouching = false;
let isMobileJumping = false;

function syncMobileControls() {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isMobile) return;

    const actionButtons = document.getElementById('mobile-actions');
    const lookJoystick = document.getElementById('joystick-look-container');

    if (isGhostMode || isMapEditMode) {
        actionButtons.classList.add('hidden');
        lookJoystick.classList.remove('hidden');
    } else {
        actionButtons.classList.remove('hidden');
        lookJoystick.classList.add('hidden');
    }
}


function setupJoystick(baseId, stickId, onUpdate, onEnd) {
    const base = document.getElementById(baseId);
    const stick = document.getElementById(stickId);
    const container = base.parentElement;
    let activeTouchId = null;

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        container.classList.remove('hidden');
    }

    base.addEventListener('touchstart', (e) => {
        if (activeTouchId !== null) return;
        const touch = e.changedTouches[0];
        activeTouchId = touch.identifier;
        update(touch);
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                update(e.changedTouches[i]);
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                break;
            }
        }
    }, { passive: false });

    const end = (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                activeTouchId = null;
                stick.style.transform = `translate(0, 0)`;
                onEnd();
                break;
            }
        }
    };

    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    function update(touch) {
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const maxDistance = rect.width / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > maxDistance) {
            dx = (dx / distance) * maxDistance;
            dy = (dy / distance) * maxDistance;
        }

        stick.style.transform = `translate(${dx}px, ${dy}px)`;
        onUpdate(dx / maxDistance, -dy / maxDistance);
    }
}

setupJoystick('joystick-move-base', 'joystick-move-stick', 
    (x, y) => joystickMoveVector.set(x, y),
    () => joystickMoveVector.set(0, 0)
);

setupJoystick('joystick-look-base', 'joystick-look-stick',
    (x, y) => joystickLookVector.set(x, y),
    () => joystickLookVector.set(0, 0)
);

// Mobile Action Buttons
const mobileActions = document.getElementById('mobile-actions');
syncMobileControls();


const btnCrouch = document.getElementById('btn-mobile-crouch');
btnCrouch.addEventListener('touchstart', (e) => {
    isMobileCrouching = true;
    btnCrouch.classList.add('active');
    e.preventDefault();
}, { passive: false });
btnCrouch.addEventListener('touchend', () => {
    isMobileCrouching = false;
    btnCrouch.classList.remove('active');
});

const btnJump = document.getElementById('btn-mobile-jump');
btnJump.addEventListener('touchstart', (e) => {
    isMobileJumping = true;
    btnJump.classList.add('active');
    e.preventDefault();
}, { passive: false });
btnJump.addEventListener('touchend', () => {
    isMobileJumping = false;
    btnJump.classList.remove('active');
});


// keyboard movement function
function moveAvatar() {
    if (isGhostMode) {
        // Free fly ghost camera
        let flySpeed = 0.2;
        if (keys['ShiftLeft'] || keys['ShiftRight']) flySpeed = 0.5;

        let flyDir = new THREE.Vector3();
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const right = new THREE.Vector3();
        right.crossVectors(fwd, camera.up);

        if (keys['KeyW']) flyDir.add(fwd);
        if (keys['KeyS']) flyDir.sub(fwd);
        if (keys['KeyA']) flyDir.sub(right);
        if (keys['KeyD']) flyDir.add(right);
        if (keys['Space']) flyDir.add(camera.up);
        if (keys['ControlLeft']) flyDir.sub(camera.up);

        // Add Joystick input for ghost mode
        if (joystickMoveVector.length() > 0.1) {
            flyDir.addScaledVector(fwd, joystickMoveVector.y);
            flyDir.addScaledVector(right, joystickMoveVector.x);
        }
        
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (isMobile) {
            // Block manual OrbitControls rotation in Ghost mode on mobile
            controls.enabled = false;
        }
        
        // Look Joystick in Ghost Mode - Uniform control
        if (joystickLookVector.length() > 0.05) {
            const lookSpeed = 0.03; // Consistent speed
            controls.rotateLeft(joystickLookVector.x * lookSpeed);
            controls.rotateUp(-joystickLookVector.y * lookSpeed);
        }

        camera.position.addScaledVector(flyDir, flySpeed);
        // Force the controls target to follow the camera so we can continue orbiting from the new position
        controls.target.copy(camera.position).add(fwd);
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

    if ((keys['ShiftLeft'] || keys['ShiftRight'] || isJoystickSprinting) && (keys['KeyW'] || joystickMoveVector.length() > 0.1)) {
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

    // Calculate move direction relative to camera
    let moveDirection = new THREE.Vector3(0, 0, 0);

    // Get camera's forward and right vectors
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up);

    if (keys['KeyW']) moveDirection.add(forward);
    if (keys['KeyS']) moveDirection.sub(forward);
    if (keys['KeyA']) moveDirection.sub(right);
    if (keys['KeyD']) moveDirection.add(right);

    // Add Joystick input
    if (joystickMoveVector.length() > 0.1) {
        moveDirection.addScaledVector(forward, joystickMoveVector.y);
        moveDirection.addScaledVector(right, joystickMoveVector.x);
        
        // AUTO-FOLLOW CAMERA: Rotate camera towards movement direction
        // Only on mobile and when not manually rotating (with a 1s buffer after manual rotation)
        const now = Date.now();
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        if (isMobile) {
            // Block manual OrbitControls rotation while moving on mobile
            // to avoid the "camera jumping" issue
            controls.enabled = false;
            
            if (!isUserRotatingCamera && (now - lastManualRotationTime > 1000)) {
                const rotationFactor = 0.08; 
                controls.rotateLeft(joystickMoveVector.x * rotationFactor);
            }
        }
    } else {
        // Re-enable controls if we stop moving
        controls.enabled = true;
    }

    moveDirection.normalize();

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
    const isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    // On desktop, character follows camera. On mobile, character only rotates when moving.
    if (!isMobileDevice || moveDirection.length() > 0.01) {
        avatarGroup.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI + rotationOffset;
    }


    // Wall collision detection
    if (moveDirection.length() > 0) {
        // Lift the ray origin to avoid hitting the floor and low steps (allows climbing stairs)
        let wallRayPos = avatarGroup.position.clone();
        wallRayPos.y += 0.8;

        raycasterWall.set(wallRayPos, moveDirection);
        let wallIntersections = raycasterWall.intersectObjects(groupCollisionObjects, true);

        // Filter out the avatar itself AND floors from wall collisions
        wallIntersections = wallIntersections.filter(intersect => {
            // Ignore mostly horizontal surfaces (floors) so they don't block movement
            if (intersect.face && intersect.face.normal.y > 0.5) return false;

            let obj = intersect.object;
            while (obj) {
                if (obj === avatarGroup) return false;
                obj = obj.parent;
            }
            return true;
        });

        if (wallIntersections.length === 0) {
            avatarGroup.position.addScaledVector(moveDirection, walkSpeed);
            isMoving = true;
            isDancing = null; // Cancel dance on movement
        }
    }

    // Jump logic
    if ((keys['Space'] || isMobileJumping) && isGrounded) {
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

    // Floor detection with raycast
    // We fire the ray from around head height to detect stairs we just stepped over horizontally
    let rayPos = avatarGroup.position.clone();
    rayPos.y += 1.5;
    raycasterAvatar.set(rayPos, new THREE.Vector3(0, -1, 0));

    // Get all intersections with the floor/map and filter out ceilings/walls
    let floorIntersections = raycasterAvatar.intersectObjects(groupCollisionObjects, true).filter(
        intersect => intersect.face && intersect.face.normal.y > 0.5
    );

    if (floorIntersections.length > 0) {
        let hitPointY = floorIntersections[0].point.y;
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

renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('canvas'),
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.render(scene, camera);

// --- HUD & Interaction Logic ---

// TransformControls setup for Object Placement
const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls.getHelper());

// Disable OrbitControls while dragging the gizmo
transformControls.addEventListener('dragging-changed', function (event) {
    controls.enabled = !event.value;
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
        let intersects = snapRaycaster.intersectObjects(groupCollisionObjects, true);
        
        // Ignore the object itself
        intersects = intersects.filter(hit => {
            let obj = hit.object;
            while (obj) {
                if (obj === currentPlacedObject) return false;
                obj = obj.parent;
            }
            return true;
        });

        if (intersects.length > 0) {
            // Only snap if we are dragging horizontally. If user changes Y in menu, we don't want to override it constantly.
            // Actually, for simplicity, we'll let it snap if the gizmo is used.
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

function updatePropertiesMenu(object) {
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
    if (groupCollisionObjects.includes(object)) {
        btnCollision.textContent = 'Collision: ON';
        btnCollision.classList.add('collision-on');
    } else {
        btnCollision.textContent = 'Collision: OFF';
        btnCollision.classList.remove('collision-on');
    }
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
        const idx = groupCollisionObjects.indexOf(currentPlacedObject);
        if (idx !== -1) {
            groupCollisionObjects.splice(idx, 1);
            e.target.textContent = 'Collision: OFF';
            e.target.classList.remove('collision-on');
        } else {
            groupCollisionObjects.push(currentPlacedObject);
            e.target.textContent = 'Collision: ON';
            e.target.classList.add('collision-on');
        }
        saveWorld();
    }
});

document.getElementById('btn-delete').addEventListener('click', () => {
    if (currentPlacedObject) {
        const idx = groupCollisionObjects.indexOf(currentPlacedObject);
        if (idx !== -1) {
            groupCollisionObjects.splice(idx, 1);
        }
        
        scene.remove(currentPlacedObject);
        transformControls.detach();
        
        currentPlacedObject.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        
        currentPlacedObject = null;
        updatePropertiesMenu(null);
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
    console.log("Respawn Clicked");
    const spawnKey = getMapSpawnKey(activeMapName);
    const savedSpawn = localStorage.getItem(spawnKey) || localStorage.getItem('spawnPoint');
    if (savedSpawn) {
        const spawnPos = JSON.parse(savedSpawn);
        // Add safety Y offset to prevent falling under map
        avatarGroup.position.set(spawnPos.x, spawnPos.y + 1.0, spawnPos.z);
        showToast("Retour au point de spawn");
    } else {
        avatarGroup.position.set(0, 0, 0);
        showToast("Aucun point de spawn défini");
    }
    verticalVelocity = 0;
});

document.getElementById('btn-ghost').addEventListener('click', (e) => {
    isGhostMode = !isGhostMode;
    e.target.classList.toggle('active', isGhostMode);
    
    if (isGhostMode) {
        if (avatar) avatar.visible = false;
        controls.enablePan = true;
    } else {
        if (avatar) avatar.visible = true;
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
    mesh.position.copy(camera.position).addScaledVector(fwd, 3);
    
    mesh.userData.isSelectable = true;
    mesh.userData.type = type;
    mesh.userData.fileName = fileName;
    
    scene.add(mesh);
    
    if (currentPlacedObject) {
        transformControls.detach();
    }
    currentPlacedObject = mesh;
    transformControls.attach(mesh);
    updatePropertiesMenu(mesh);
    
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

const mapDropZone = document.getElementById('map-drop-zone');
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
    loadWorld();
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

function animate() {
    requestAnimationFrame(animate);

    let oldAvatarPos = avatarGroup.position.clone();

    moveAvatar();

    let deltaPos = avatarGroup.position.clone().sub(oldAvatarPos);

    // Calculate target head height based on state
    let targetHeadHeight = 1.5;
    if (isSliding) targetHeadHeight = 0.5;
    else if (isCrouching) targetHeadHeight = 1.0;

    // Smoothly transition head height
    let heightDiff = targetHeadHeight - currentHeadHeight;
    let step = heightDiff * 0.1;
    currentHeadHeight += step;

    if (!isGhostMode) {
        // Move the camera by the exact same amount the avatar moved (plus the height adjustment) to keep it locked
        deltaPos.y += step;
        camera.position.add(deltaPos);

        // Update controls target to follow avatar, but only if not doing look-around?
        // Actually, for OrbitControls to work while moving, we MUST update target.
        // The rotation is maintained relative to the target by OrbitControls.
        controls.target.copy(avatarGroup.position);
        controls.target.y += currentHeadHeight;
    } else {
        // In ghost mode, the target must stay in front of the camera to allow "first person" style rotation
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        controls.target.copy(camera.position).add(fwd);
    }

    controls.update();

    // Zoom logic: 1st vs 3rd person (only when not in ghost mode)
    if (!isGhostMode) {
        if (controls.getDistance() < 1) {
            if (avatar) avatar.visible = false;
        } else {
            if (avatar) avatar.visible = true;
        }
    }

    renderer.render(scene, camera);
    if (mixer) mixer.update(1 / 90);
}
animate();


//resize canvas
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});