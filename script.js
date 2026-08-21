import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CONFIG = {
  room: 'assets/room.glb',
  links: {
    pumpfun: 'https://pump.fun/coin/ZExy7krMikBNWHhs9YLpmvuk6CBz4JQn42TK5E2pump',
    twitter: 'https://x.com/marselomoon',
    wiki: 'https://herofanon.fandom.com/wiki/Marselo',
    telegram: 'https://t.me/addstickers/marseloescobarjr'
  },
  contract: 'ZExy7krMikBNWHhs9YLpmvuk6CBz4JQn42TK5E2pump',
  spawn: new THREE.Vector3(-5, 5, -14),
  moveSpeed: 12,
  interactionDistance: 10,
  playerRadius: 0.6,
  headClearance: 0.2,
  flightBounds: {
    min: new THREE.Vector3(-19, 1, -33),
    max: new THREE.Vector3(14, 18, 18)
  },
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
renderer.setPixelRatio(Math.min(devicePixelRatio * 0.65, 1.3));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
game.append(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xddeeff, 0x101840, 2.4));
[
  [-15, 7, -28, 0x4d7dff],
  [10, 7, -28, 0xffffff],
  [-15, 7, 13, 0xffffff],
  [10, 7, 13, 0x4d7dff]
].forEach(([x, y, z, color]) => {
  const light = new THREE.PointLight(color, 115, 36, 1.7);
  light.position.set(x, y, z);
  scene.add(light);
});

const clock = new THREE.Clock();
const keys = new Set();
const colliders = [];
const interactables = [];
const roomBounds = new THREE.Box3();
let room, activeTarget = null, started = false, locked = false, yaw = Math.PI, pitch = 0, modelReady = false;
let galleryItems = [], galleryIndex = 0;

const normalize = value => value.toLowerCase().replace(/[._\-\s]/g, '');
const matches = (name, aliases) => aliases.some(alias => normalize(name).includes(normalize(alias)));

function loadRoom(paths = [CONFIG.room, 'assets/ROOM.glb']) {
  const path = paths.shift();
  new GLTFLoader().load(path, gltf => {
  room = gltf.scene;
  room.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const kind = Object.entries(CONFIG.names).find(([, aliases]) => matches(object.name, aliases))?.[0];
    if (!kind) colliders.push(new THREE.Box3().setFromObject(object));
  });
  scene.add(room);
  room.updateMatrixWorld(true);
  roomBounds.setFromObject(room);
  const addObjectTarget = (kind, name, fallbackPosition, fallbackSize) => {
    const object = room.getObjectByName(name);
    const center = new THREE.Vector3(...fallbackPosition);
    const half = new THREE.Vector3(...fallbackSize).multiplyScalar(0.5);
    const box = object
      ? new THREE.Box3().setFromObject(object).expandByScalar(1.5)
      : new THREE.Box3(center.clone().sub(half), center.clone().add(half));
    if (object) box.getCenter(center);
    interactables.push({ object: object || new THREE.Object3D(), kind, center, box });
  };

  addObjectTarget('monitor', 'Monitor 1', [-5.01, 8.38, 9.09], [6, 5, 4]);
  addObjectTarget('monitor', 'Monitor 2', [-10.63, 8.38, 9.10], [6, 5, 4]);
  addObjectTarget('tv', 'Tv', [-8.98, 14.68, 10.03], [8, 5, 2]);

  const marseloBox = new THREE.Box3();
  const marseloMeshes = [];
  room.traverse(object => {
    if (object.isMesh && /^Marselo_/i.test(object.name)) {
      marseloMeshes.push(object);
      marseloBox.expandByObject(object);
    }
  });
  if (marseloMeshes.length) {
    marseloBox.expandByScalar(1.5);
    interactables.push({
      object: marseloMeshes[0],
      kind: 'marselo',
      center: marseloBox.getCenter(new THREE.Vector3()),
      box: marseloBox
    });
  } else {
    addObjectTarget('marselo', 'Skeleton_Marselo', [1.69, 6, -2.46], [6, 7, 6]);
  }
  if (!roomBounds.containsPoint(camera.position)) {
    roomBounds.getCenter(camera.position);
    camera.position.y = Math.min(roomBounds.max.y - 1, roomBounds.min.y + 1.65);
  }
  modelReady = true;
  document.querySelector('#enterButton').disabled = false;
  document.querySelector('#enterButton').textContent = 'ENTER';
}, undefined, error => {
  if (paths.length) return loadRoom(paths);
  document.querySelector('#enterButton').disabled = true;
  document.querySelector('#enterButton').textContent = 'ROOM.GLB NOT FOUND';
  document.querySelector('.portal-copy small').textContent = location.protocol === 'file:' ? 'OPEN WITH A LOCAL SERVER — DO NOT DOUBLE-CLICK INDEX.HTML' : 'CHECK assets/room.glb';
  console.error(error);
});
}

