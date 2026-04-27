import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { UltraHDRLoader } from 'three/examples/jsm/loaders/UltraHDRLoader.js';

let scene, camera, renderer;

scene = new THREE.Scene()

camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

// add light
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

//add hdr for a natural light
const loader = new UltraHDRLoader();
const texture = await loader.loadAsync( '/models/textures/newman_lobby_1k.jpg' );
texture.mapping = THREE.EquirectangularReflectionMapping;
scene.background = texture;
scene.environment = texture;

// add map CharlyLabTextures.glb
let map = new THREE.Group();
let mapLoaded = false;
new GLTFLoader().load('/models/terrain/CharlyVerse.glb', function (model) {
    model.scene.scale.set(1, 1, 1); // Rend la map 5 fois plus grande (ajustez si besoin)
    model.scene.position.y = -2;    // Baisse la map de 2 unités (ajustez si besoin)
    model.scene.position.z = -5;
    map.add(model.scene);
    scene.add(map);
    mapLoaded = true;
});

// collision objects array
let groupCollisionObjects = [];
// We push the 'map' group. Once the GLB loads, its meshes will be inside this group and intersected recursively.
groupCollisionObjects.push(map);

// group for the avatar
let avatarGroup = new THREE.Group();
scene.add(avatarGroup);

// OrbitControls setup
const controls = new OrbitControls(camera, document.querySelector('canvas'));
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.1; // for 1st person
controls.maxDistance = 10;
controls.enablePan = false; // we want to orbit around the character only

// FIX: OrbitControls uses Shift/Ctrl + Left Click to pan by default.
// This blocks camera rotation when sprinting (Shift) or crouching (Ctrl).
// We intercept the pointer events and hide the modifier keys from OrbitControls.
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
let currentHeadHeight = 1.5;

// avatar raycast to detect collision with the floor direction -y
let raycasterAvatar = new THREE.Raycaster();
raycasterAvatar.near = 0;
raycasterAvatar.far = 1;

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

    // affiche les differentes animations possible 
    gltf.animations.forEach(animation => {
        console.log(animation.name);
    });
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

// keyboard movement function
function moveAvatar() {
    // Wait for both avatar and map to be fully loaded before moving/falling
    if (!mixer || !gltf || !mapLoaded) return;

    let isMoving = false;
    let isSprinting = false;
    isCrouching = keys['ControlLeft'] || keys['ControlRight'];
    isSliding = false;
    let walkSpeed = 0.02;

    if ((keys['ShiftLeft'] || keys['ShiftRight']) && keys['KeyW']) {
        isSprinting = true;
    }

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

    moveDirection.normalize();

    // Calculate rotation offset for strafing (moving left/right)
    let rotationOffset = 0;
    if (keys['KeyA'] && !keys['KeyW'] && !keys['KeyS']) rotationOffset = Math.PI / 2;
    else if (keys['KeyD'] && !keys['KeyW'] && !keys['KeyS']) rotationOffset = -Math.PI / 2;
    else if (keys['KeyA'] && keys['KeyW']) rotationOffset = Math.PI / 4;
    else if (keys['KeyD'] && keys['KeyW']) rotationOffset = -Math.PI / 4;
    else if (keys['KeyA'] && keys['KeyS']) rotationOffset = 3 * Math.PI / 4;
    else if (keys['KeyD'] && keys['KeyS']) rotationOffset = -3 * Math.PI / 4;
    else if (keys['KeyS']) rotationOffset = Math.PI;

    // Always rotate avatar to face away from camera (or towards where camera looks)
    // plus the offset to lean into the movement
    avatarGroup.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI + rotationOffset;


    // Wall collision detection
    if (moveDirection.length() > 0) {
        // Lift the ray origin slightly to avoid hitting the floor
        let wallRayPos = avatarGroup.position.clone();
        wallRayPos.y += 0.5;

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
        }
    }

    // Jump logic
    if (keys['Space'] && isGrounded) {
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
    // We fire the ray slightly above the avatar's feet
    let rayPos = avatarGroup.position.clone();
    rayPos.y += 0.5;
    raycasterAvatar.set(rayPos, new THREE.Vector3(0, -1, 0));

    // get all intersections with the floor and the cube 
    let floorIntersections = raycasterAvatar.intersectObjects(groupCollisionObjects, true);
    if (floorIntersections.length > 0) {
        let dist = floorIntersections[0].distance;
        // if we are close enough to the floor
        if (dist <= 0.55 && verticalVelocity <= 0) {
            avatarGroup.position.y = floorIntersections[0].point.y;
            isGrounded = true;
            verticalVelocity = 0;
        } else {
            isGrounded = false;
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
    }

    fadeToAction(targetAnimation, 0.2);
}

renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('canvas'),
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.render(scene, camera);

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

    // Move the camera by the exact same amount the avatar moved (plus the height adjustment) to keep it locked
    deltaPos.y += step;
    camera.position.add(deltaPos);

    // Update controls target to follow avatar
    controls.target.copy(avatarGroup.position);
    controls.target.y += currentHeadHeight; // Look at current head level
    controls.update();

    // Zoom logic: 1st vs 3rd person
    if (controls.getDistance() < 1) {
        if (avatar) avatar.visible = false;
    } else {
        if (avatar) avatar.visible = true;
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