import * as THREE from "three";
import { createCurtain } from "./curtain.js";
import { loadMannequin, goldMaterial } from "../mannequin.js";

/* The stage: two gold mannequins on plinths, a dark polished floor that mirrors them,
   a wall that falls into shadow, a spotlight on each figure, and the red curtain
   hanging in front of all of it.

   Nothing here owns a renderer or a loop; the showroom (index.js) feeds it the scroll
   progress and the pointer every frame and draws whatever scene is current. */

export const FIGURES = [
  { id: "men", file: "man.bin", x: -0.80, yaw: 0.34 },
  { id: "women", file: "woman.bin", x: 0.80, yaw: -0.34 },
];

const FOV = 30;
const PLINTH_H = 0.05;
const NEEDED_WIDTH = 3.1;          // metres at the figures that must be on screen
const BASE_DISTANCE = 5.3;
const CURTAIN_Z = 0.7;             // in front of the figures, behind the camera

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function backdropTexture() {
  const W = 512, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.62);
  g.addColorStop(0, "#4a3d33");
  g.addColorStop(0.45, "#241d18");
  g.addColorStop(1, "#080605");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createStage({ envTexture, assetBase = "/assets/showroom/" }) {
  const scene = new THREE.Scene();
  scene.environment = envTexture;
  scene.background = new THREE.Color(0x040302);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  const view = { w: 1, h: 1, aspect: 1, distance: BASE_DISTANCE, halfW: 3 };
  const rig = { x: 0, y: 0 };

  /* ---- the room ---- */
  const wallTexture = backdropTexture();
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 16),
    new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 1, metalness: 0, color: 0xffffff })
  );
  wall.position.set(0, 8, -3.2);
  scene.add(wall);

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0b0908,
    roughness: 0.3,
    metalness: 0.15,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = 5;
  scene.add(floor);

  /* ---- lights ---- */
  const spots = FIGURES.map((f) => {
    const s = new THREE.SpotLight(0xfff0dc, 0, 30, 0.34, 0.9, 1.6);
    s.position.set(f.x * 0.6, 5.2, 2.0);
    s.target.position.set(f.x, 0.95, 0);
    scene.add(s, s.target);
    return s;
  });
  // the house light that the curtain is lit by while the stage is dark
  const house = new THREE.SpotLight(0xfff1e4, 150, 30, 0.95, 1.0, 1.4);
  house.position.set(0, 7.6, 3.4);
  house.target.position.set(0, 0.4, CURTAIN_Z);
  scene.add(house, house.target);
  const fill = new THREE.HemisphereLight(0xffeedd, 0x120808, 0.06);
  scene.add(fill);

  /* ---- the curtain ---- */
  const left = createCurtain({ side: -1, seed: 7 });
  const right = createCurtain({ side: +1, seed: 19 });
  scene.add(left.mesh, right.mesh);

  /* ---- the figures ---- */
  const gold = goldMaterial();
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x0a0908, roughness: 0.22, metalness: 0.5 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.25, metalness: 1 });
  const plinthGeo = new THREE.CylinderGeometry(0.42, 0.44, PLINTH_H, 72);
  const ringGeo = new THREE.RingGeometry(0.405, 0.42, 72);
  ringGeo.rotateX(-Math.PI / 2);

  const figures = FIGURES.map((f) => ({ ...f, yawNow: f.yaw, yawGoal: f.yaw, group: null, mirror: null, mesh: null, rect: null }));
  const meshes = new Map();

  const build = (f, geometry) => {
    const make = () => {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(geometry, gold);
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.y = -PLINTH_H / 2;
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.001;
      g.add(plinth, ring, mesh);
      g.position.set(f.x, PLINTH_H, 0);
      return { g, mesh };
    };
    const real = make();
    scene.add(real.g);
    // the reflection in the floor: the same figure, upside down, under the glass
    const mirror = make();
    mirror.g.scale.y = -1;
    mirror.g.position.y = -PLINTH_H;
    scene.add(mirror.g);
    f.group = real.g; f.mesh = real.mesh; f.mirror = mirror.g;
    f.group.rotation.y = f.mirror.rotation.y = f.yawNow;
    meshes.set(f.id, real.g);
  };

  const ready = Promise.all(
    figures.map((f) => loadMannequin(assetBase + f.file).then((geometry) => build(f, geometry)).catch(() => {}))
  );

  /* ---- layout: depends on the canvas shape ---- */
  const FIG_TOP = 1.92 + PLINTH_H;

  function layout(w, h) {
    view.w = w; view.h = h; view.aspect = w / h;
    camera.aspect = view.aspect;
    const tan = Math.tan((FOV * Math.PI) / 360);
    view.distance = Math.max(BASE_DISTANCE, NEEDED_WIDTH / (2 * tan * view.aspect));
    camera.fov = FOV;
    camera.updateProjectionMatrix();

    const halfW = tan * (view.distance - CURTAIN_Z) * view.aspect;
    view.halfW = halfW;
    const common = {
      closedSpan: halfW + 0.14,
      openSpan: clamp(halfW * 0.24, 0.55, 1.5),
      height: 6,
      z0: CURTAIN_Z,
      hem: 0.02,
    };
    left.configure({ left: -halfW - 0.18, ...common });
    right.configure({ left: halfW + 0.18, ...common });

    place(0, 0, 0);
    // where each figure sits on screen, for the buttons laid over the canvas
    for (const f of figures) {
      const pts = [];
      for (const dx of [-0.38, 0.38]) for (const y of [0, FIG_TOP]) for (const dz of [-0.2, 0.2]) {
        pts.push(new THREE.Vector3(f.x + dx, y, dz).project(camera));
      }
      const xs = pts.map((p) => ((p.x + 1) / 2) * w), ys = pts.map((p) => ((1 - p.y) / 2) * h);
      f.rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      f.screenNX = ((f.rect.x + f.rect.w / 2) / w) * 2 - 1;
    }
  }

  function place(px, py, dt) {
    rig.x = dt ? damp(rig.x, px * 0.32, 3, dt) : px * 0.32;
    rig.y = dt ? damp(rig.y, py * 0.10, 3, dt) : py * 0.10;
    camera.position.set(rig.x, 1.34 + rig.y, view.distance);
    camera.lookAt(rig.x * 0.25, 0.98, 0);
    camera.updateMatrixWorld(true);
  }

  /* ---- per frame ----
       progress  { open, lights }      from the scroll
       pointer   { x, y, inside }      -1..1 over the canvas
       hover     'men' | 'women' | null                                         */
  function update(dt, time, { open, lights, pointer, hover, reduced }) {
    const gust = reduced ? 0 : clamp(pointer.speed ?? 0, 0, 1);
    left.update(open, dt, time, gust);
    right.update(open, dt, time, gust);

    place(reduced ? 0 : pointer.x, reduced ? 0 : pointer.y, dt);

    gold.envMapIntensity = 0.25 + 1.2 * lights;
    house.intensity = 150 * (1 - 0.45 * lights);
    fill.intensity = 0.06 + 0.1 * lights;

    figures.forEach((f, i) => {
      const hovered = hover === f.id;
      const dim = hover && !hovered ? 0.7 : 1;
      const target = lights * (hovered ? 135 : 100) * dim;
      spots[i].intensity = damp(spots[i].intensity, target, 6, dt);

      if (!f.group) return;
      const look = reduced || !pointer.inside ? 0 : clamp((pointer.x - f.screenNX) * 0.28, -0.5, 0.5);
      f.yawGoal = f.yaw + look * (hovered ? 1.4 : 1);
      f.yawNow = damp(f.yawNow, f.yawGoal, 3.2, dt);
      f.group.rotation.y = f.mirror.rotation.y = f.yawNow;
    });
  }

  function dispose() {
    left.dispose(); right.dispose();
    wallTexture.dispose();
    plinthGeo.dispose(); ringGeo.dispose();
    gold.dispose(); plinthMat.dispose(); ringMat.dispose(); floorMat.dispose();
  }

  return {
    scene, camera, ready, update, layout, dispose,
    rects: () => figures.map((f) => ({ id: f.id, rect: f.rect })),
    view,
  };
}