document.querySelector('#enterButton').disabled = true;
document.querySelector('#enterButton').textContent = 'LOADING ROOM';
loadRoom();
setTimeout(() => { loading.style.opacity = '0'; setTimeout(() => loading.remove(), 250); }, 350);

function enterRoom() {
  if (!modelReady) return;
  started = true;
  portal.style.opacity = '0'; portal.style.visibility = 'hidden'; hud.classList.remove('hidden');
  music.volume = 0.8; music.play().catch(() => updateSound(false));
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
  if (!locked) return;
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
  const { min, max } = CONFIG.flightBounds;
  return position.x >= min.x && position.x <= max.x &&
    position.y >= min.y && position.y <= max.y &&
    position.z >= min.z && position.z <= max.z;
}

function movePlayer(delta) {
  if (!locked || modal.classList.contains('open')) return;
  const input = new THREE.Vector3((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0), (keys.has('Space')?1:0)-(keys.has('ShiftLeft')?1:0), (keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0));
  if (!input.lengthSq()) return;
  input.normalize().applyAxisAngle(new THREE.Vector3(0,1,0), yaw).multiplyScalar(CONFIG.moveSpeed * delta);
  const nextX = camera.position.clone(); nextX.x += input.x; if (canOccupy(nextX, camera.position)) camera.position.x = nextX.x;
  const nextZ = camera.position.clone(); nextZ.z += input.z; if (canOccupy(nextZ, camera.position)) camera.position.z = nextZ.z;
  const nextY = camera.position.clone(); nextY.y += input.y; if (canOccupy(nextY, camera.position)) camera.position.y = nextY.y;
}

function findTarget() {
  let nearest = null, distance = Infinity;
  interactables.forEach(item => {
    const current = item.center.distanceTo(camera.position);
    if (current < CONFIG.interactionDistance && current < distance) { nearest = item; distance = current; }
  });
  activeTarget = nearest;
  prompt.classList.toggle('show', Boolean(nearest) && !modal.classList.contains('open'));
  if (nearest) prompt.querySelector('p').textContent = `INTERACT WITH ${nearest.kind.toUpperCase()}`;
}

function interact(target) {
  document.exitPointerLock();
  openExperience(target.kind);
}

function openExperience(kind) {
  if (kind === 'monitor') openDesktop();
  if (kind === 'tv') openGallery('videos');
  if (kind === 'marselo') modalContent.innerHTML = `<article class="lore"><header class="lore-head"><h2>WHO IS MARSELO?</h2><p>The protagonist of the imagined Mamarre Studios movie saga.</p></header><div class="lore-body"><div class="lore-copy"><strong>APPEARANCE</strong><br>Marselo is a white Kino 5 lottery ball with long, flexible arms and legs connected directly to his head. He has blue eyes, expressive hands and shoe-shaped feet.<br><br><strong>PERSONALITY</strong><br>Marselo is a generous god who helps anyone who asks, but his anger can shake the world. Beneath his quiet nature, he carries the mystery of his father, Marselo Escobar.<br><br><strong>HISTORY</strong><br>Born in 1990, Marselo begins a huge saga with his twin brother Esteban and his ally Killer Bean. Their search crosses paths with Capuccino, Gonsalo, Richard, Maurisio, Gustabo and The King. Across sequels, revivals, betrayals and multiverse events, Marselo loses power, trains for hundreds of chapters, becomes an omnipotent god, briefly turns evil, returns to his senses and eventually seeks a peaceful life with Marsela. His story continues whenever the universe needs its faithful white ball.</div><nav class="links"><button id="modalMusic">${music.paused?'ENABLE':'DISABLE'} MUSIC</button><a href="${CONFIG.links.twitter}" target="_blank" rel="noopener">X / TWITTER ↗</a><a href="${CONFIG.links.wiki}" target="_blank" rel="noopener">WIKI ↗</a><a href="${CONFIG.links.telegram}" target="_blank" rel="noopener">TELEGRAM STICKER PACK ↗</a><button id="copyContract">COPY CONTRACT</button></nav></div></article>`;
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); prompt.classList.remove('show');
  document.querySelector('#modalMusic')?.addEventListener('click', () => { updateSound(); openExperience('marselo'); });
  document.querySelector('#copyContract')?.addEventListener('click', async () => { await navigator.clipboard.writeText(CONFIG.contract); showToast('CONTRACT COPIED'); });
}

