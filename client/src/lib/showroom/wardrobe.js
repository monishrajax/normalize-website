import * as THREE from "three";

/* The wardrobe: a walnut cabinet with two doors that swing open, a brass rod, and the
   clothes hung from it.

   NOTHING HERE IS STILL. Every garment is a pendulum on its hook. The cursor leans the
   ones near it toward it, a quick sweep of the mouse sets them swinging, and the hem
   trails the shoulders and overshoots, so a swing travels down the cloth instead of
   moving it as a board. A faint breeze keeps the rest breathing.

   ONE SPOTLIGHT, and it is the cursor's. It follows the pointer, but when the pointer is
   over a garment it settles on that garment, sized to it, so what you are pointing at is
   what is lit; everything else falls back into the dim. The garments cast soft shadows
   on the back of the cabinet, and those move with the light.

   The pictures on the garments are photographs; this file only knows how to hang them.  */

const FOV = 30;
const INNER_HALF = 2.1;          // half the interior width
const FLOOR_Y = 0.3;
const TOP_Y = 2.3;
const ROD_Y = 1.98;
const BACK_Z = -0.36;
const FRONT_Z = 0.36;
const DOOR_OPEN = 1.78;          // radians, a little past square
const PITCH = 0.425;             // distance between hangers along the rod

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Walnut, drawn once: long grain with the odd darker streak, and a fine tooth. */
function woodTexture(seed, base) {
  const W = 1024, H = 1024;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const rnd = mulberry32(seed);
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 420; i++) {
    const x0 = rnd() * W, w = 0.6 + rnd() * 3.2;
    const dark = rnd() < 0.7;
    x.strokeStyle = dark ? `rgba(8,3,1,${0.04 + rnd() * 0.16})` : `rgba(150,96,58,${0.03 + rnd() * 0.08})`;
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(x0, 0);
    x.bezierCurveTo(x0 + (rnd() - 0.5) * 40, H * 0.33, x0 + (rnd() - 0.5) * 40, H * 0.66, x0 + (rnd() - 0.5) * 24, H);
    x.stroke();
  }
  for (let i = 0; i < 26; i++) {                       // broad figure
    const x0 = rnd() * W, w = 14 + rnd() * 50;
    const g = x.createLinearGradient(x0 - w, 0, x0 + w, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, `rgba(0,0,0,${0.05 + rnd() * 0.1})`); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(x0 - w, 0, w * 2, H);
  }
  const img = x.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n * 0.8; img.data[i + 2] += n * 0.6;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* The sway, in the vertex shader. A garment's origin is its hook; y runs down to the hem.
   Position and normal share one function so the light follows the bend, not the flat card. */
const DEFORM_FN = /* glsl */ `
uniform float uPhi;       // swing of the whole garment about its hook
uniform float uHem;       // extra swing the hem has, relative to the shoulders
uniform float uTwist;     // turn about the vertical, at the hem
uniform float uFlutter;   // metres of ripple at the hem
uniform float uBulge;     // metres the body stands out toward the room
uniform float uTime;
uniform float uDrop;      // hook to hem, metres
uniform float uHalfW;

void garmentDeform(in vec3 p, out vec3 outP, out vec3 outN) {
  float t = clamp(-p.y / uDrop, 0.0, 1.0);
  float u = clamp(p.x / uHalfW, -1.0, 1.0);

  // depth: the garment has a body, and ripples travel down it
  float body = uBulge * (1.0 - u * u) * sin(3.14159 * clamp(t * 1.06, 0.0, 1.0));
  float k1 = 9.0, k2 = 17.0;
  float w1 = sin(p.y * k1 + uTime * 2.3 + p.x * 5.0);
  float w2 = sin(p.y * k2 - uTime * 3.1 + p.x * 9.0);
  float rip = uFlutter * t * t * (w1 + 0.5 * w2);
  float z = body + rip;

  // slope of that surface, for the normal
  float dzdx = uBulge * (-2.0 * u / uHalfW) * sin(3.14159 * clamp(t * 1.06, 0.0, 1.0))
             + uFlutter * t * t * (5.0 * cos(p.y * k1 + uTime * 2.3 + p.x * 5.0) + 4.5 * cos(p.y * k2 - uTime * 3.1 + p.x * 9.0));
  float dzdy = uFlutter * t * t * (k1 * cos(p.y * k1 + uTime * 2.3 + p.x * 5.0) + 0.5 * k2 * cos(p.y * k2 - uTime * 3.1 + p.x * 9.0))
             + uBulge * (1.0 - u * u) * cos(3.14159 * clamp(t * 1.06, 0.0, 1.0)) * 3.14159 / uDrop * -1.0;
  vec3 n = normalize(vec3(-dzdx, -dzdy, 1.0));

  // turn about the vertical axis
  float tw = uTwist * t;
  float ct = cos(tw), st = sin(tw);
  vec3 q = vec3(p.x * ct + z * st, p.y, -p.x * st + z * ct);
  n = vec3(n.x * ct + n.z * st, n.y, -n.x * st + n.z * ct);

  // swing about the hook: the hem swings further than the shoulders
  float a = uPhi + uHem * pow(t, 1.5);
  float c = cos(a), s = sin(a);
  outP = vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
  outN = vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z);
}
`;

