import * as THREE from "three";

/* The macro coin.

   Two things here are load-bearing and easy to undo by accident:

   1. THE FLIP IS ON A PIVOT, NOT ON THE MESH. The mesh is tipped to face the
      camera with rotation.x = PI/2 and parented to a Group; the Group's Y axis
      does the turning. That is a true backside-to-frontside flip showing the
      coin's real thickness. Baking the tip into the geometry and spinning the
      mesh's own Y gives an in-plane wheel spin — wrong — and rotates the cap
      texture 90 degrees as a bonus.

   2. THE ENVIRONMENT IS THE LIGHTING. Pure metal has no colour of its own; it
      is only what it reflects. The warm arc spans +/-115 degrees of azimuth
      because a flat face's reflection swings at TWICE the face's rotation
      angle — for the face to stay lit until it genuinely turns edge-on at
      ~+/-57 degrees, the arc must be double that. Build it at +/-60 and the
      coin goes dark at +/-30, which reads as broken. */

const FACE_FRONT = "/assets/coin-front.webp";
const FACE_BACK = "/assets/coin-back.webp";

/* Face brightness as a function of the coin's own rotation. */
const SHADOW_FLOOR = 0.14;   // at profile — deep shadow, never pure black
const FLASH_GAIN = 1.45;     // peak overdrive, face-on

/* The idle glint: a grazing streak that rakes across the face. */
const GLINT_PERIOD = 4.2;    // seconds between sweeps
const GLINT_DUTY = 0.30;     // fraction of the period the streak is travelling
const IDLE_REV_SECONDS = 7;  // one revolution per 7s when untouched
const USER_PAUSE_MS = 1600;  // idle sweep stays out of the way this long

/* The pointer's normalised position drives a parallax lean. The brief's value
   is +/-1 on each axis; that is the RANGE of the input, scaled here into a
   rotation that reads as a micro-tilt rather than a tumble. Raise this if you
   want the lean more pronounced. */
const TILT_RADIANS = 0.16;