function openDesktop() {
  modalContent.innerHTML = `<div class="xp"><div class="xp-desktop"><button class="xp-icon" id="xpPumpfun"><span>📈</span>Pumpfun</button><button class="xp-icon" id="xpTwitter"><span>𝕏</span>Twitter</button><button class="xp-icon" id="xpTelegram"><span style="background:#229ED9;color:white">➤</span>Sticker Pack</button><button class="xp-icon" id="xpContract"><span>📄</span>Copy Contract</button></div><div class="xp-taskbar"><button class="xp-start">start</button><div class="xp-title">Marselo's Computer</div><div class="xp-clock">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div></div></div>`;
  document.querySelector('#xpPumpfun').addEventListener('click', openPumpfun);
  document.querySelector('#xpTwitter').addEventListener('click', () => window.open(CONFIG.links.twitter, '_blank', 'noopener'));
  document.querySelector('#xpTelegram').addEventListener('click', () => window.open(CONFIG.links.telegram, '_blank', 'noopener'));
  document.querySelector('#xpContract').addEventListener('click', copyContract);
}

function openGallery(category) {
  const isVideos = category === 'videos';
  galleryItems = Array.from({length:isVideos ? 8 : 20}, (_, i) => ({
    type: isVideos ? 'video' : 'image',
    src: isVideos ? `assets/vids/${i+1}.mp4` : `assets/memes/${i+1}.jpg`,
    alt: `Marselo ${isVideos ? 'video' : 'meme'} ${i+1}`
  }));
  const cards = galleryItems.map((item, i) => `<button class="gallery-item" data-index="${i}" aria-label="Open ${item.alt}">${item.type === 'video' ? `<video src="${item.src}" muted playsinline preload="metadata"></video>` : `<img src="${item.src}" alt="${item.alt}" loading="lazy">`}</button>`).join('');
  modalContent.innerHTML = `<div class="gallery-head"><h2>MEME ARCHIVE</h2><p>Recovered Marselo transmissions.</p></div><div class="gallery-tabs"><button class="gallery-tab ${isVideos?'active':''}" data-category="videos">VIDEOS</button><button class="gallery-tab ${!isVideos?'active':''}" data-category="memes">MEMES</button></div><div class="gallery-grid">${cards}</div>`;
  document.querySelectorAll('.gallery-tab').forEach(tab => tab.addEventListener('click', () => openGallery(tab.dataset.category)));
  document.querySelectorAll('.gallery-item').forEach(item => item.addEventListener('click', () => openMediaViewer(Number(item.dataset.index))));
}

function openMediaViewer(index) {
  stopViewerMedia();
  galleryIndex = (index + galleryItems.length) % galleryItems.length;
  let viewer = document.querySelector('#mediaViewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'mediaViewer'; viewer.className = 'media-viewer';
    viewer.innerHTML = `<button class="media-close" aria-label="Close viewer">×</button><button class="media-arrow media-prev" aria-label="Previous media">‹</button><div class="media-stage"></div><button class="media-arrow media-next" aria-label="Next media">›</button><div class="media-count"></div>`;
    document.body.append(viewer);
    viewer.querySelector('.media-close').addEventListener('click', closeMediaViewer);
    viewer.addEventListener('click', event => { if (event.target === viewer) closeMediaViewer(); });
    viewer.querySelector('.media-prev').addEventListener('click', () => changeMedia(-1));
    viewer.querySelector('.media-next').addEventListener('click', () => changeMedia(1));
  }
  const item = galleryItems[galleryIndex];
  viewer.querySelector('.media-stage').innerHTML = item.type === 'video' ? `<video src="${item.src}" controls autoplay playsinline></video>` : `<img src="${item.src}" alt="${item.alt}">`;
  viewer.querySelector('.media-count').textContent = `${galleryIndex + 1} / ${galleryItems.length}`;
  viewer.classList.add('open');
}

function changeMedia(direction) { openMediaViewer(galleryIndex + direction); }
function stopViewerMedia() {
  const video = document.querySelector('#mediaViewer .media-stage video');
  if (!video) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
}
function closeMediaViewer() {
  const viewer = document.querySelector('#mediaViewer');
  if (!viewer) return;
  stopViewerMedia();
  viewer.querySelector('.media-stage').innerHTML = '';
  viewer.classList.remove('open');
}

function openPumpfun() {
  window.open(CONFIG.links.pumpfun, '_blank', 'noopener,noreferrer');
}

async function copyContract() {
  await navigator.clipboard.writeText(CONFIG.contract);
  showToast('CONTRACT COPIED');
}

function closeModal() { closeMediaViewer(); modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); modalContent.innerHTML=''; activeTarget=null; if(started) renderer.domElement.requestPointerLock(); }
document.querySelector('#closeModal').addEventListener('click', closeModal);
document.querySelector('#modalBackdrop').addEventListener('click', closeModal);
function showToast(message){toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800)}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), .05);
  camera.rotation.set(pitch,yaw,0);
  movePlayer(delta); if (room && started) findTarget();
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
document.addEventListener('keydown', event => {
  if (!document.querySelector('#mediaViewer')?.classList.contains('open')) return;
  if (event.code === 'ArrowLeft') changeMedia(-1);
  if (event.code === 'ArrowRight') changeMedia(1);
  if (event.code === 'Escape') { event.stopImmediatePropagation(); closeMediaViewer(); }
}, true);
