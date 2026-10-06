import * as THREE from "three";
import { buildCoinRig, faceBrightness } from "./coinScene";

/* The opening shot: black, then our coin out of the dark — dropping in from
   far back, tumbling, settling, and finally driven at the lens until it fills
   the screen and the page gives way behind it.

   It is the SAME coin as the launch stage (buildCoinRig), not a lookalike.

   Everything is a pure function of time — update(t) places the camera, the
   coin, the light and the overlay opacity — so the shot can be stepped to any
   frame and checked, and a throttled tab simply jumps to where the clock says
   it should be instead of replaying late.

   The coin stays on the Y axis: rotation.z is never touched, and the small
   tumble at the start is on the parallax node, not the flip pivot. */

export const INTRO_SECONDS = 4.6;
const T_APPROACH = 2.4;    // arrives from the deep, easing to a stop
const T_PUSH = 3.1;        // starts coming at the screen
const T_FADE = 3.95;       // the overlay begins to give way to the page
const T_SPIN = 4.1;        // the turn finishes face-on, front side to us
const SKIP_SECONDS = 0.35;

const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(17));   // camera fov 34

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const mix = (a, b, k) => a + (b - a) * k;
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x) => x * x * x;
const smooth = (x) => x * x * (3 - 2 * x);
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function createIntroScene(container, { isSmall = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;   // no WebGL — the caller just shows the page
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.setClearColor(0x000000, 0);

  /* Back to front: a warm halo behind the coin, the canvas, then a vignette
     that darkens the corners so the coin sits in a pool of light. */
  const halo = document.createElement("div");
  halo.setAttribute("aria-hidden", "true");
  halo.style.cssText =
    "position:absolute;inset:0;pointer-events:none;will-change:opacity,transform;opacity:0;" +
    "background:radial-gradient(circle at 50% 50%,rgba(214,176,102,.30) 0%,rgba(214,176,102,.10) 26%,rgba(214,176,102,0) 56%);";
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  const vignette = document.createElement("div");
  vignette.setAttribute("aria-hidden", "true");
  vignette.style.cssText =
    "position:absolute;inset:0;pointer-events:none;" +
    "background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 48%,rgba(0,0,0,.72) 100%);";
  container.append(halo, canvas, vignette);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 1, 2);   // distances set per frame from the framing
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 400);

  const rig = buildCoinRig(renderer, scene, { isSmall });
  const { tiltGroup, pivot, keyLight } = rig;

  /* Gold dust the camera flies through. Parallax is what makes the approach
     read as depth rather than as a coin getting bigger. Kept off the axis (the
     annulus starts at r = 1.3) so nothing ever passes through the lens. */
  const moteSprite = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,244,214,1)");
    g.addColorStop(0.35, "rgba(240,205,130,.55)");
    g.addColorStop(1, "rgba(240,205,130,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const MOTES = isSmall ? 140 : 280;
  const motePos = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    const r = 1.3 + Math.random() * 7.5;
    const a = Math.random() * Math.PI * 2;
    motePos[i * 3] = Math.cos(a) * r;
    motePos[i * 3 + 1] = Math.sin(a) * r;
    motePos[i * 3 + 2] = -5 + Math.random() * 65;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    map: moteSprite, size: isSmall ? 0.07 : 0.055, sizeAttenuation: true,
    transparent: true, opacity: 0.6, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xe8c97a,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  let width = 1, height = 1;
  function resize() {
    width = container.clientWidth || window.innerWidth || 1;
    height = container.clientHeight || window.innerHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  /* The whole shot. `fade` multiplies the overlay opacity — 1 normally, and
     ramped to 0 by a skip. */
  function update(t, fade = 1) {
    const aspect = width / height;
    /* Distance at which the coin's radius just touches the NEARER screen edge:
       the one number that frames it correctly on a phone and a monitor alike. */
    const fit = 1 / (TAN_HALF_FOV * Math.min(aspect, 1));
    const dHover = fit * 1.9;
    const dStart = dHover * 7;
    const dEnd = fit * 0.3;

    let d;
    if (t < T_APPROACH) d = mix(dStart, dHover, easeOutCubic(t / T_APPROACH));
    else if (t < T_PUSH) d = dHover * (1 - 0.04 * ((t - T_APPROACH) / (T_PUSH - T_APPROACH)));
    else d = mix(dHover * 0.96, dEnd, easeInCubic(clamp01((t - T_PUSH) / (INTRO_SECONDS - T_PUSH))));

    camera.position.set(Math.sin(t * 0.9) * 0.045 * d, 0, d);
    camera.lookAt(0, 0, 0);

    /* The drop: from near the top of the frame, gathering speed and then
       cushioning into centre — slow enough at the start that the fall is
       actually seen while the coin is still coming up out of the dark. In
       screen terms, so it reads the same at every depth. */
    const drop = 0.92 * (1 - easeInOutCubic(clamp01(t / 2.2)));
    tiltGroup.position.y = (drop + 0.012 * Math.sin(t * 2.4)) * TAN_HALF_FOV * d;

    /* Begins on its BACK and turns 3.5 times to land front-on — the flip is
       always on the pivot's Y; X and Z stay put. */
    pivot.rotation.set(0, Math.PI + 7 * Math.PI * easeOutCubic(clamp01(t / T_SPIN)), 0);
    tiltGroup.rotation.x = 0.42 * Math.exp(-1.3 * t) * Math.sin(5.2 * t + 0.6);

    /* It comes out of the dark: the fog is black, so distance alone brings it
       up from nothing as it approaches. */
    scene.fog.near = dHover * 1.2;
    scene.fog.far = dHover * 8.5;

    /* Light follows the turn, and a glint rakes across the face while it
       hovers — the same two ideas as the launch stage. */
    const face = faceBrightness(pivot.rotation.y);
    keyLight.intensity = 1.1 * (0.35 + 0.65 * face);
    let glint = 0;
    const gs = (t - 2.5) / 1.0;
    if (gs > 0 && gs < 1) {
      const swell = Math.sin(gs * Math.PI);
      keyLight.position.set(-2.8 + gs * 5.6, 1.4, 2.4);
      keyLight.intensity = 1.1 + swell * 2.6;
      glint = swell * 0.8;
    } else {
      keyLight.position.set(1.6, 1.8, 2.4);
    }
    rig.setFaceLight(face, glint);

    motes.rotation.z = t * 0.05;

    const arrive = easeOutCubic(clamp01(t / T_APPROACH));
    const push = clamp01((t - T_PUSH) / (INTRO_SECONDS - T_PUSH));
    halo.style.opacity = String((0.12 + 0.88 * arrive) * (1 - 0.5 * push));
    halo.style.transform = `translateY(${(-drop * 50).toFixed(2)}%) scale(${(1 + 1.6 * push).toFixed(3)})`;

    const fadeOut = t < T_FADE ? 1 : 1 - smooth(clamp01((t - T_FADE) / (INTRO_SECONDS - T_FADE)));
    container.style.opacity = String(fadeOut * fade);

    renderer.render(scene, camera);
  }

  let raf = 0;
  let playing = false;
  let skipAt = null;
  function play(onDone) {
    playing = true;
    let t0 = null;
    const loop = (now) => {
      if (!playing) return;
      if (t0 === null) t0 = now;
      const t = Math.min(INTRO_SECONDS, (now - t0) / 1000);
      const fade = skipAt === null ? 1 : 1 - clamp01((now - skipAt) / (SKIP_SECONDS * 1000));
      update(t, fade);
      if (t >= INTRO_SECONDS || fade <= 0) { playing = false; onDone?.(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return {
    ready: rig.ready,
    update,
    play,
    skip() { if (skipAt === null) skipAt = performance.now(); },
    dispose() {
      playing = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      rig.dispose();
      moteGeo.dispose(); moteMat.dispose(); moteSprite.dispose();
      renderer.dispose();
      /* Hand the GL context back now — the launch stage is about to ask for
         its own, and browsers cap how many can be live at once. */
      renderer.forceContextLoss();
      halo.remove(); canvas.remove(); vignette.remove();
    },
  };
}
