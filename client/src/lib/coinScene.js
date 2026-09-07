import * as THREE from "three";

/* The macro coin, rendered for real rather than faked with CSS.

   Two things here are load-bearing and easy to undo by accident:

   1. ROTATION IS A Y-AXIS FLIP. The coin turns backside-to-frontside about its
      vertical axis, showing its milled thickness as it passes profile. It is
      never a Z-axis wheel spin — `coin.rotation.z` is pinned to 0 and nothing
      is allowed to write to it.

   2. THE ENVIRONMENT IS THE LIGHTING. Pure metal has no colour of its own; it
      is only what it reflects. The gold arc behind the camera is deliberately
      ±115°, because a flat face's reflection sweeps at TWICE the face's own
      rotation angle — to keep the face lit across ±57° of flip you must light
      double that window.

   Colour-space note: this targets the modern three API (`outputColorSpace` /
   `SRGBColorSpace`). The r128-era `outputEncoding` / `sRGBEncoding` were
   removed in r152 and are silently undefined on a current three, which renders
   the gold washed-out and flat. */

const FACE_FRONT = "/assets/coin-front.webp";
const FACE_BACK = "/assets/coin-back.webp";

/* The coin plus air, in world units: the framing is solved from this so the
   whole coin is visible on any aspect ratio from the first frame — there is no
   zoom-in journey to hide a bad opening shot, and the margin gives the branches
   dark ground to grow into.

   LaunchCanvas needs the same number to place the branch anchors on the rim and
   to size the header dock, so it owns the value and passes it in. Exporting it
   instead would drag three.js into the main bundle. */
const DEFAULT_FRAME_EXTENT = 3.6;

