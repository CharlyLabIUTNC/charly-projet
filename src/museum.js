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
        ctx.fillStyle = '#ffffff';
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
        
        // Subtitle (Date or Role)
        let subtitle = '';
        if ((item.type === 'person' || item.type === 'founder' || item.type === 'worker') && item.roleDescription) {
            subtitle = item.roleDescription;
        } else if (item.date) {
            subtitle = item.date;
        }

        if (subtitle) {
            ctx.font = 'italic 24px Arial';
            ctx.fillStyle = '#555';
            
            const subWords = subtitle.split(' ');
            let subLine = '';
            for(let n = 0; n < subWords.length; n++) {
                const testLine = subLine + subWords[n] + ' ';
                if (ctx.measureText(testLine).width > 450 && n > 0) {
                    ctx.fillText(subLine, 30, y);
                    subLine = subWords[n] + ' ';
                    y += 30;
                } else {
                    subLine = testLine;
                }
            }
            ctx.fillText(subLine, 30, y);
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

    const createPlaceholderCanvas = (title) => {
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
        
        const words = (title || 'Image').split(' ');
        let line = '';
        let y = 256 - (words.length > 3 ? 20 : 0);
        for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > 450 && n > 0) {
                ctx.fillText(line, 256, y);
                line = words[n] + ' ';
                y += 40;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, 256, y);
        
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
    
    // Panneau de Bienvenue (Banderole Suspendue Art Déco)
    const welcomeSignGroup = new THREE.Group();
    // Placée en hauteur, centrée, juste avant la galerie (à l'entrée du Sas)
    welcomeSignGroup.position.set(sasCenter.x, sasCenter.y + 3.2, sasCenter.z - sasLength/2 + 14.0);
    
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.1, roughness: 0.1 });
    
    const finialL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), metalMat);
    finialL.position.set(-2.2, 0.25, 0);
    const finialR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), metalMat);
    finialR.position.set(2.2, 0.25, 0);
    
    // Barre horizontale de maintien (sans les chaînes verticales)
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8.6, 16), metalMat);
    topBar.rotation.z = Math.PI / 2;
    topBar.position.y = 0.25;
    
    welcomeSignGroup.add(finialL, finialR, topBar);
    
    // Banderole centrale
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 0.05), panelMat);
    board.position.y = -0.35;
    welcomeSignGroup.add(board);
    
    const welcomeCanvas = document.createElement('canvas');
    welcomeCanvas.width = 1200; // Plus large pour la banderole
    welcomeCanvas.height = 327; // Ratio adapté 4.4 / 1.2
    const ctx = welcomeCanvas.getContext('2d');
    
    ctx.fillStyle = '#fafafa'; 
    ctx.fillRect(0, 0, 1200, 327);
    
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 8;
    ctx.strokeRect(15, 15, 1170, 297);
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, 1140, 267);
    
    ctx.fillStyle = '#222222';
    ctx.font = 'normal 65px "Garamond", "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LE CHARLY LAB', 600, 100);
    
    ctx.font = 'italic 34px "Garamond", "Times New Roman", serif';
    ctx.fillStyle = '#444444';
    ctx.fillText('Ne serait rien sans ses projets et les travaux des étudiants.', 600, 210);
    
    const welcomeTex = new THREE.CanvasTexture(welcomeCanvas);
    welcomeTex.colorSpace = THREE.SRGBColorSpace;
    const welcomePlane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.2), new THREE.MeshBasicMaterial({ map: welcomeTex }));
    welcomePlane.position.y = -0.35;
    welcomePlane.position.z = 0.026;
    welcomeSignGroup.add(welcomePlane);
    
    // Regarde vers l'entrée du Sas
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
    // Couleurs florales pastels (vieux rose, vert sauge, lilas, etc.)
    const yearColors = [0xe8d5c4, 0xc1d3c0, 0xebd4d4, 0xdbe3e5, 0xe4d4e8, 0xdfe8d5, 0xf2e4c9, 0xd5c4e8, 0xe8e8d5];
    let currentColorIndex = 0;
    
    const createWallpaperTex = (colorHex) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
        ctx.fillRect(0, 0, 1024, 1024);
        
        // Motifs floraux (Art Nouveau) en transparence
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 5;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const cx = (i * 256) + 128;
                const cy = (j * 256) + 128;
                
                ctx.beginPath();
                for(let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
                    ctx.moveTo(cx, cy);
                    ctx.bezierCurveTo(
                        cx + Math.cos(a - 0.4) * 80, cy + Math.sin(a - 0.4) * 80,
                        cx + Math.cos(a + 0.4) * 80, cy + Math.sin(a + 0.4) * 80,
                        cx + Math.cos(a) * 110, cy + Math.sin(a) * 110
                    );
                }
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(cx, cy, 15, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(212, 175, 55, 0.3)'; // Centre doré subtil
                ctx.fill();
            }
        }
        
        // Soubassement boiserie (wainscoting) blanc pur
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 1024 * 0.7, 1024, 1024 * 0.3);
        
        // Liseré ou moulure dorée
        ctx.fillStyle = '#d4af37'; 
        ctx.fillRect(0, 1024 * 0.68, 1024, 1024 * 0.02);
        
        // Plinthe épaisse au sol
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(0, 1024 * 0.92, 1024, 1024 * 0.08);

        // Détails de moulures sur la boiserie (caissons)
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
            ctx.strokeRect((i * 341) + 40, 1024 * 0.74, 261, 1024 * 0.14);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 1); // Répète le motif sur la largeur du mur
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    };

    // Génère les matériaux à l'avance pour la galerie
    const wallMaterials = yearColors.map(c => new THREE.MeshStandardMaterial({
        map: createWallpaperTex(c),
        roughness: 0.8,
        metalness: 0.05
    }));
    
    const solGeo = new THREE.BoxGeometry(size.x, 0.2, size.z);
    const wallGeo = new THREE.BoxGeometry(size.x, size.y, 0.2);
    // Légèrement plus grand (0.45) et un peu plus haut pour éviter tout z-fighting avec les murs
    const pillarGeo = new THREE.BoxGeometry(0.45, size.y + 0.05, 0.45);
    
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
        
        // Banderole suspendue pour les partenaires (case vide du début)
        if (i === 0) {
            const signGroup = new THREE.Group();
            // Placée en hauteur, centrée dans le couloir
            signGroup.position.set(cx, cy + 3.2, cz+1.2);
            
            const metalMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });
            const panelMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.1, roughness: 0.1 });
            
            const finialL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), metalMat);
            finialL.position.set(-1.8, 0.25, 0);
            const finialR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), metalMat);
            finialR.position.set(1.8, 0.25, 0);
            
            // Barre horizontale de maintien
            const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6.5, 16), metalMat);
            topBar.rotation.z = Math.PI / 2;
            topBar.position.y = 0.25;
            
            signGroup.add(finialL, finialR, topBar);
            
            // Banderole centrale
            const board = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.0, 0.05), panelMat);
            board.position.y = -0.3;
            signGroup.add(board);
            
            const mcSignCanvas = document.createElement('canvas');
            mcSignCanvas.width = 1080;
            mcSignCanvas.height = 300; // ratio 3.6 / 1.0
            const ctx = mcSignCanvas.getContext('2d');
            
            ctx.fillStyle = '#fafafa'; 
            ctx.fillRect(0, 0, 1080, 300);
            
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 10;
            ctx.strokeRect(15, 15, 1050, 270);
            ctx.lineWidth = 3;
            ctx.strokeRect(30, 30, 1020, 240);
            
            ctx.fillStyle = '#222222';
            ctx.font = 'normal 65px "Garamond", "Times New Roman", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ILS NOUS FONT CONFIANCE', 540, 150);
            
            const mcSignTex = new THREE.CanvasTexture(mcSignCanvas);
            mcSignTex.colorSpace = THREE.SRGBColorSpace;
            const mcPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.0), new THREE.MeshBasicMaterial({ map: mcSignTex }));
            mcPlane.position.y = -0.3;
            mcPlane.position.z = 0.026;
            signGroup.add(mcPlane);
            
            // Avance légèrement dans le couloir pour la visibilité
            signGroup.position.addScaledVector(cell.dir, 1.8);
            
            // Fait face au visiteur entrant
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
        
        const roomMat = wallMaterials[currentColorIndex];
        // Sol élégant (style marbre foncé / granit poli) pour contraster les murs
        const solMat = new THREE.MeshStandardMaterial({ color: 0x2d2b2a, roughness: 0.3, metalness: 0.1 });
        
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
                const frameGroup = new THREE.Group();
                frameGroup.rotation.y = rotY;
                
                if (cell.item.img && cell.item.img.trim() !== '') {
                    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
                    const frame = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.1), frameMat);
                    frame.position.y = 1.5;
                    
                    const planeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), planeMat);
                    plane.position.y = 1.5;
                    plane.position.z = 0.06;
                    
                    frameGroup.add(frame, plane);
                    
                    const tl = new THREE.TextureLoader();
                    const imgUrl = cell.item.img.startsWith('./') ? cell.item.img.replace('./', '/') : cell.item.img;
                    tl.load(imgUrl, (texture) => {
                        const imgWidth = texture.image.width;
                        const imgHeight = texture.image.height;
                        const aspect = imgWidth / imgHeight;
                        
                        let width = 1.8;
                        let height = 1.8;
                        if (aspect > 1) {
                            height = width / aspect;
                        } else {
                            width = height * aspect;
                        }
                        
                        plane.geometry.dispose();
                        plane.geometry = new THREE.PlaneGeometry(width, height);
                        plane.material.map = texture;
                        plane.material.color.setHex(0xffffff);
                        plane.material.needsUpdate = true;
                        
                        frame.geometry.dispose();
                        frame.geometry = new THREE.BoxGeometry(width + 0.2, height + 0.2, 0.1);
                    });
                } else {
                    const frameGeo = new THREE.BoxGeometry(2, 2, 0.1);
                    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
                    const frame = new THREE.Mesh(frameGeo, frameMat);
                    frame.position.y = 1.5;
                    
                    const tex = createPlaceholderCanvas(cell.item.name);
                    const planeGeo = new THREE.PlaneGeometry(1.8, 1.8);
                    const planeMat = new THREE.MeshBasicMaterial({ map: tex });
                    const plane = new THREE.Mesh(planeGeo, planeMat);
                    plane.position.y = 1.5;
                    plane.position.z = 0.06; // slightly outside the frame
                    
                    frameGroup.add(frame, plane);
                }
                
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

