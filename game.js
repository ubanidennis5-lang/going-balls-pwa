/* ================================================================
   GOING BALLS CLONE — 3D Rolling Ball Platformer
   (Three.js + Cannon.js)
   ================================================================ */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────
const BALL_RADIUS = 1;
const TRACK_WIDTH = 12;
const MAX_SPEED   = 40;
const GRAVITY     = -40;

// ─── STATE ────────────────────────────────────────────────────
let STATE = 'MENU'; // MENU | PLAYING | GAMEOVER

let scene, camera, renderer;
let world;

let score = 0;
let bestScore = 0;
let distanceTraveled = 0;

let frameId;
let lastTime = performance.now();

// Game Objects
let ballMesh, ballBody;
let platforms = []; // { mesh, body }
let coins = [];     // { mesh, body }

let trackZ = 0; // The z-coordinate of the end of the currently generated track

// Controls
let isDragging = false;
let pointerX = 0;
let pointerY = 0;
let inputVelocity = { x: 0, z: 0 }; // forward is -z

// Materials
let ballMat, trackMat, coinMat;
let physicsMat, groundPhysicsMat;
let contactMaterial;

// ─── INIT ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  bestScore = parseInt(localStorage.getItem('goingballs_best') || '0', 10);
  document.getElementById('menu-best-score').textContent = `BEST: ${bestScore}`;
  document.getElementById('best-display').textContent = bestScore;

  // Hide the old HUD elements that aren't needed for this genre
  const ballCountEl = document.getElementById('ball-count');
  if(ballCountEl) ballCountEl.style.display = 'none';
  const aimHintEl = document.getElementById('aim-hint');
  if(aimHintEl) aimHintEl.style.display = 'none';

  init3D();
  initPhysics();

  // Events
  document.getElementById('play-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', startGame);
  document.getElementById('menu-btn').addEventListener('click', showMenu);

  const appEl = document.getElementById('app');
  appEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup',   onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  resize();
  window.addEventListener('resize', resize);

  requestAnimationFrame(menuLoop);
});

// ─── THREE.JS SETUP ──────────────────────────────────────────
function init3D() {
  const container = document.querySelector('.canvas-wrap');
  
  // Hide the old 2D overlay canvas, we won't need it
  const oldCanvas = document.getElementById('game-canvas');
  if (oldCanvas) oldCanvas.style.display = 'none';

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0D0D1A, 0.008);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  container.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(50, 100, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  scene.add(dirLight);

  // Materials
  ballMat = new THREE.MeshStandardMaterial({ 
    color: 0x7C6FFF, 
    roughness: 0.1, 
    metalness: 0.6,
    envMapIntensity: 1.0
  });

  trackMat = new THREE.MeshStandardMaterial({
    color: 0x1A1A2E,
    roughness: 0.8,
    metalness: 0.1
  });

  coinMat = new THREE.MeshStandardMaterial({
    color: 0xFFD700,
    emissive: 0x886600,
    roughness: 0.2,
    metalness: 0.9
  });
}

function resize() {
  const appEl = document.getElementById('app');
  const hudEl = document.querySelector('.hud');
  const hudH  = hudEl ? hudEl.offsetHeight : 0;

  const W = appEl.offsetWidth;
  const H = appEl.offsetHeight - hudH;

  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}

// ─── CANNON.JS SETUP ─────────────────────────────────────────
function initPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, GRAVITY, 0); // Y is up
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 10;

  physicsMat = new CANNON.Material('ball');
  groundPhysicsMat = new CANNON.Material('ground');
  
  contactMaterial = new CANNON.ContactMaterial(groundPhysicsMat, physicsMat, {
    friction: 0.1,
    restitution: 0.4
  });
  world.addContactMaterial(contactMaterial);
}

// ─── GAME LOGIC ──────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showMenu() {
  cancelAnimationFrame(frameId);
  STATE = 'MENU';
  showScreen('menu-screen');
  document.getElementById('menu-best-score').textContent = `BEST: ${bestScore}`;
  requestAnimationFrame(menuLoop);
}

function showGameOver() {
  STATE = 'GAMEOVER';
  const newBest = score > bestScore;
  if (newBest) {
    bestScore = score;
    localStorage.setItem('goingballs_best', bestScore);
  }
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-best').textContent  = bestScore;
  document.getElementById('new-best-badge').classList.toggle('show', newBest);
  showScreen('gameover-screen');
}

