import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CONFIG = {
  room: 'assets/room.glb',
  pumpFun: 'https://pump.fun/',
  twitter: 'https://x.com/',
  contract: 'PASTE_CONTRACT_ADDRESS_HERE',
  spawn: new THREE.Vector3(0, 1.65, 0),
  moveSpeed: 3.2,
  interactionDistance: 3.2,
  playerRadius: 0.32,
  headClearance: 0.2,
  names: {
    monitor: ['monitor', 'screen', 'komputer'],
    tv: ['tv', 'television'],
    marselo: ['marselo', 'skeleton_marselo']
  }
};

const game = document.querySelector('#game');
const portal = document.querySelector('#portal');
const loading = document.querySelector('#loading');
const hud = document.querySelector('#hud');
const prompt = document.querySelector('#prompt');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modalContent');
const music = document.querySelector('#music');
const soundButton = document.querySelector('#soundButton');
const toast = document.querySelector('#toast');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05030a);
scene.fog = new THREE.FogExp2(0x08050f, 0.018);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.06, 120);
camera.position.copy(CONFIG.spawn);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
game.append(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x796cff, 0x17101e, 1.2));
const fill = new THREE.PointLight(0x754cff, 35, 18, 2); fill.position.set(0, 3, 0); scene.add(fill);

const clock = new THREE.Clock();
const keys = new Set();
const colliders = [];
const interactables = [];
const roomBounds = new THREE.Box3();
let room, activeTarget = null, started = false, locked = false, yaw = 0, pitch = 0, focusTween = null;

const normalize = value => value.toLowerCase().replace(/[._\-\s]/g, '');
const matches = (name, aliases) => aliases.some(alias => normalize(name).includes(normalize(alias)));

new GLTFLoader().load(CONFIG.room, gltf => {
  room = gltf.scene;
  room.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const kind = Object.entries(CONFIG.names).find(([, aliases]) => matches(object.name, aliases))?.[0];
    if (kind) interactables.push({ object, kind, center: new THREE.Vector3(), box: new THREE.Box3() });
    else colliders.push(new THREE.Box3().setFromObject(object));
  });
  scene.add(room);
  room.updateMatrixWorld(true);
  roomBounds.setFromObject(room);
  interactables.forEach(item => { item.box.setFromObject(item.object); item.box.getCenter(item.center); });
  if (!roomBounds.containsPoint(camera.position)) {
    roomBounds.getCenter(camera.position);
    camera.position.y = Math.min(roomBounds.max.y - 1, roomBounds.min.y + 1.65);
  }
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 500);
}, undefined, error => {
  loading.innerHTML = '<span>ROOM.GLB COULD NOT BE LOADED</span>';
  console.error(error);
});

function enterRoom() {
  if (!room) return;
  started = true;
  portal.style.opacity = '0'; portal.style.visibility = 'hidden'; hud.classList.remove('hidden');
  music.volume = 0.45; music.play().catch(() => updateSound(false));
  renderer.domElement.requestPointerLock();
}

function updateSound(play = music.paused) {
  if (play) music.play().catch(() => {}); else music.pause();
  soundButton.textContent = music.paused ? 'SOUND OFF' : 'SOUND ON';
}

document.querySelector('#enterButton').addEventListener('click', enterRoom);
soundButton.addEventListener('click', event => { event.stopPropagation(); updateSound(); });
renderer.domElement.addEventListener('click', () => { if (started && !modal.classList.contains('open')) renderer.domElement.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => locked = document.pointerLockElement === renderer.domElement);
document.addEventListener('mousemove', event => {
  if (!locked || focusTween) return;
  yaw -= event.movementX * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -Math.PI * .48, Math.PI * .48);
});
document.addEventListener('keydown', event => {
  keys.add(event.code);
  if (event.code === 'Enter' && !started) enterRoom();
  if (event.code === 'KeyE' && activeTarget && !modal.classList.contains('open')) interact(activeTarget);
  if (event.code === 'Escape' && modal.classList.contains('open')) closeModal();
});
document.addEventListener('keyup', event => keys.delete(event.code));

function canOccupy(position) {
  const radius = CONFIG.playerRadius;
  if (position.x < roomBounds.min.x + radius || position.x > roomBounds.max.x - radius || position.z < roomBounds.min.z + radius || position.z > roomBounds.max.z - radius || position.y < roomBounds.min.y + radius || position.y > roomBounds.max.y - CONFIG.headClearance) return false;
  const player = new THREE.Box3(new THREE.Vector3(position.x-radius,position.y-1.45,position.z-radius),new THREE.Vector3(position.x+radius,position.y+.15,position.z+radius));
  return !colliders.some(box => box.intersectsBox(player));
}

function movePlayer(delta) {
  if (!locked || focusTween || modal.classList.contains('open')) return;
  const input = new THREE.Vector3((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0), (keys.has('Space')?1:0)-(keys.has('ShiftLeft')?1:0), (keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0));
  if (!input.lengthSq()) return;
  input.normalize().applyAxisAngle(new THREE.Vector3(0,1,0), yaw).multiplyScalar(CONFIG.moveSpeed * delta);
  const nextX = camera.position.clone(); nextX.x += input.x; if (canOccupy(nextX)) camera.position.x = nextX.x;
  const nextZ = camera.position.clone(); nextZ.z += input.z; if (canOccupy(nextZ)) camera.position.z = nextZ.z;
  const nextY = camera.position.clone(); nextY.y += input.y; if (canOccupy(nextY)) camera.position.y = nextY.y;
}

