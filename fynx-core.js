import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/controls/OrbitControls.js";

const canvas = document.getElementById("fynxCore");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 6;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.rotateSpeed = 0.4;

// Core sphere
const geo = new THREE.IcosahedronGeometry(1.2, 4);
const mat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.015,
  transparent: true,
  opacity: 0.9
});
const core = new THREE.Points(geo, mat);
scene.add(core);

// Soft glow shell
const glow = new THREE.Mesh(
  new THREE.SphereGeometry(1.35, 64, 64),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.04,
    wireframe: true
  })
);
scene.add(glow);

// Keyboard motion
const keys = {};
window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

function animate() {
  requestAnimationFrame(animate);

  core.rotation.y += 0.002;
  glow.rotation.y -= 0.001;

  if (keys["ArrowLeft"]) core.rotation.y -= 0.02;
  if (keys["ArrowRight"]) core.rotation.y += 0.02;
  if (keys["ArrowUp"]) core.rotation.x -= 0.02;
  if (keys["ArrowDown"]) core.rotation.x += 0.02;

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