function clearGame() {
  if (ballMesh) scene.remove(ballMesh);
  if (ballBody) world.remove(ballBody);

  platforms.forEach(p => {
    scene.remove(p.mesh);
    world.remove(p.body);
  });
  platforms = [];

  coins.forEach(c => {
    scene.remove(c.mesh);
    world.remove(c.body);
  });
  coins = [];

  trackZ = 0;
}

function startGame() {
  cancelAnimationFrame(frameId);
  clearGame();

  score = 0;
  distanceTraveled = 0;
  document.getElementById('score-display').textContent = '0';
  document.getElementById('best-display').textContent  = bestScore;

  // Create Ball
  const geo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  ballMesh = new THREE.Mesh(geo, ballMat);
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  const shape = new CANNON.Sphere(BALL_RADIUS);
  ballBody = new CANNON.Body({
    mass: 5,
    material: physicsMat,
    shape: shape,
    position: new CANNON.Vec3(0, 5, 0),
    linearDamping: 0.5,
    angularDamping: 0.5
  });
  world.addBody(ballBody);

  // Generate initial track
  for(let i=0; i<5; i++) {
    generateTrackChunk();
  }

  showScreen('game-screen');
  STATE = 'PLAYING';

  lastTime = performance.now();
  frameId = requestAnimationFrame(gameLoop);
}

// ─── TRACK GENERATION ────────────────────────────────────────
function generateTrackChunk() {
  const length = 40 + Math.random() * 20;
  const isGap = Math.random() > 0.8 && trackZ < -40; // no gap right at start
  const isRamp = !isGap && Math.random() > 0.7;

  let yOffset = 0;
  let angle = 0;

  if (isRamp) {
    angle = (Math.random() > 0.5 ? 1 : -1) * 0.2; // slight slope up or down
    yOffset = Math.sin(angle) * (length/2);
  }

  if (!isGap) {
    createPlatform(0, 0, trackZ - length/2, TRACK_WIDTH, 2, length, angle);
    
    // Spawn coins
    if (Math.random() > 0.5) {
      const numCoins = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < numCoins; i++) {
        const cx = (Math.random() - 0.5) * (TRACK_WIDTH - 4);
        const cz = trackZ - (length / numCoins) * i - (length/numCoins)/2;
        // height approximation for ramps
        const cy = 1.5 + (isRamp ? Math.tan(angle) * (trackZ - length/2 - cz) : 0);
        createCoin(cx, cy, cz);
      }
    }
  }

  // Next chunk starts further down
  const gapLength = isGap ? 15 + Math.random() * 10 : 0;
  trackZ -= (length + gapLength);
}

function createPlatform(x, y, z, w, h, d, angleX = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  
  // Track material looks better with some texture or edges, we'll use simple material for now
  const mesh = new THREE.Mesh(geo, trackMat);
  mesh.position.set(x, y, z);
  mesh.rotation.x = angleX;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
  const body = new CANNON.Body({
    mass: 0, // static
    material: groundPhysicsMat
  });
  body.addShape(shape);
  body.position.copy(mesh.position);
  body.quaternion.copy(mesh.quaternion);
  world.addBody(body);

  platforms.push({ mesh, body });
}