export function createCoinScene(container, { isSmall = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;   // no WebGL — the caller falls back to the CSS coin
  }

  const canvas = renderer.domElement;
  /* touch-action: pan-y, NOT none. The coin turns on a horizontal drag, so the
     browser keeps vertical swipes for scrolling — with `none` the canvas covers
     the whole pinned stage and a phone user cannot scroll past it. */
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline:none;";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "button");
  canvas.setAttribute(
    "aria-label",
    "The Normalize coin. Drag to turn it, or press the left and right arrow keys. Press Enter to flip it over."
  );
  container.appendChild(canvas);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 40);

  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  const hq = (t) => {
    t.anisotropy = MAX_ANISO;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  };

  /* ---- Studio environment, PMREM-filtered ---------------------------------
     A raw CanvasTexture as scene.environment is sampled without the roughness
     convolution, so rough metal reflects a hard-edged photograph of the canvas.
     PMREM pre-filters it into the mip chain three actually wants.

     Layout in equirect u (three maps u = atan2(z, x) / 2PI + 0.5):
       u 0.50 -> +X, camera's right
       u 0.25 -> -Z, behind the coin
       u 0.75 -> +Z, behind the CAMERA — what a face reflects head-on          */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envSource = (() => {
    const W = 1024, H = 512;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");

    // Ground: deep charcoal to black, with a warm floor bounce.
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#3a2f17");
    g.addColorStop(0.30, "#141008");
    g.addColorStop(0.55, "#050403");
    g.addColorStop(0.82, "#241a0b");
    g.addColorStop(1, "#0a0704");
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    /* The warm face-fill arc: +/-115 degrees of azimuth centred behind the
       camera (u 0.75), drawn with a horizontal falloff and a hot core so its
       edges do not stamp a hard line across the face as the coin turns. */
    const centre = 0.75 * W;
    const half = (115 / 360) * W;
    const arc = x.createLinearGradient(centre - half, 0, centre + half, 0);
    arc.addColorStop(0.00, "rgba(238,200,126,0)");
    arc.addColorStop(0.18, "rgba(238,200,126,0.30)");
    arc.addColorStop(0.44, "rgba(238,200,126,0.72)");
    arc.addColorStop(0.50, "rgba(255,238,190,0.95)");   // hot core, dead centre
    arc.addColorStop(0.56, "rgba(238,200,126,0.72)");
    arc.addColorStop(0.82, "rgba(238,200,126,0.30)");
    arc.addColorStop(1.00, "rgba(238,200,126,0)");
    x.save();
    x.globalCompositeOperation = "screen";
    x.fillStyle = arc;
    x.fillRect(centre - half, H * 0.14, half * 2, H * 0.60);
    x.translate(-W, 0);                       // the arc wraps past u=1
    x.fillRect(centre - half, H * 0.14, half * 2, H * 0.60);
    x.restore();

    /* Blazing softboxes — the hard speculars that streak across the gold. */
    const box = (px, py, pw, ph, colour, blur) => {
      x.save();
      x.globalCompositeOperation = "screen";
      x.filter = `blur(${blur}px)`;
      x.fillStyle = colour;
      x.fillRect(px, py, pw, ph);
      x.restore();
    };
    box(W * 0.30, H * 0.08, 430, 70, "#ffffff", 3);      // main overhead strip
    box(W * 0.30, H * 0.08, 430, 70, "#ffffff", 22);     // its bloom
    box(W * 0.07, H * 0.24, 90, 200, "#fff6e0", 18);     // tall side key
    box(W * 0.56, H * 0.30, 120, 90, "#ffe9b0", 26);     // warm kicker
    box(W * 0.34, H * 0.74, 260, 40, "#c99b3f", 14);     // low gold floor bounce

    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const envRT = pmrem.fromEquirectangular(envSource);
  scene.environment = envRT.texture;
  envSource.dispose();
  pmrem.dispose();

  /* ---- Lights ---- */
  const keyLight = new THREE.DirectionalLight(0xfff6dd, 1.1);
  keyLight.position.set(1.6, 1.8, 2.4);
  scene.add(keyLight);
  scene.add(new THREE.AmbientLight(0xfdf6e6, 0.34));
  /* Grazing rake, almost parallel to the face — catches the milled ridges and
     the stamped relief. Held CONSTANT: if the rim darkens with the faces the
     whole effect collapses into a crossfade. */
  const rakeLight = new THREE.DirectionalLight(0xffe9b8, 0.5);
  rakeLight.position.set(-2.6, 0.5, 0.35);
  scene.add(rakeLight);

  /* ---- Procedural maps ---- */
  const makeRimStripes = (crest, valley) => {
    const W = 4096;
    const c = document.createElement("canvas");
    c.width = W; c.height = 128;
    const x = c.getContext("2d");
    for (let i = 0; i < W; i += 16) {
      const g = x.createLinearGradient(i, 0, i + 16, 0);
      g.addColorStop(0, valley); g.addColorStop(0.5, crest); g.addColorStop(1, valley);
      x.fillStyle = g; x.fillRect(i, 0, 16, 128);
    }
    const t = hq(new THREE.CanvasTexture(c));
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const rimBump = makeRimStripes("#ffffff", "#1c1c1c");
  const rimRough = makeRimStripes("#3a3a3a", "#e0e0e0");

  const grainRough = (() => {
    const S = 256;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const x = c.getContext("2d");
    const img = x.createImageData(S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = hq(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  })();

  /* Brushed metal: faint horizontal lathe strokes that break the mirror
     organically — forged metal rather than a digital vector. */
  const brushNormal = (() => {
    const S = 512;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const x = c.getContext("2d");
    const img = x.createImageData(S, S);
    for (let row = 0; row < S; row++) {
      let v = 0;
      for (let col = 0; col < S; col++) {
        v = v * 0.92 + (Math.random() - 0.5) * 2.4;   // low-pass walk = streaks
        const i = (row * S + col) * 4;
        img.data[i] = 128 + Math.max(-14, Math.min(14, v * 3));
        img.data[i + 1] = 128 + (Math.random() - 0.5) * 4;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const t = hq(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  })();

  /* ---- Face artwork ----
     Composited onto solid metal so the caps read as gold even where the
     artwork is transparent. */
  const FACE_PX = isSmall ? 2048 : 4096;
  function loadFace(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = FACE_PX;
        const x = c.getContext("2d");
        x.imageSmoothingQuality = "high";
        const ground = x.createRadialGradient(
          FACE_PX / 2, FACE_PX * 0.42, FACE_PX * 0.06,
          FACE_PX / 2, FACE_PX / 2, FACE_PX * 0.62
        );
        ground.addColorStop(0, "#d9c489");
        ground.addColorStop(0.55, "#b1904f");
        ground.addColorStop(1, "#8a6a2b");
        x.fillStyle = ground; x.fillRect(0, 0, FACE_PX, FACE_PX);
        // Sub-pixel blur while upscaling acts as a high-sample resample, so the
        // artwork's staircase edges stay smooth at macro magnification.
        x.filter = `blur(${FACE_PX / 2048}px)`;
        x.drawImage(img, 0, 0, FACE_PX, FACE_PX);
        x.filter = "none";
        const map = hq(new THREE.CanvasTexture(c));
        map.colorSpace = THREE.SRGBColorSpace;

        // Relief: strongly blurred so the emboss reads as softly struck metal.
        const bc = document.createElement("canvas");
        bc.width = bc.height = 1024;
        const bx = bc.getContext("2d");
        bx.imageSmoothingQuality = "high";
        bx.fillStyle = "#b0b0b0"; bx.fillRect(0, 0, 1024, 1024);
        bx.filter = "blur(4px)";
        bx.drawImage(img, 0, 0, 1024, 1024);
        bx.filter = "none";

        const bump = hq(new THREE.CanvasTexture(bc));

        /* The cylinder's cap UVs are radial, so artwork applied to them lands
           rotated 90 degrees. Correcting it on the texture keeps the geometry
           honest — and both maps must get the same correction or the relief
           will not line up with the artwork it is supposed to emboss. */
        for (const t of [map, bump]) {
          t.center.set(0.5, 0.5);
          t.rotation = Math.PI / 2;
        }
        resolve({ map, bump });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /* ---- The coin ------------------------------------------------------------
     scene -> tiltGroup (pointer parallax) -> pivot (THE FLIP) -> mesh (tipped)
     Keeping the flip on its own node means `pivot.rotation.y` is pure rotation,
     which is what the brightness curve below reads.                           */
  const tiltGroup = new THREE.Group();
  const pivot = new THREE.Group();
  tiltGroup.add(pivot);
  scene.add(tiltGroup);

  const BASE_ENV_RIM = 1.35;
  const BASE_ENV_FACE = 1.30;

  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xcaa649,
    metalness: 1.0,
    roughness: 0.18,
    envMapIntensity: BASE_ENV_RIM,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    bumpMap: rimBump, bumpScale: 0.07,
    roughnessMap: rimRough,
    normalMap: brushNormal,
    normalScale: new THREE.Vector2(0.14, 0.14),
  });
  rimBump.repeat.set(1, 1);
  rimRough.repeat.set(1, 1);

  const makeFaceMaterial = () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1.0,
    roughness: 0.22,
    envMapIntensity: BASE_ENV_FACE,
    clearcoat: 0.50,
    clearcoatRoughness: 0.30,
    roughnessMap: grainRough,
    normalMap: brushNormal,
    normalScale: new THREE.Vector2(0.18, 0.18),
  });
  const frontMaterial = makeFaceMaterial();
  const backMaterial = makeFaceMaterial();

  /* CylinderGeometry groups are [side, top, bottom] — so [rim, front, back]. */
  const geometry = new THREE.CylinderGeometry(1, 1, 0.11, isSmall ? 120 : 200);
  const coinMesh = new THREE.Mesh(geometry, [rimMaterial, frontMaterial, backMaterial]);
  coinMesh.rotation.x = Math.PI / 2;   // tip it to face the camera
  pivot.add(coinMesh);

  Promise.all([loadFace(FACE_FRONT), loadFace(FACE_BACK)])
    .then(([front, back]) => {
      frontMaterial.map = front.map;
      frontMaterial.bumpMap = front.bump;
      frontMaterial.bumpScale = -0.008;
      frontMaterial.needsUpdate = true;
      backMaterial.map = back.map;
      backMaterial.bumpMap = back.bump;
      backMaterial.bumpScale = -0.008;
      backMaterial.needsUpdate = true;
    })
    .catch(() => { /* artwork missing — the coin still renders as blank gold */ });

  /* ---- State ---- */
  const spin = {
    flip: 0, vel: 0, dragging: false, lastX: 0, lastT: 0,
    target: null, downT: 0, travel: 0,
  };
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };     // current and target, -1..1
  const sheen = { t: 0, lastUser: -1e9 };

  function flipOver() {
    const half = Math.round(spin.flip / Math.PI);
    spin.target = (half + 1) * Math.PI;
    spin.vel = 0;
    sheen.lastUser = performance.now();
  }

  /* One pointer position drives the 3D key light and the coin's parallax lean.
     The stage drives the other three things (lens window, light pool, idle
     pause) from the same call site — see LaunchCanvas. */
  function setPointer(nx, ny) {
    tilt.tx = nx;
    tilt.ty = ny;
    keyLight.position.set(nx * 2, -ny * 1.5 + 1.4, 2.4);
    sheen.lastUser = performance.now();
  }

  function onPointerDown(e) {
    spin.dragging = true;
    spin.lastX = e.clientX;
    spin.lastT = performance.now();
    spin.downT = spin.lastT;
    spin.travel = 0;
    spin.vel = 0;
    spin.target = null;
    canvas.style.cursor = "grabbing";
    try { canvas.setPointerCapture(e.pointerId); } catch { /* no capture */ }
  }
  function onPointerMove(e) {
    if (!spin.dragging) return;
    const now = performance.now();
    const dx = e.clientX - spin.lastX;
    const dt = Math.max(8, now - spin.lastT);
    spin.travel += Math.abs(dx);
    spin.flip += dx * 0.011;
    spin.vel = (dx * 0.011) / (dt / 1000);       // carry the throw
    spin.lastX = e.clientX;
    spin.lastT = now;
    sheen.lastUser = now;
  }
  function onPointerUp(e) {
    if (!spin.dragging) return;
    spin.dragging = false;
    canvas.style.cursor = "grab";
    /* Decided BEFORE releasing capture: releasePointerCapture throws when the
       pointer was never captured, and a throw here would swallow the tap. */
    if (spin.travel < 5 && performance.now() - spin.downT < 350) flipOver();
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* never held */ }
  }
  function onKeyDown(e) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      spin.target = null;
      spin.vel += e.key === "ArrowRight" ? 2.4 : -2.4;
      sheen.lastUser = performance.now();
      e.preventDefault();
    } else if (e.key === "Enter" || e.key === " ") {
      flipOver();
      e.preventDefault();
    }
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  function addSpin(v) {
    if (spin.dragging || spin.target !== null) return;   // don't fight the user
    spin.vel += v;
    sheen.lastUser = performance.now();
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    /* Aspect-fitted so the whole coin is in frame from the first paint — there
       is no zoom-in journey to cover a bad opening shot. */
    camera.position.z = Math.max(6, 3.9 / aspect) * (isSmall ? 1.35 : 1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  resize();

  let frame = 0;
  let running = true;
  const clock = new THREE.Clock();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function tick() {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta());
    const now = performance.now();

    /* ---- Rotation ---- */
    if (spin.dragging) {
      // The hand is on it; nothing else moves it.
    } else if (spin.target !== null) {
      const remaining = spin.target - spin.flip;
      spin.flip += remaining * Math.min(1, dt * 7);
      if (Math.abs(remaining) < 0.004) { spin.flip = spin.target; spin.target = null; }
    } else {
      spin.vel *= Math.pow(0.25, dt);
      if (Math.abs(spin.vel) < 0.02) spin.vel = 0;
      const idle = reduced ? 0 : (Math.PI * 2) / IDLE_REV_SECONDS;
      spin.flip += (spin.vel + idle) * dt;
    }
    pivot.rotation.y = spin.flip;
    pivot.rotation.x = 0;
    pivot.rotation.z = 0;     // pinned. The coin flips on Y, never Z.

    /* ---- Pointer parallax, on its own node so the flip stays pure ---- */
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 6);
    tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 6);
    tiltGroup.rotation.y = tilt.x * TILT_RADIANS;
    tiltGroup.rotation.x = tilt.y * TILT_RADIANS;

    /* ---- The idle glint ----
       A grazing streak rakes across the face, then the key drifts slowly
       between sweeps. Any pointer input takes over instantly and the sweep
       stays out of the way for USER_PAUSE_MS. */
    let glint = 0;
    const quiet = now - sheen.lastUser > USER_PAUSE_MS;
    if (quiet && !reduced) {
      sheen.t += dt;
      const p = (sheen.t % GLINT_PERIOD) / GLINT_PERIOD;
      if (p < GLINT_DUTY) {
        const s = p / GLINT_DUTY;                  // 0..1 across the streak
        const swell = Math.sin(s * Math.PI);       // in and out
        keyLight.position.x = -2.8 + s * 5.6;
        keyLight.position.y = 1.4;
        keyLight.intensity = 1.1 + swell * 2.6;    // 1.1 -> 3.7
        glint = swell * 0.8;                       // env reflection boost
      } else {
        const d = (p - GLINT_DUTY) / (1 - GLINT_DUTY);
        keyLight.position.x = Math.sin(d * Math.PI * 2) * 1.8;
        keyLight.position.y = 1.4;
      }
    }

    /* ---- Face brightness follows the coin's own rotation ----
       Blinding flash face-on, deep shadow at profile, and the RIM is left
       alone so the milled edge keeps its shine right through the turn. */
    const face = Math.abs(Math.cos(pivot.rotation.y)) ** 3;
    const env = BASE_ENV_FACE * (SHADOW_FLOOR + FLASH_GAIN * face) + glint;
    frontMaterial.envMapIntensity = env;
    backMaterial.envMapIntensity = env;
    if (!quiet || reduced) keyLight.intensity = 1.1 * (0.35 + 0.65 * face);

    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  if (import.meta.env?.DEV) {
    canvas.__probe = { pivot, tiltGroup, rimMaterial, frontMaterial, backMaterial, keyLight, spin,
      step(rad){ spin.flip = rad; }, tickOnce(){ running = true; tick(); } };
  }

  return {
    setPointer,
    addSpin,
    resize,
    /* The stage needs the canvas to hand it into the header chassis on scroll. */
    canvas,
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      envRT.dispose();
      geometry.dispose();
      [rimMaterial, frontMaterial, backMaterial].forEach((m) => {
        m.map?.dispose(); m.bumpMap?.dispose(); m.dispose();
      });
      [rimBump, rimRough, grainRough, brushNormal].forEach((t) => t.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