function sharedUniforms() {
  return {
    uPhi: { value: 0 }, uHem: { value: 0 }, uTwist: { value: 0 }, uFlutter: { value: 0.004 },
    uBulge: { value: 0.02 }, uTime: { value: 0 }, uDrop: { value: 1 }, uHalfW: { value: 0.25 },
  };
}

function patchStandard(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${DEFORM_FN}`)
    .replace("#include <beginnormal_vertex>", "vec3 gP; vec3 gN; garmentDeform(position, gP, gN);\nvec3 objectNormal = gN;")
    .replace("#include <begin_vertex>", "vec3 transformed = gP;");
}

function patchDepth(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${DEFORM_FN}`)
    .replace("#include <begin_vertex>", "vec3 gP; vec3 gN; garmentDeform(position, gP, gN);\nvec3 transformed = gP;");
}

/* A soft round cookie, so the spotlight's pool has the falloff of a real lamp rather than a disc. */
function spotCookie() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, "#ffffff");
  g.addColorStop(0.55, "#d8d8d8");
  g.addColorStop(0.85, "#4a4a4a");
  g.addColorStop(1.0, "#000000");
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


/* ---- the hangers the photographs do not have ----
   All are drawn in the garment's own space: the origin is where the hook meets the rod, y runs
   down, and the picture hangs from wherever the hanger ends. */
const steel = new THREE.MeshStandardMaterial({ color: 0xa9abb0, metalness: 0.9, roughness: 0.34 });
const hangerWood = new THREE.MeshStandardMaterial({ color: 0xb98d5e, roughness: 0.55, metalness: 0 });
const hangerIvory = new THREE.MeshStandardMaterial({ color: 0xece5d8, roughness: 0.5, metalness: 0 });

function hookWire(apexY) {
  // from the hanger's neck, up, round three-quarters of the rod, and down the far side
  const R = 0.0186;
  const pts = [new THREE.Vector3(0, apexY, 0), new THREE.Vector3(0, apexY * 0.55 - R * 0.45, 0)];
  for (let i = 0; i <= 22; i++) {
    const a = ((270 - (305 * i) / 22) * Math.PI) / 180;
    pts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0));
  }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 72, 0.0017, 6), steel);
  m.castShadow = true;
  return m;
}

function clipHanger(width) {
  const g = new THREE.Group();
  const bar = Math.min(0.5, Math.max(0.2, width * 0.84));
  const barY = -0.092;
  const b = new THREE.Mesh(new THREE.BoxGeometry(bar, 0.011, 0.012), hangerWood);
  b.position.set(0, barY, 0);
  b.castShadow = true;
  g.add(b, hookWire(barY + 0.004));
  // two clips at the ends, and one in the middle when the bar is wide enough to need it (three socks)
  const at = bar > 0.4 ? [-0.34, 0, 0.34] : [-0.37, 0.37];
  for (const px of at) {
    for (const sz of [-1, 1]) {
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.004), steel);
      jaw.position.set(px * bar, barY - 0.03, sz * 0.0075);
      g.add(jaw);
    }
  }
  return g;
}

function shoulderHanger() {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  const P = [[-0.215, -0.122], [-0.205, -0.133], [-0.19, -0.13], [-0.035, -0.086], [0.035, -0.086], [0.19, -0.13], [0.205, -0.133], [0.215, -0.122], [0.2, -0.112], [0.035, -0.072], [-0.035, -0.072], [-0.2, -0.112]];
  sh.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) sh.lineTo(P[i][0], P[i][1]);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.0025, bevelSegments: 2 });
  geo.translate(0, 0, -0.006 - 0.008);          // just behind the garment
  const m = new THREE.Mesh(geo, hangerIvory);
  m.castShadow = true;
  g.add(m, hookWire(-0.076));
  return g;
}