function createCoin(x, y, z) {
  const geo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
  geo.rotateX(Math.PI / 2); // stand it up
  const mesh = new THREE.Mesh(geo, coinMat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  scene.add(mesh);

  // Use a trigger body for coins
  const shape = new CANNON.Sphere(1.2);
  const body = new CANNON.Body({
    mass: 0,
    isTrigger: true,
    position: new CANNON.Vec3(x, y, z)
  });
  body.addShape(shape);
  world.addBody(body);

  coins.push({ mesh, body, collected: false });
}

// ─── CONTROLS ────────────────────────────────────────────────
function onPointerDown(e) {
  if (STATE !== 'PLAYING') return;
  isDragging = true;
  pointerX = e.clientX ?? e.touches?.[0]?.clientX;
  pointerY = e.clientY ?? e.touches?.[0]?.clientY;
  inputVelocity.x = 0;
  inputVelocity.z = 0;
}

function onPointerMove(e) {
  if (!isDragging || STATE !== 'PLAYING') return;
  const cx = e.clientX ?? e.touches?.[0]?.clientX;
  const cy = e.clientY ?? e.touches?.[0]?.clientY;
  
  const dx = cx - pointerX;
  const dy = cy - pointerY;

  // Map drag to velocity intent
  // Dragging up (negative dy) = roll forward (-Z)
  // Dragging down (positive dy) = brake/reverse (+Z)
  // Dragging left/right (dx) = strafe (X)
  
  // Sensitivity multipliers
  inputVelocity.x = dx * 0.15;
  inputVelocity.z = dy * 0.2; 
  
  pointerX = cx;
  pointerY = cy;
}

function onPointerUp() {
  isDragging = false;
  inputVelocity.x = 0;
  inputVelocity.z = 0;
}

// ─── MAIN LOOP ───────────────────────────────────────────────
function menuLoop() {
  if (STATE !== 'MENU') return;
  
  // Rotate the camera around a focal point for a cool menu effect
  const t = performance.now() * 0.0005;
  camera.position.set(Math.sin(t)*20, 15, Math.cos(t)*20);
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  frameId = requestAnimationFrame(menuLoop);
}

function gameLoop(timestamp) {
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;

  // Step Physics
  world.step(1/60, dt / 1000, 3);

  // Apply player controls
  if (STATE === 'PLAYING') {
    // Apply horizontal forces based on input
    // We add force so momentum plays a factor
    if (isDragging) {
      ballBody.velocity.x = inputVelocity.x * 5;
      
      // Allow accelerating forward, but clamp max speed
      ballBody.velocity.z += inputVelocity.z * 0.5;
      
      // Forward limits (negative Z is forward)
      if (ballBody.velocity.z < -MAX_SPEED) ballBody.velocity.z = -MAX_SPEED;
      // Backward limits
      if (ballBody.velocity.z > 10) ballBody.velocity.z = 10;

    } else {
      // Natural deceleration on Z
      ballBody.velocity.z *= 0.99;
      // Natural deceleration on X
      ballBody.velocity.x *= 0.95;
    }

    // Sync mesh
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);

    // Coin collision
    coins.forEach(c => {
      if (c.collected) return;
      const dist = c.mesh.position.distanceTo(ballMesh.position);
      if (dist < BALL_RADIUS + 1.2) {
        c.collected = true;
        scene.remove(c.mesh);
        score += 10;
        document.getElementById('score-display').textContent = score;
      } else {
        // Rotate coins
        c.mesh.rotation.y += 0.05;
      }
    });

    // Generate new track chunks if we are getting close to the end
    if (ballMesh.position.z - 100 < trackZ) {
      generateTrackChunk();
    }

    // Clean up old chunks behind camera
    platforms = platforms.filter(p => {
      if (p.mesh.position.z > ballMesh.position.z + 50) {
        scene.remove(p.mesh);
        world.remove(p.body);
        return false;
      }
      return true;
    });

    // Score based on distance
    const currentDist = Math.floor(-ballMesh.position.z / 10);
    if (currentDist > distanceTraveled) {
      distanceTraveled = currentDist;
      score += 1;
      document.getElementById('score-display').textContent = score;
    }

    // Camera follow (smooth)
    const idealCameraPos = new THREE.Vector3(
      ballMesh.position.x * 0.5, // follow X slightly
      ballMesh.position.y + 12,
      ballMesh.position.z + 18
    );
    camera.position.lerp(idealCameraPos, 0.1);
    camera.lookAt(ballMesh.position.x, ballMesh.position.y, ballMesh.position.z - 10);

    // Update Light position to follow camera to keep shadows crisp
    const light = scene.children.find(c => c.isDirectionalLight);
    if (light) {
      light.position.x = ballMesh.position.x + 50;
      light.position.z = ballMesh.position.z + 20;
      light.target.position.copy(ballMesh.position);
    }

    // Game Over condition (falling off edge)
    if (ballMesh.position.y < -15) {
      setTimeout(showGameOver, 500);
      STATE = 'GAMEOVER';
    }
  } else if (STATE === 'GAMEOVER') {
    // Keep syncing mesh to show it falling
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);
  }

  renderer.render(scene, camera);
  frameId = requestAnimationFrame(gameLoop);
}
