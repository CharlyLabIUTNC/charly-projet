import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import detailsData from './assets/details.json';

export async function generateMuseum(mapScene, gltfLoader) {
    let step = 6;
    let size = new THREE.Vector3(6, 3.5, 6);
    
    // Default position at the end of charlylab. 
    // Si l'espace entre le labo et le musée n'est pas parfait, vous pouvez ajuster la valeur Z (ici 10) et Y (hauteur).
    const startPos = new THREE.Vector3(1, -0.08, 8.5);
    
    // 1. Prepare data
    const hallOfFame = detailsData.hall_of_fame || [];
    const eventsProjects = detailsData.events_projects || [];
    const partners = detailsData.partners || [];
    
    const founders = hallOfFame.filter(p => p.type === 'founder' || p.type === 'worker');
    const others = hallOfFame.filter(p => p.type !== 'founder' && p.type !== 'worker');
    
    const parseYear = (dateStr) => {
        if (!dateStr) return 0;
        const match = dateStr.match(/\d{4}/);
        return match ? parseInt(match[0]) : 0;
    };
    
    const sortedData = [...others, ...eventsProjects, ...partners].sort((a, b) => {
        return parseYear(a.date) - parseYear(b.date);
    });
    
    // 2. Load avatar.glb
    let avatarScene = null;
    let avatarAnimations = [];
    try {
        const gltf = await new Promise((resolve, reject) => {
            gltfLoader.load('/models/avatar/avatar.glb', resolve, undefined, reject);
        });
        avatarScene = gltf.scene;
        avatarAnimations = gltf.animations;
    } catch(e) {
        console.error("Failed to load avatar.glb", e);
    }
    
    const museumGroup = new THREE.Group();
    museumGroup.name = "MuseumGroup";
    mapScene.add(museumGroup);
    
    const createYearCanvas = (year) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0)'; // transparent
        ctx.clearRect(0, 0, 512, 512);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 160px "Now", "Futura", "Century Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(year, 256, 256);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    };

    const createPlaqueCanvas = (item) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f0f0f0'; // Light grey background
        ctx.fillRect(0, 0, 512, 512);
        
        ctx.fillStyle = '#111';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Title
        ctx.font = 'bold 32px Arial';
        const title = item.name || 'Sans titre';
        const titleWords = title.split(' ');
        let line = '';
        let y = 30;
        for(let n = 0; n < titleWords.length; n++) {
            const testLine = line + titleWords[n] + ' ';
            if (ctx.measureText(testLine).width > 450 && n > 0) {
                ctx.fillText(line, 30, y);
                line = titleWords[n] + ' ';
                y += 40;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, 30, y);
        y += 40;
        
        // Date
        if (item.date) {
            ctx.font = 'italic 24px Arial';
            ctx.fillStyle = '#555';
            ctx.fillText(item.date, 30, y);
            y += 35;
        }
        
        // Description
        if (item.description) {
            y += 15;
            ctx.font = '22px Arial';
            ctx.fillStyle = '#333';
            const descWords = item.description.split(' ');
            line = '';
            for(let n = 0; n < descWords.length; n++) {
                const testLine = line + descWords[n] + ' ';
                if (ctx.measureText(testLine).width > 450 && n > 0) {
                    ctx.fillText(line, 30, y);
                    line = descWords[n] + ' ';
                    y += 30;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, 30, y);
        }
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    };

    const createPlaceholderCanvas = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#888';
        ctx.font = '30px Now, "Futura", "Century Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Image', 256, 256);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    };
    
    // 3. Constuire le Sas (Salle d'entrée)
    let sasWidth = 14;
    let sasLength = 14;
    
    const sasCenter = startPos.clone();
    sasCenter.z += sasLength / 2;
    sasCenter.y = startPos.y;
    
    // Sol du Sas
    const sasSolGeo = new THREE.BoxGeometry(sasWidth, 0.2, sasLength);
    const sasSolMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const sasSol = new THREE.Mesh(sasSolGeo, sasSolMat);
    sasSol.position.copy(sasCenter);
    sasSol.position.y -= 0.1;
    museumGroup.add(sasSol);
    
    // Murs du Sas
    const sasRoomMat = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Distinct color for sas
    
    const sasWallL = new THREE.Mesh(new THREE.BoxGeometry(0.2, size.y, sasLength), sasRoomMat);
    sasWallL.position.set(sasCenter.x - sasWidth/2, sasCenter.y + size.y/2, sasCenter.z);
    museumGroup.add(sasWallL);
    
    const sasWallR = new THREE.Mesh(new THREE.BoxGeometry(0.2, size.y, sasLength), sasRoomMat);
    sasWallR.position.set(sasCenter.x + sasWidth/2, sasCenter.y + size.y/2, sasCenter.z);
    museumGroup.add(sasWallR);
    
    const frontSegWidth = (sasWidth - size.x) / 2;
    const sasWallF1 = new THREE.Mesh(new THREE.BoxGeometry(frontSegWidth, size.y, 0.2), sasRoomMat);
    sasWallF1.position.set(sasCenter.x - size.x/2 - frontSegWidth/2, sasCenter.y + size.y/2, sasCenter.z + sasLength/2);
    
    const sasWallB1 = new THREE.Mesh(new THREE.BoxGeometry(frontSegWidth, size.y, 0.2), sasRoomMat);
    sasWallB1.position.set(sasCenter.x - size.x/2 - frontSegWidth/2, sasCenter.y + size.y/2, sasCenter.z - sasLength/2);
    const sasWallB2 = new THREE.Mesh(new THREE.BoxGeometry(frontSegWidth, size.y, 0.2), sasRoomMat);
    sasWallB2.position.set(sasCenter.x + size.x/2 + frontSegWidth/2, sasCenter.y + size.y/2, sasCenter.z - sasLength/2);
    
    museumGroup.add(sasWallF1, sasWallB1, sasWallB2);
    
    // Panneau de Bienvenue (Minecraft Style)
    const welcomeSignGroup = new THREE.Group();
    // Placé près de l'entrée, légèrement sur la gauche
    welcomeSignGroup.position.set(sasCenter.x - sasWidth/2 + 12, sasCenter.y, sasCenter.z - sasLength/2 + 12);
    
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), woodMat);
    post.position.y = 0.7;
    welcomeSignGroup.add(post);
    
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.2, 0.1), woodMat);
    board.position.y = 1.6;
    welcomeSignGroup.add(board);
    
    const welcomeCanvas = document.createElement('canvas');
    welcomeCanvas.width = 1024;
    welcomeCanvas.height = 512;
    const ctx = welcomeCanvas.getContext('2d');
    ctx.fillStyle = '#8b5a2b'; 
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px "Now", "Futura", "Century Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Le Charly Lab', 512, 100);
    ctx.font = '36px "Now", "Futura", "Century Gothic", sans-serif';
    ctx.fillText('ne serait rien sans ses projets', 512, 220);
    ctx.fillText('et les investissements de', 512, 300);
    ctx.fillText('ses étudiants.', 512, 380);
    
    const welcomeTex = new THREE.CanvasTexture(welcomeCanvas);
    welcomeTex.colorSpace = THREE.SRGBColorSpace;
    const welcomePlane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.0), new THREE.MeshBasicMaterial({ map: welcomeTex }));
    welcomePlane.position.y = 1.6;
    welcomePlane.position.z = 0.051;
    welcomeSignGroup.add(welcomePlane);
    
    // Le panneau regarde vers l'entrée (-Z), très légèrement tourné vers le centre
    welcomeSignGroup.rotation.y = Math.PI;
    museumGroup.add(welcomeSignGroup);
    
    // Statues des Fondateurs dans le Sas
    let sasLeftZ = sasCenter.z - sasLength/2 + 7;
    let sasRightZ = sasCenter.z - sasLength/2 + 5;
    
    founders.forEach((f, idx) => {
        const isLeft = (idx % 2 === 0);
        const zPos = isLeft ? sasLeftZ : sasRightZ;
        const xPos = sasCenter.x + (isLeft ? (-sasWidth/2 + 1.5) : (sasWidth/2 - 1.5));
        
        const fGroup = new THREE.Group();
        fGroup.position.set(xPos, sasCenter.y, zPos);
        
        const baseGeo = new THREE.BoxGeometry(0.8, 1, 0.8);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.5;
        fGroup.add(base);
        
        if (avatarScene && avatarAnimations.length > 0) {
            const avatarInstance = SkeletonUtils.clone(avatarScene);
            avatarInstance.position.y = 1;
            avatarInstance.rotation.y = isLeft ? Math.PI/2 : -Math.PI/2;
            const mixer = new THREE.AnimationMixer(avatarInstance);
            const randomAnim = avatarAnimations[Math.floor(Math.random() * avatarAnimations.length)];
            mixer.clipAction(randomAnim).play();
            mixer.setTime(0.1);
            // Marquer tous les meshes de l'avatar pour ne pas les utiliser en collision
            avatarInstance.traverse(n => { if (n.isMesh) n.userData.noCollision = true; });
            fGroup.add(avatarInstance);
        }
        
        // Box proxy de collision invisible pour la statue
        const proxyGeo = new THREE.BoxGeometry(0.8, 2, 0.8);
        const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
        const proxy = new THREE.Mesh(proxyGeo, proxyMat);
        proxy.position.y = 1;
        proxy.userData.isCollisionProxy = true;
        fGroup.add(proxy);
        
        const fPlaqueTex = createPlaqueCanvas(f);
        const fPlaque = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: fPlaqueTex }));
        fPlaque.position.y = 1.5;
        // La statue est à +/- 1.5 du mur. Le mur est épais de 0.1 (demi épaisseur). 
        // Donc on veut la plaque à -1.35 ou +1.35 pour être posée contre le mur !
        fPlaque.position.x = isLeft ? -1.35 : 1.35; 
        fPlaque.position.z = isLeft ? 1.5 : -1.5; // Décalé à gauche
        fPlaque.rotation.y = isLeft ? Math.PI/2 : -Math.PI/2;
        fGroup.add(fPlaque);
        
        museumGroup.add(fGroup);
        
        if (isLeft) sasLeftZ += 3.5;
        else sasRightZ += 3.5;
    });
    
    // 4. Build rectangular loop path for chronological items
    const corridorStartPos = sasCenter.clone();
    corridorStartPos.z += sasLength / 2 + step / 2; // Start exactly after the Sas North wall
    
    let currentPos = corridorStartPos.clone();
    let currentDir = new THREE.Vector3(0, 0, 1);
    let path = [];
    
    let itemsQueue = [...sortedData];
    
    let perimeter = itemsQueue.length + 5; // 3 corners + padding
    let L = Math.ceil((perimeter + 4) / 4);
    let W = Math.ceil((perimeter + 4 - 2*L) / 2);
    if (2*L + 2*W - 4 < perimeter) W++;
    
    const placeCell = (isCorner) => {
        let item = null;
        // On attend la case 1 (path.length > 0) pour ne pas coller la 1ère oeuvre dans l'ouverture du Sas
        if (path.length > 0 && !isCorner && itemsQueue.length > 0) {
            item = itemsQueue.shift();
        }
        let year = -1;
        if (item && item.date) {
            year = parseYear(item.date);
        }
        path.push({ pos: currentPos.clone(), item, dir: currentDir.clone(), isCorner, year });
    };

    for(let i=0; i<L; i++) {
        if (i === L-1) {
            placeCell(true); currentDir.set(1, 0, 0); 
        } else {
            placeCell(false);
        }
        currentPos.addScaledVector(currentDir, step);
    }

    for(let i=0; i<W-1; i++) {
        if (i === W-2) {
            placeCell(true); currentDir.set(0, 0, -1); 
        } else {
            placeCell(false);
        }
        currentPos.addScaledVector(currentDir, step);
    }

    for(let i=0; i<L-1; i++) {
        if (i === L-2) {
            placeCell(true); currentDir.set(-1, 0, 0); 
        } else {
            placeCell(false);
        }
        currentPos.addScaledVector(currentDir, step);
    }

    for(let i=0; i<W-2; i++) {
        placeCell(false);
        currentPos.addScaledVector(currentDir, step);
    }
    
    // 5. Generate geometry from path
    // ffadad, ffd6a5,fdffb6,caffbf,9bf6ff, a0c4ff,bdb2ff, ffc6ff, fffffc
    const yearColors = [0xffadad, 0xffd6a5, 0xfdffb6, 0xcaffbf, 0x9bf6ff, 0xa0c4ff, 0xbdb2ff, 0xffc6ff, 0xfffffc];
    let currentColorIndex = 0;
    
    const solGeo = new THREE.BoxGeometry(size.x, 0.2, size.z);
    const wallGeo = new THREE.BoxGeometry(size.x, size.y, 0.2);
    const pillarGeo = new THREE.BoxGeometry(0.4, size.y, 0.4);
    
    // Mixers array to hold all avatar animations if needed
    const mixers = [];

    // Helper to check if a room exists at a coordinate
    const hasRoomAt = (x, z) => {
        return path.some(p => Math.abs(p.pos.x - x) < 0.1 && Math.abs(p.pos.z - z) < 0.1);
    };

    let sideToggle = 1;

    let currentYearTracking = -1;

    for (let i = 0; i < path.length; i++) {
        const cell = path[i];
        const cx = cell.pos.x;
        const cz = cell.pos.z;
        const cy = cell.pos.y;
        
        // Panneau Minecraft pour les partenaires (case vide du début)
        if (i === 0) {
            const signGroup = new THREE.Group();
            signGroup.position.set(cx, cy, cz);
            
            const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), woodMat);
            post.position.y = 0.7;
            signGroup.add(post);
            
            const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.1), woodMat);
            board.position.y = 1.4;
            signGroup.add(board);
            
            const mcSignCanvas = document.createElement('canvas');
            mcSignCanvas.width = 1024;
            mcSignCanvas.height = 384;
            const ctx = mcSignCanvas.getContext('2d');
            ctx.fillStyle = '#8b5a2b'; 
            ctx.fillRect(0, 0, 1024, 384);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 70px "Now", "Futura", "Century Gothic", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Ils nous font', 512, 140);
            ctx.fillText('confiance', 512, 240);
            
            const mcSignTex = new THREE.CanvasTexture(mcSignCanvas);
            mcSignTex.colorSpace = THREE.SRGBColorSpace;
            const mcPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: mcSignTex }));
            mcPlane.position.y = 1.4;
            mcPlane.position.z = 0.051;
            signGroup.add(mcPlane);
            
            // Décalage vers la gauche et recul dans le couloir (plus loin de l'entrée)
            const rightVec = new THREE.Vector3(-cell.dir.z, 0, cell.dir.x);
            signGroup.position.addScaledVector(rightVec, -2);
            signGroup.position.addScaledVector(cell.dir, 1.8);
            
            signGroup.rotation.y = Math.atan2(cell.dir.x, cell.dir.z) + Math.PI;
            museumGroup.add(signGroup);
        }
        
        if (cell.year > 0 && cell.year !== currentYearTracking) {
            currentYearTracking = cell.year;
            currentColorIndex = (currentColorIndex + 1) % yearColors.length;
            const light = new THREE.PointLight(yearColors[currentColorIndex], 5, 20);
            light.position.set(cx, cy + 2, cz);
            museumGroup.add(light);
            
            // Year text on floor
            const yearTex = createYearCanvas(cell.year);
            const yearPlaneGeo = new THREE.PlaneGeometry(4, 4);
            const yearPlaneMat = new THREE.MeshBasicMaterial({ map: yearTex, transparent: true, opacity: 0.9 });
            const yearPlane = new THREE.Mesh(yearPlaneGeo, yearPlaneMat);
            yearPlane.rotation.x = -Math.PI / 2;
            yearPlane.position.set(cx, cy + 0.01, cz);
            // Orient text towards the direction the user entered from (inversed by 180°)
            yearPlane.rotation.z = Math.atan2(cell.dir.x, cell.dir.z) + Math.PI; 
            museumGroup.add(yearPlane);
        }
        
        const roomColor = yearColors[currentColorIndex];
        const roomMat = new THREE.MeshStandardMaterial({ color: roomColor });
        const solMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        
        // Floor
        const sol = new THREE.Mesh(solGeo, solMat);
        sol.position.set(cx, cy - 0.1, cz);
        museumGroup.add(sol);
        
        // Pillars
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const offsets = [
            [-size.x/2, -size.z/2], [size.x/2, -size.z/2],
            [-size.x/2, size.z/2], [size.x/2, size.z/2]
        ];
        offsets.forEach(off => {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(cx + off[0], cy + size.y/2, cz + off[1]);
            museumGroup.add(pillar);
        });
        
        // Walls (N, S, E, W)
        // If there is no room adjacent, we place a wall.
        // Except for the very first room (i=0) we leave the entry (South) open or place a door.
        
        const checkWall = (dx, dz, rotY) => {
            // Check if cell is the very first corridor room and if we are checking the wall facing the Sas
            if (!hasRoomAt(cx + dx, cz + dz)) {
                if (i === 0 && dx === 0 && dz === -step) { 
                    // First corridor room entrance: completely open to the Sas
                    return;
                } else {
                    const w = new THREE.Mesh(wallGeo, roomMat);
                    w.position.set(cx + dx/2, cy + size.y/2, cz + dz/2);
                    w.rotation.y = rotY;
                    museumGroup.add(w);
                }
            }
        };
        
        checkWall(0, -step, 0); // N
        checkWall(0, step, 0);  // S
        checkWall(step, 0, Math.PI/2); // E
        checkWall(-step, 0, Math.PI/2); // W
        
        // Item
        if (cell.item) {
            const itemGroup = new THREE.Group();
            itemGroup.position.set(cx, cy, cz);
            
            // Offset to side
            const rightVec = new THREE.Vector3(-cell.dir.z, 0, cell.dir.x);
            itemGroup.position.addScaledVector(rightVec, sideToggle * size.x * 0.35);
            
            // Text should face inward towards the corridor center
            const normalVec = rightVec.clone().multiplyScalar(-sideToggle);
            const rotY = Math.atan2(normalVec.x, normalVec.z);
            
            // Left direction from viewer's perspective
            const leftDir = new THREE.Vector3(sideToggle * rightVec.z, 0, -sideToggle * rightVec.x);
            
            // Plaques and content for Chronological Items
            const plaqueTex = createPlaqueCanvas(cell.item);
            const plaqueGeo = new THREE.PlaneGeometry(1.2, 1.2);
            const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex });
            const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
            plaque.position.y = 1.5;

            const isAvatar = (cell.item.type === 'founder' || cell.item.type === 'worker' || cell.item.type === 'person');
            const shiftDist = isAvatar ? 1.2 : 1.8;
            
            // Shift plaque to the left of the artwork
            plaque.position.addScaledVector(leftDir, shiftDist); 
            // Push it slightly outwards from wall so it doesn't z-fight
            plaque.position.addScaledVector(rightVec, sideToggle * -0.05);
            plaque.rotation.y = rotY;
            itemGroup.add(plaque);
            
            if (isAvatar) {
                const baseGeo = new THREE.BoxGeometry(0.8, 1, 0.8);
                const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
                const base = new THREE.Mesh(baseGeo, baseMat);
                base.position.y = 0.5;
                itemGroup.add(base);
                
                if (avatarScene && avatarAnimations.length > 0) {
                    const avatarInstance = SkeletonUtils.clone(avatarScene);
                    avatarInstance.position.y = 1;
                    avatarInstance.rotation.y = Math.random() * Math.PI * 2;
                    
                    const mixer = new THREE.AnimationMixer(avatarInstance);
                    const randomAnim = avatarAnimations[Math.floor(Math.random() * avatarAnimations.length)];
                    const action = mixer.clipAction(randomAnim);
                    action.play();
                    mixer.setTime(0.1); 
                    
                    // Marquer tous les meshes de l'avatar pour ne pas les utiliser en collision
                    avatarInstance.traverse(n => { if (n.isMesh) n.userData.noCollision = true; });
                    itemGroup.add(avatarInstance);
                }
                
                // Box proxy de collision invisible pour la statue
                const proxyGeo = new THREE.BoxGeometry(0.8, 2, 0.8);
                const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
                const proxy = new THREE.Mesh(proxyGeo, proxyMat);
                proxy.position.y = 1;
                proxy.userData.isCollisionProxy = true;
                itemGroup.add(proxy);
            } else {
                const frameGeo = new THREE.BoxGeometry(2, 2, 0.1);
                const frameMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
                const frame = new THREE.Mesh(frameGeo, frameMat);
                frame.position.y = 1.5;
                
                const tex = createPlaceholderCanvas();
                const planeGeo = new THREE.PlaneGeometry(1.8, 1.8);
                const planeMat = new THREE.MeshBasicMaterial({ map: tex });
                const plane = new THREE.Mesh(planeGeo, planeMat);
                plane.position.y = 1.5;
                plane.position.z = 0.06; // slightly outside the frame
                const frameGroup = new THREE.Group();
                frameGroup.add(frame, plane);
                frameGroup.rotation.y = rotY;
                
                itemGroup.add(frameGroup);
            }
            
            sideToggle *= -1;
            museumGroup.add(itemGroup);
        }
        
        // Fil rouge segment
        if (i < path.length - 1) {
            const nextPos = path[i+1].pos;
            const dist = cell.pos.distanceTo(nextPos);
            const lineGeo = new THREE.PlaneGeometry(0.2, dist + 0.2);
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const filRouge = new THREE.Mesh(lineGeo, lineMat);
            filRouge.rotation.x = -Math.PI / 2;
            
            const mid = new THREE.Vector3().addVectors(cell.pos, nextPos).multiplyScalar(0.5);
            mid.y = cy + 0.02; // slightly above floor
            
            filRouge.position.copy(mid);
            if (Math.abs(cell.pos.x - nextPos.x) > 0.1) {
                filRouge.rotation.z = Math.PI / 2;
            }
            museumGroup.add(filRouge);
        }
    }
    
    return museumGroup;
}