function findTarget() {
  let nearest = null, distance = Infinity;
  interactables.forEach(item => {
    const closest = item.box.clampPoint(camera.position, new THREE.Vector3());
    const current = closest.distanceTo(camera.position);
    if (current < CONFIG.interactionDistance && current < distance) { nearest = item; distance = current; }
  });
  activeTarget = nearest;
  prompt.classList.toggle('show', Boolean(nearest) && !modal.classList.contains('open'));
  if (nearest) prompt.querySelector('p').textContent = `INTERACT WITH ${nearest.kind.toUpperCase()}`;
}

function interact(target) {
  document.exitPointerLock();
  const startPosition = camera.position.clone();
  const startQuaternion = camera.quaternion.clone();
  const size = target.box.getSize(new THREE.Vector3());
  const targetCenter = target.center.clone();
  const direction = startPosition.clone().sub(targetCenter); direction.y = 0;
  if (direction.lengthSq() < .01) direction.set(0,0,1); direction.normalize();
  const distance = Math.max(1.15, Math.max(size.x,size.y,size.z) * 1.15);
  let targetPosition = targetCenter.clone().addScaledVector(direction, distance);
  targetPosition.y = THREE.MathUtils.clamp(targetCenter.y, roomBounds.min.y + 1, roomBounds.max.y - .4);
  if (!canOccupy(targetPosition)) targetPosition = startPosition;
  const dummy = new THREE.Object3D(); dummy.position.copy(targetPosition); dummy.lookAt(targetCenter);
  focusTween = { start: performance.now(), duration: 650, startPosition, targetPosition, startQuaternion, targetQuaternion: dummy.quaternion.clone(), target };
}

function updateFocus(now) {
  if (!focusTween) return;
  const t = Math.min(1, (now-focusTween.start)/focusTween.duration); const eased = 1-Math.pow(1-t,3);
  camera.position.lerpVectors(focusTween.startPosition, focusTween.targetPosition, eased);
  camera.quaternion.slerpQuaternions(focusTween.startQuaternion, focusTween.targetQuaternion, eased);
  if (t === 1) { const target = focusTween.target; focusTween = null; setTimeout(() => openExperience(target.kind), 120); }
}

function openExperience(kind) {
  if (kind === 'monitor') modalContent.innerHTML = `<div class="browser"><div class="browser-bar"><div class="dots"><i></i><i></i><i></i></div><div class="address">${CONFIG.pumpFun}</div></div><iframe src="${CONFIG.pumpFun}" title="Marselo on Pump.fun"></iframe><noscript class="browser-fallback"><a href="${CONFIG.pumpFun}" target="_blank" rel="noopener">OPEN PUMP.FUN</a></noscript></div>`;
  if (kind === 'tv') {
    const images = Array.from({length:20},(_,i)=>`<img src="assets/memes/${i+1}.jpg" alt="Marselo meme ${i+1}" loading="lazy">`).join('');
    const videos = Array.from({length:4},(_,i)=>`<video src="assets/vids/vid${i+1}.mp4" controls preload="metadata"></video>`).join('');
    modalContent.innerHTML = `<div class="gallery-head"><h2>MEME ARCHIVE</h2><p>Recovered Marselo transmissions.</p></div><div class="gallery-grid">${videos}${images}</div>`;
  }
  if (kind === 'marselo') modalContent.innerHTML = `<article class="lore"><header class="lore-head"><h2>WHO IS MARSELO?</h2><p>The room remembers everything.</p></header><div class="lore-body"><div class="lore-copy">Marselo did not arrive from Mars. <strong>Mars arrived from Marselo.</strong><br><br>Some say he has been sitting in this room since before the first block. Watching charts. Collecting memes. Waiting for the signal. Nobody knows what happens when he finally stands up.</div><nav class="links"><button id="modalMusic">${music.paused?'ENABLE':'DISABLE'} MUSIC</button><a href="${CONFIG.pumpFun}" target="_blank" rel="noopener">PUMP.FUN ↗</a><a href="${CONFIG.twitter}" target="_blank" rel="noopener">X / TWITTER ↗</a><button id="copyContract">COPY CONTRACT</button></nav></div></article>`;
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); prompt.classList.remove('show');
  document.querySelector('#modalMusic')?.addEventListener('click', () => { updateSound(); openExperience('marselo'); });
  document.querySelector('#copyContract')?.addEventListener('click', async () => { await navigator.clipboard.writeText(CONFIG.contract); showToast('CONTRACT COPIED'); });
}

function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); modalContent.innerHTML=''; activeTarget=null; if(started) renderer.domElement.requestPointerLock(); }
document.querySelector('#closeModal').addEventListener('click', closeModal);
document.querySelector('#modalBackdrop').addEventListener('click', closeModal);
function showToast(message){toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800)}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), .05);
  if (!focusTween) camera.rotation.set(pitch,yaw,0);
  movePlayer(delta); updateFocus(now); if (room && started && !focusTween) findTarget();
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