/* How far below the rod the top of the picture sits, for each kind of hanger. */
const DROP = { wire: -0.078, clip: -0.108, shoulder: -0.126 };

export function createWardrobe({ envTexture }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030202);
  scene.environment = envTexture;
  scene.environmentIntensity = 0.2;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  const view = { w: 1, h: 1, aspect: 1, dist: 4, panX: 0, panGoal: 0, maxPan: 0, contentW: 3, visW: 4.2 };
  const rig = { x: 0, y: 0 };

  /* ---- materials ---- */
  const walnutA = woodTexture(11, "#3a2415");
  const walnutB = woodTexture(29, "#2e1c0f");
  const wood = (map, rough = 0.6) => new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.9, roughness: rough, metalness: 0 });
  const matBody = wood(walnutA, 0.62);
  const matInner = wood(walnutB, 0.7);
  const matDoor = wood(walnutA, 0.42);
  const matPanel = new THREE.MeshStandardMaterial({ map: walnutB, bumpMap: walnutB, bumpScale: 0.9, roughness: 0.38, metalness: 0, color: 0xcdbfb0 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9ad4a, roughness: 0.24, metalness: 1 });

  /* ---- the cabinet ---- */
  const cabinet = new THREE.Group();
  scene.add(cabinet);
  const box = (w, h, d, mat, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = shadow;
    cabinet.add(m);
    return m;
  };
  const sideT = 0.07;
  const innerH = TOP_Y - FLOOR_Y;
  box(sideT, innerH + 0.12, FRONT_Z - BACK_Z + 0.04, matBody, -(INNER_HALF + sideT / 2), (TOP_Y + FLOOR_Y) / 2, 0);
  box(sideT, innerH + 0.12, FRONT_Z - BACK_Z + 0.04, matBody, +(INNER_HALF + sideT / 2), (TOP_Y + FLOOR_Y) / 2, 0);
  box(INNER_HALF * 2 + sideT * 2, 0.07, FRONT_Z - BACK_Z + 0.04, matBody, 0, TOP_Y + 0.035, 0);
  box(INNER_HALF * 2, 0.06, FRONT_Z - BACK_Z, matInner, 0, FLOOR_Y - 0.03, 0);
  box(INNER_HALF * 2 + 0.2, 0.3, FRONT_Z - BACK_Z + 0.06, matBody, 0, FLOOR_Y - 0.21, 0.01);
  box(INNER_HALF * 2 + sideT * 2, innerH + 0.12, 0.035, matInner, 0, (TOP_Y + FLOOR_Y) / 2, BACK_Z - 0.0175);
  box(INNER_HALF * 2, 0.035, FRONT_Z - BACK_Z - 0.06, matInner, 0, TOP_Y - 0.28, -0.03);        // the shelf above the rod

  // the rod, and what it hangs from
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, INNER_HALF * 2, 24), brass);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, ROD_Y, 0);
  rod.castShadow = true;
  cabinet.add(rod);
  for (const sx of [-1, 1]) {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), brass);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(sx * (INNER_HALF - 0.006), ROD_Y, 0);
    cabinet.add(flange);
  }

  /* ---- the doors ---- */
  const doorW = INNER_HALF - 0.004, doorH = innerH + 0.1, doorT = 0.045;
  const makeDoor = (sign) => {
    const hinge = new THREE.Group();
    hinge.position.set(sign * (INNER_HALF + sideT * 0.2), (TOP_Y + FLOOR_Y) / 2, FRONT_Z + doorT / 2);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorT), matDoor);
    slab.position.x = -sign * doorW / 2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.3, doorH - 0.34, 0.012), matPanel);
    panel.position.set(-sign * doorW / 2, 0, doorT / 2 + 0.004);
    // the handle: a brass bar standing off two posts, near the meeting edge
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 16), brass);
    bar.position.set(-sign * (doorW - 0.1), 0, doorT / 2 + 0.05);
    const post = new THREE.CylinderGeometry(0.006, 0.006, 0.05, 12);
    for (const y of [-0.12, 0.12]) {
      const p = new THREE.Mesh(post, brass);
      p.rotation.x = Math.PI / 2;
      p.position.set(-sign * (doorW - 0.1), y, doorT / 2 + 0.025);
      hinge.add(p);
    }
    hinge.add(slab, panel, bar);
    scene.add(hinge);
    return hinge;
  };
  const doorL = makeDoor(-1), doorR = makeDoor(+1);

  /* ---- lights ---- */
  const hemi = new THREE.HemisphereLight(0x6e5644, 0x2a1d14, 0.55);
  scene.add(hemi);
  // while the doors are shut the cabinet needs a light of its own, which gives way to the cursor's
  const doorKey = new THREE.SpotLight(0xffe9d2, 90, 30, 0.7, 1.0, 1.5);
  doorKey.position.set(0, 4.4, 5.2);
  doorKey.target.position.set(0, 1.35, FRONT_Z);
  scene.add(doorKey, doorKey.target);

  const cookie = spotCookie();
  const lamp = new THREE.SpotLight(0xffe6c0, 0, 16, 0.14, 0.85, 1.4);
  lamp.map = cookie;
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0002;
  lamp.shadow.radius = 9;              // variance shadows: soft, and the light is close
  lamp.shadow.blurSamples = 16;
  lamp.shadow.intensity = 0.62;        // a shadow in a lit room is never black
  lamp.shadow.camera.near = 1.5;
  lamp.shadow.camera.far = 9;
  lamp.position.set(0, 3.2, 3.6);
  lamp.target.position.set(0, 1.5, 0);
  scene.add(lamp, lamp.target);

  /* ---- the clothes ---- */
  const garments = [];
  const clothes = new THREE.Group();
  scene.add(clothes);
  const stub = { hovered: -1, spotP: new THREE.Vector3(0, 1.4, 0), spotR: 0.5, lastP: new THREE.Vector3() };

  function clear() {
    for (const g of garments) {
      clothes.remove(g.group);
      g.mesh.geometry.dispose();
      g.mat.dispose(); g.depth.dispose();
      g.map?.dispose();
    }
    garments.length = 0;
  }

  /* items: [{ label, height, map, aspect, hook:{x,y} }] — see index.js for where these come from */
  function setContent(items) {
    clear();
    const n = items.length;
    const widths = items.map((it) => it.height * it.aspect);
    const pitch = Math.min(PITCH, (INNER_HALF * 2 - 0.3) / Math.max(n, 1));
    const total = pitch * (n - 1);
    view.contentW = total + 0.55;
    items.forEach((it, i) => {
      const w = widths[i], h = it.height;
      const hook = it.hook || { x: 0.5, y: 0.02 };
      const yOff = it.hanger ? DROP[it.hanger] : 0;
      const geo = new THREE.PlaneGeometry(w, h, 16, 28);
      geo.translate(-(hook.x - 0.5) * w, -(0.5 - hook.y) * h + yOff, 0);
      const uniforms = sharedUniforms();
      uniforms.uDrop.value = h * (1 - hook.y) - yOff;
      uniforms.uHalfW.value = w / 2;
      uniforms.uBulge.value = 0.018 + 0.012 * (i % 3) / 2;

      const map = it.map;
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      const mat = new THREE.MeshStandardMaterial({
        map, bumpMap: map, bumpScale: 1.4, roughness: 0.82, metalness: 0,
        side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true,
        emissive: new THREE.Color(0xffd9a0), emissiveMap: map, emissiveIntensity: 0,
      });
      mat.onBeforeCompile = (s) => patchStandard(s, uniforms);
      mat.customProgramCacheKey = () => "garment-std-v1";
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
      depth.onBeforeCompile = (s) => patchDepth(s, uniforms);
      depth.customProgramCacheKey = () => "garment-depth-v1";

      const mesh = new THREE.Mesh(geo, mat);
      mesh.customDepthMaterial = depth;
      mesh.castShadow = true;
      mesh.frustumCulled = false;

      const group = new THREE.Group();
      const x = -total / 2 + i * pitch;
      group.position.set(x, ROD_Y, (i % 2 ? 0.045 : -0.045) + (i % 3 === 0 ? 0.02 : 0));
      group.add(mesh);
      // what the picture hangs from, if the picture does not show it
      let hanger = null;
      if (it.hanger === "wire") hanger = (() => { const g = new THREE.Group(); g.add(hookWire(yOff + 0.004)); return g; })();
      else if (it.hanger === "clip") hanger = clipHanger(w);
      else if (it.hanger === "shoulder") hanger = shoulderHanger();
      if (hanger) group.add(hanger);
      clothes.add(group);

      garments.push({
        i, label: it.label, group, mesh, mat, depth, uniforms, map, hanger,
        x, w, h, drop: h * (1 - hook.y) - yOff,
        phi: 0, phiV: 0, accTop: 0, hem: 0, hemV: 0, twist: 0, twistV: 0,
        hov: 0, seed: i * 1.913,
      });
    });
    layout(view.w, view.h);          // the camera was fitted before there was anything on the rod
  }

  /* ---- layout: depends on the canvas shape ---- */
  function layout(w, h) {
    view.w = w; view.h = h; view.aspect = w / h;
    camera.aspect = view.aspect;
    const tan = Math.tan((FOV * Math.PI) / 360);
    const fitWide = Math.min(INNER_HALF * 2 + 0.3, view.contentW + 0.6);
    const wanted = view.aspect < 1.1 ? 2.3 : fitWide;
    const needH = 1.62;                  // rod to hem, with air; the floor of the cabinet may fall out of frame
    view.dist = Math.max(wanted / (2 * tan * view.aspect), needH / (2 * tan));
    view.visW = 2 * tan * view.dist * view.aspect;
    view.maxPan = Math.max(0, view.contentW / 2 - view.visW / 2 + 0.05);
    view.panGoal = clamp(view.panGoal, -view.maxPan, view.maxPan);
    camera.updateProjectionMatrix();
    placeCamera(0, 0, 0);
  }

  function placeCamera(px, py, dt) {
    rig.x = dt ? damp(rig.x, px * 0.18, 3, dt) : px * 0.18;
    rig.y = dt ? damp(rig.y, py * 0.06, 3, dt) : py * 0.06;
    view.panX = dt ? damp(view.panX, view.panGoal, 6, dt) : view.panGoal;
    camera.position.set(view.panX + rig.x, 1.5 + rig.y, view.dist);
    camera.lookAt(view.panX + rig.x * 0.4, 1.5, 0);
    camera.updateMatrixWorld(true);
  }

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  /* ---- per frame ----
       state.doors     0 closed .. 1 open
       state.pointer   { x, y, inside, touch }   -1..1 over the canvas
       state.reduced   true: no sway, no moving light                                  */
  const out = { index: -1, label: "", x: 0, y: 0 };
  let prevDoors = 0;

  function update(dt, time, state) {
    const { doors, pointer, reduced } = state;
    const open = doors;

    // doors
    const ang = open * DOOR_OPEN;
    doorL.rotation.y = -ang;
    doorR.rotation.y = +ang;

    placeCamera(reduced ? 0 : pointer.x, reduced ? 0 : pointer.y, dt);

    // where the cursor is on the plane of the clothes
    let hasP = pointer.inside;
    if (hasP) {
      ndc.set(pointer.x, pointer.y);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) hasP = false;
    }
    if (!hasP) {
      // nobody is pointing: let the light wander along the rod, slowly, so the room is never dead
      hit.set(view.panX + (reduced ? 0 : Math.sin(time * 0.35) * Math.min(1.4, view.visW * 0.32)), 1.45 + (reduced ? 0 : Math.sin(time * 0.5) * 0.12), 0);
    }
    const vx = (hit.x - stub.lastP.x) / Math.max(dt, 1e-3);
    stub.lastP.copy(hit);
    const vxS = clamp(vx, -6, 6);

    // which garment is under it
    let hovered = -1;
    if (hasP && open > 0.55) {
      for (const g of garments) {
        const hemY = ROD_Y - g.drop;
        if (Math.abs(hit.x - g.x) < g.w * 0.5 + 0.03 && hit.y < ROD_Y + 0.08 && hit.y > hemY - 0.08) { hovered = g.i; break; }
      }
    }
    stub.hovered = hovered;

    // the clothes
    const breeze = reduced ? 0 : 1;
    for (const g of garments) {
      const dx = hit.x - g.x;
      const reach = g.w * 1.1;
      const prox = Math.exp(-(dx * dx) / (reach * reach)) * (hasP ? 1 : 0);
      const lean = clamp(dx * 0.26, -0.18, 0.18) * prox;

      const w0 = 5.4 - 1.5 * (g.drop - 0.5);              // a longer garment swings slower
      const zeta = 0.085;
      let acc = -w0 * w0 * (g.phi - (reduced ? 0 : lean)) - 2 * zeta * w0 * g.phiV;
      acc += breeze * (0.55 * Math.sin(time * 0.83 + g.seed) + 0.35 * Math.sin(time * 1.9 + g.seed * 2.1));
      acc += breeze * vxS * 1.7 * prox;                    // a sweep of the mouse sets it swinging
      // the doors opening move the air
      if (prevDoors < 0.4 && open >= 0.4 && !reduced) g.phiV += (g.i % 2 ? 1 : -1) * (0.5 + 0.12 * ((g.i * 7) % 5));
      g.phiV += acc * dt;
      g.phi = clamp(g.phi + g.phiV * dt, -0.55, 0.55);
      g.accTop = acc;

      // the hem lags the shoulders: driven by the shoulders' acceleration, free to ring
      const w1 = 9.5, zeta1 = 0.14;
      const accH = -w1 * w1 * g.hem - 2 * zeta1 * w1 * g.hemV - 0.9 * g.accTop;
      g.hemV += accH * dt;
      g.hem = clamp(g.hem + g.hemV * dt, -0.6, 0.6);

      // a little turn about the vertical, riding the swing
      const twGoal = clamp(g.phiV * 0.12, -0.3, 0.3) + breeze * 0.05 * Math.sin(time * 0.6 + g.seed * 1.3);
      g.twist = damp(g.twist, twGoal, 3, dt);

      g.hov = damp(g.hov, g.i === hovered ? 1 : 0, 7, dt);

      const u = g.uniforms;
      u.uPhi.value = g.phi;
      if (g.hanger) g.hanger.rotation.z = g.phi;
      u.uHem.value = g.hem;
      u.uTwist.value = g.twist;
      u.uTime.value = time;
      u.uFlutter.value = breeze * (0.0035 + 0.006 * g.hov + 0.01 * Math.min(1, Math.abs(g.phiV) * 0.5));
      g.mat.emissiveIntensity = 0.05 * g.hov;
    }
    prevDoors = open;

    // the lamp: follows the cursor, settles on the garment under it
    const target = stub.spotP;
    let radius = 0.55;
    let gx = hit.x, gy = hit.y;
    let strength = hasP ? 0.7 : 0.5;
    if (hovered >= 0) {
      const g = garments[hovered];
      const cx = g.x, cy = ROD_Y - g.drop * 0.5;
      gx = cx + (hit.x - cx) * 0.25;
      gy = cy + (hit.y - cy) * 0.2;
      radius = Math.max(g.w, g.drop) * 0.62;
      strength = 1;
    }
    target.x = damp(target.x, gx, hovered >= 0 ? 9 : 6, dt);
    target.y = damp(target.y, gy, hovered >= 0 ? 9 : 6, dt);
    stub.spotR = damp(stub.spotR, radius, 5, dt);
    lamp.position.set(target.x * 0.55 + view.panX * 0.45, target.y + 1.5, 3.7);
    lamp.target.position.set(target.x, target.y, 0.02);
    const dist = lamp.position.distanceTo(lamp.target.position);
    lamp.angle = Math.atan(stub.spotR / dist);
    lamp.intensity = damp(lamp.intensity, 150 * open * open * strength, 6, dt);

    doorKey.intensity = 90 * (1 - 0.88 * clamp(open * 1.2, 0, 1));
    hemi.intensity = 0.4 + 0.75 * open;

    // what to caption, and where on the canvas
    if (hovered >= 0) {
      const g = garments[hovered];
      tmp.set(g.x + Math.sin(g.phi) * g.drop * 0.5, ROD_Y - g.drop - 0.07, 0.05).project(camera);
      out.index = hovered; out.label = g.label;
      out.x = ((tmp.x + 1) / 2) * view.w; out.y = ((1 - tmp.y) / 2) * view.h;
    } else {
      out.index = -1;
    }
    return out;
  }

  /* drag the rod sideways (narrow screens) */
  function pan(dxWorld) { view.panGoal = clamp(view.panGoal + dxWorld, -view.maxPan, view.maxPan); }
  const worldPerPixel = () => view.visW / Math.max(view.w, 1);

  function dispose() {
    clear();
    walnutA.dispose(); walnutB.dispose(); cookie.dispose();
    matBody.dispose(); matInner.dispose(); matDoor.dispose(); matPanel.dispose(); brass.dispose();
    scene.traverse((o) => { if (o.geometry && o !== clothes) o.geometry.dispose?.(); });
    lamp.shadow.map?.dispose();
  }

  return { scene, camera, layout, update, setContent, pan, worldPerPixel, dispose, view, garments };
}