export function createCoinScene(container, { isSmall = false, frameExtent = DEFAULT_FRAME_EXTENT } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;   // no WebGL — the caller falls back to the CSS coin
  }

  const canvas = renderer.domElement;
  /* touch-action: pan-y, NOT none. The coin flips on a horizontal drag, so the
     browser keeps vertical swipes for scrolling — with `none` the canvas covers
     the whole pinned stage and a phone user cannot scroll past the launch
     section at all. */
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline:none;";
  /* The coin is a real control, so it takes a tab stop and answers the keyboard.
     Without this it is unreachable for anyone not using a mouse. */
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "button");
  canvas.setAttribute(
    "aria-label",
    "The Normalize coin. Drag to turn it, or press the left and right arrow keys. Press Enter to flip it over."
  );
  container.appendChild(canvas);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Filmic tone mapping rolls the gold's specular hot-spots into a premium
  // highlight instead of a blown-out flat yellow.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  const FOV = 34;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 30);
  camera.position.set(0, 0, 4.4);

  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  const hq = (t) => {
    t.anisotropy = MAX_ANISO;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  };

  /* ---- Studio environment, through PMREM ------------------------------------
     A raw CanvasTexture as scene.environment is sampled without the roughness
     convolution, so a rough metal reflects a hard-edged photograph of the
     canvas. PMREMGenerator pre-filters it into the mip chain three actually
     wants, which is what makes the clearcoat read as lacquer over metal rather
     than a sticker.

     Layout, in equirect u (three maps u = atan2(z, x) / 2π + 0.5):
       u 0.50 → +X, camera's right
       u 0.25 → −Z, straight ahead, BEHIND the coin
       u 0.75 → +Z, behind the CAMERA — this is what a face reflects head-on
     so the warm gold arc is centred on 0.75 and spans ±115°.               */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envSource = (() => {
    const W = 2048, H = 1024;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");

    // The void. Near-black, with the faintest warm lift off the floor so the
    // coin's lower half is not pure dead shadow.
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#07060a");
    g.addColorStop(0.46, "#040305");
    g.addColorStop(0.78, "#0d0a06");
    g.addColorStop(1, "#171008");
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    /* The gold arc. Centred behind the camera and 230° wide, drawn with a
       horizontal falloff so its edges do not stamp a hard line across the
       face as the coin flips through them. */
    const arcCentre = 0.75 * W;
    const arcHalf = (115 / 360) * W;
    const arc = x.createLinearGradient(arcCentre - arcHalf, 0, arcCentre + arcHalf, 0);
    arc.addColorStop(0, "rgba(90, 62, 18, 0)");
    arc.addColorStop(0.30, "rgba(150, 108, 38, 0.20)");
    arc.addColorStop(0.46, "rgba(214, 166, 74, 0.52)");
    arc.addColorStop(0.5, "rgba(255, 231, 170, 0.85)");
    arc.addColorStop(0.54, "rgba(214, 166, 74, 0.52)");
    arc.addColorStop(0.70, "rgba(150, 108, 38, 0.20)");
    arc.addColorStop(1, "rgba(90, 62, 18, 0)");
    x.save();
    x.globalCompositeOperation = "screen";
    x.fillStyle = arc;
    x.fillRect(arcCentre - arcHalf, H * 0.16, arcHalf * 2, H * 0.56);
    // The arc wraps past u=1; draw the overflow again at the left edge.
    x.translate(-W, 0);
    x.fillRect(arcCentre - arcHalf, H * 0.16, arcHalf * 2, H * 0.56);
    x.restore();

    /* White softboxes. These are the hard speculars — the things that streak
       across the gold as it turns. Blur is what makes them read as fabric
       diffusers rather than rectangles. */
    const box = (px, py, pw, ph, colour, blur) => {
      x.save();
      x.globalCompositeOperation = "screen";
      x.filter = `blur(${blur}px)`;
      x.fillStyle = colour;
      x.fillRect(px, py, pw, ph);
      x.restore();
    };
    box(W * 0.62, H * 0.05, W * 0.17, H * 0.17, "#ffffff", 34);   // key, upper
    box(W * 0.09, H * 0.22, W * 0.09, H * 0.32, "#fff6e4", 40);   // left rake
    box(W * 0.40, H * 0.28, W * 0.05, H * 0.26, "#ffffff", 26);   // narrow kicker
    box(W * 0.86, H * 0.60, W * 0.13, H * 0.11, "#ffe4b0", 52);   // warm floor bounce

    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const envRT = pmrem.fromEquirectangular(envSource);
  scene.environment = envRT.texture;
  envSource.dispose();
  pmrem.dispose();

  /* ---- Lights ----
     The environment does the heavy lifting; these only shape it. */
  const keyLight = new THREE.DirectionalLight(0xfff6dd, 1.05);
  keyLight.position.set(1.6, 1.8, 2.4);
  scene.add(keyLight);
  scene.add(new THREE.AmbientLight(0xfdf6e6, 0.22));
  // Grazing rake, almost parallel to the face — catches the milled ridges and
  // keeps the rim lit even when the faces are edge-on and dark.
  const rakeLight = new THREE.DirectionalLight(0xffe9b8, 0.62);
  rakeLight.position.set(-2.6, 0.5, 0.35);
  scene.add(rakeLight);

  /* ---- Milled rim: ridge stripes used as BOTH bump (groove depth) and
     roughness (shiny crests, matte valleys). ---- */
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

  /* ---- Fine metallic grain: micro-variation so the gold isn't plastic-flat. */
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

  /* ---- Brushed-metal normal: faint lathe strokes that break the mirror
     reflections organically — forged metal rather than a digital vector. */
  const brushNormal = (() => {
    const S = 512;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const x = c.getContext("2d");
    const img = x.createImageData(S, S);
    for (let row = 0; row < S; row++) {
      let v = 0;
      for (let col = 0; col < S; col++) {
        // Low-pass random walk along the row = long fine streaks.
        v = v * 0.92 + (Math.random() - 0.5) * 2.4;
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

  /* ---- Face artwork, composited onto solid metal so the caps read as gold. */
  const FACE = isSmall ? 2048 : 4096;
  function loadFace(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = FACE;
        const x = c.getContext("2d");
        x.imageSmoothingQuality = "high";
        const ground = x.createRadialGradient(FACE / 2, FACE * 0.42, FACE * 0.06, FACE / 2, FACE / 2, FACE * 0.62);
        ground.addColorStop(0, "#d9c489"); ground.addColorStop(0.55, "#b1904f"); ground.addColorStop(1, "#8a6a2b");
        x.fillStyle = ground; x.fillRect(0, 0, FACE, FACE);
        // A sub-pixel blur while upscaling acts as a high-sample resample, so
        // the artwork's staircase edges become smooth at macro magnification.
        x.filter = `blur(${FACE / 2048}px)`;
        x.drawImage(img, 0, 0, FACE, FACE);
        x.filter = "none";
        const map = hq(new THREE.CanvasTexture(c));
        map.colorSpace = THREE.SRGBColorSpace;

        // Relief map: strongly blurred so the emboss reads as softly struck
        // metal. A sharp bump amplifies the source art's pixel edges into
        // jagged letter outlines.
        const bc = document.createElement("canvas");
        bc.width = bc.height = 1024;
        const bx = bc.getContext("2d");
        bx.imageSmoothingQuality = "high";
        bx.fillStyle = "#b0b0b0"; bx.fillRect(0, 0, 1024, 1024);
        bx.filter = "blur(4px)";
        bx.drawImage(img, 0, 0, 1024, 1024);
        bx.filter = "none";
        resolve({ map, bump: hq(new THREE.CanvasTexture(bc)) });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  const GOLD = 0xd9b45a;
  const coin = new THREE.Group();
  scene.add(coin);

  /* Base env intensities, before the rotation curve is applied each frame. */
  const EDGE_ENV_BASE = 1.15;
  const FACE_ENV_BASE = 1.0;

  const edgeMaterial = new THREE.MeshPhysicalMaterial({
    color: GOLD,
    metalness: 1,
    roughness: 0.22,
    bumpMap: rimBump, bumpScale: 0.012,
    roughnessMap: rimRough,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    envMapIntensity: EDGE_ENV_BASE,
  });
  rimBump.repeat.set(1, 1);
  rimRough.repeat.set(1, 1);

  // A cylinder: caps carry the struck artwork, the side carries the milled rim.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.11, 256, 1, false),
    edgeMaterial
  );
  body.rotation.x = Math.PI / 2;   // stand it up to face the camera
  coin.add(body);

  const faceMeshes = [];
  const faceGeo = new THREE.CircleGeometry(1, 256);
  Promise.all([loadFace(FACE_FRONT), loadFace(FACE_BACK)])
    .then(([front, back]) => {
      [front, back].forEach((tex, i) => {
        const mat = new THREE.MeshPhysicalMaterial({
          map: tex.map,
          metalness: 1,
          // The brief's window: .18–.22. Low enough to throw a real specular,
          // high enough that the brushed grain still reads.
          roughness: 0.19,
          roughnessMap: grainRough,
          normalMap: brushNormal,
          normalScale: new THREE.Vector2(0.35, 0.35),
          bumpMap: tex.bump,
          bumpScale: 0.006,
          // Lacquer over struck metal — this is what separates the highlight
          // from the body colour instead of blowing them out together.
          clearcoat: 0.72,
          clearcoatRoughness: 0.16,
          envMapIntensity: FACE_ENV_BASE,
        });
        const mesh = new THREE.Mesh(faceGeo, mat);
        // Sit each face just proud of its cap so it never z-fights the body.
        mesh.position.z = i === 0 ? 0.0551 : -0.0551;
        if (i === 1) mesh.rotation.y = Math.PI;
        coin.add(mesh);
        faceMeshes.push(mesh);
      });
    })
    .catch(() => { /* artwork missing — the coin still renders as blank gold */ });

  /* ---- Rotation state -------------------------------------------------------
     `flip` is the Y-axis angle and the only thing that turns the coin. `tiltX`
     is a small pointer-follow lean, kept off the Y axis so it can never be
     mistaken for the flip. Z is untouched, always, by anything.              */
  const spin = {
    flip: 0, vel: 0, dragging: false, lastX: 0, lastT: 0, idle: 0.28,
    // When set, the coin is easing to a specific angle (a tap or Enter turning
    // it to its other face) and neither idle drift nor momentum applies.
    target: null,
    // Distinguishing a tap from a drag needs the distance travelled, not just
    // the final position — a slow drag that returns to its origin is not a tap.
    downX: 0, downT: 0, travel: 0,
  };
  const tilt = { x: 0, targetX: 0 };
  const sheen = { t: 0, lastUser: 0 };

  function setPointer(nx, ny) {
    // nx, ny are -1..1 across the stage.
    tilt.targetX = ny * 0.15;
    keyLight.position.set(1.6 + nx * 1.6, 1.8 - ny * 1.4, 2.4);
    sheen.lastUser = performance.now();
  }

  /* A tap turns the coin to whichever face is not showing. Snapping to the
     nearest multiple of PI from the current angle keeps it honest however many
     times it has been spun. */
  function flipOver() {
    const half = Math.round(spin.flip / Math.PI);
    spin.target = (half + 1) * Math.PI;
    spin.vel = 0;
    sheen.lastUser = performance.now();
  }

  /* ---- Drag to flip, from the very first frame ---- */
  function onPointerDown(e) {
    spin.dragging = true;
    spin.lastX = e.clientX;
    spin.downX = e.clientX;
    spin.lastT = performance.now();
    spin.downT = spin.lastT;
    spin.travel = 0;
    spin.vel = 0;
    spin.target = null;          // a grab cancels an in-flight flip
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!spin.dragging) return;
    const now = performance.now();
    const dx = e.clientX - spin.lastX;
    const dt = Math.max(8, now - spin.lastT);
    spin.travel += Math.abs(dx);
    spin.flip += dx * 0.011;
    // Remember the throw so releasing mid-drag carries momentum.
    spin.vel = (dx * 0.011) / (dt / 1000);
    spin.lastX = e.clientX;
    spin.lastT = now;
    sheen.lastUser = now;
  }
  function onPointerUp(e) {
    if (!spin.dragging) return;
    spin.dragging = false;
    canvas.style.cursor = "grab";
    canvas.releasePointerCapture?.(e.pointerId);
    // A press that went nowhere is a tap: show the other face.
    if (spin.travel < 5 && performance.now() - spin.downT < 350) flipOver();
  }

  /* Keyboard: the arrows nudge it round, Enter/Space turns it over. */
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
  canvas.__spin = spin; // TEMP PROBE
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  /* Scroll velocity feeds the flip, so the toss into the header carries real
     spin rather than a canned tumble. */
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
    /* Solve the distance so the whole coin fits on BOTH axes. On a narrow
       phone the limit is width, on a wide desktop it is height; framing from
       whichever is tighter is what lets the coin open full-size with no
       zoom-in journey to cover a bad first frame. */
    const visibleH = frameExtent * Math.max(1, 1 / aspect);
    camera.position.z = visibleH / (2 * Math.tan((FOV * Math.PI) / 360));
    camera.updateProjectionMatrix();
  }
  resize();

  let frame = 0;
  let running = true;
  const clock = new THREE.Clock();

  function tick() {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta());

    // While the pointer is quiet, sweep the key light on its own so the coin
    // never looks frozen.
    if (performance.now() - sheen.lastUser > 1600) {
      sheen.t += dt * 0.5;
      keyLight.position.set(Math.sin(sheen.t) * 2.2, 1.8, 2.4);
    }

    if (spin.dragging) {
      // The hand is on it; nothing else gets to move it.
    } else if (spin.target !== null) {
      // Easing to a chosen face. Exponential approach so it arrives without
      // overshooting, then hands back to the idle drift.
      const remaining = spin.target - spin.flip;
      spin.flip += remaining * Math.min(1, dt * 7);
      if (Math.abs(remaining) < 0.004) {
        spin.flip = spin.target;
        spin.target = null;
      }
    } else {
      // Thrown momentum decays; underneath it a slow idle flip keeps turning,
      // which is what shows off the lighting curve below without the visitor
      // having to touch anything.
      spin.vel *= Math.pow(0.25, dt);
      if (Math.abs(spin.vel) < 0.02) spin.vel = 0;
      spin.flip += (spin.vel + spin.idle) * dt;
    }

    tilt.x += (tilt.targetX - tilt.x) * Math.min(1, dt * 6);

    coin.rotation.y = spin.flip;
    coin.rotation.x = tilt.x;
    coin.rotation.z = 0;   // pinned. The coin flips on Y, never Z.

    /* ---- Lighting linked to rotation ----
       Blinding flash face-on, deep shadow at profile, and the rim — which is
       lit by the rake rather than the arc — stays readable throughout.
       The cube of |cos| is what makes the falloff snap instead of fade. */
    const facing = Math.abs(Math.cos(spin.flip));
    const curve = 0.14 + 1.45 * facing * facing * facing;
    for (const m of faceMeshes) m.material.envMapIntensity = FACE_ENV_BASE * curve;
    // The rim reads best when it is NOT following the faces — it should hold
    // its light while they go dark, so it gets the inverse weighting.
    edgeMaterial.envMapIntensity = EDGE_ENV_BASE * (0.55 + 0.75 * (1 - facing));

    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  return {
    setPointer,
    addSpin,
    resize,
    /* The coin's on-screen diameter as a fraction of the stage's tighter axis. */
    coinDiameterRatio: 2 / frameExtent,
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      envRT.dispose();
      faceGeo.dispose();
      body.geometry.dispose();
      edgeMaterial.dispose();
      faceMeshes.forEach((m) => {
        m.material.map?.dispose();
        m.material.bumpMap?.dispose();
        m.material.dispose();
      });
      [rimBump, rimRough, grainRough, brushNormal].forEach((t) => t.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
