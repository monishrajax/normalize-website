import * as THREE from "three";

/* The macro coin, rendered for real rather than faked with CSS.

   Ported from the original single-file build with one necessary change: that
   code targeted three r128 and used `outputEncoding` / `THREE.sRGBEncoding`,
   both of which were REMOVED in r152. On a modern three they are silently
   undefined, which renders the gold washed-out and flat. The current
   colour-space API (`outputColorSpace` / `SRGBColorSpace`) is used throughout. */

const FACE_FRONT = "/assets/coin-front.webp";
const FACE_BACK = "/assets/coin-back.webp";

export function createCoinScene(container, { isSmall = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;   // no WebGL — the caller falls back to the CSS coin
  }

  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(canvas);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Filmic tone mapping rolls the gold's specular hot-spots into a premium
  // highlight instead of a blown-out flat yellow.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 30);
  camera.position.set(0, 0, 3.1);

  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  const hq = (t) => {
    t.anisotropy = MAX_ANISO;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  };

  /* ---- Studio environment ----
     Pure metal has no colour of its own — it is only what it reflects. Blazing
     white softbox strips over near-black falloff force the gold to flash liquid
     highlights against deep shadow, rather than the matte yellow a low-contrast
     environment produces. */
  scene.environment = (() => {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#3a2f17"); g.addColorStop(0.3, "#141008");
    g.addColorStop(0.55, "#050403"); g.addColorStop(0.82, "#241a0b");
    g.addColorStop(1, "#0a0704");
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);

    const box = (px, py, pw, ph, colour, blur) => {
      x.save(); x.filter = `blur(${blur}px)`;
      x.fillStyle = colour; x.fillRect(px, py, pw, ph); x.restore();
    };
    box(0, 120, 1024, 90, "#fffaf0", 26);      // main horizontal sweep
    box(120, 40, 260, 150, "#fff8e6", 34);     // upper-left softbox
    box(700, 250, 240, 140, "#ffe9bd", 40);    // warm fill, lower right
    box(430, 330, 180, 80, "#c9a961", 44);     // floor bounce

    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  /* ---- Lights ---- */
  const keyLight = new THREE.DirectionalLight(0xfff6dd, 1.1);
  keyLight.position.set(1.6, 1.8, 2.4);
  scene.add(keyLight);
  scene.add(new THREE.AmbientLight(0xfdf6e6, 0.34));
  // Grazing rake, almost parallel to the face — catches the milled ridges.
  const rakeLight = new THREE.DirectionalLight(0xffe9b8, 0.5);
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

  /* ---- Face artwork, composited onto solid metal so the caps read as gold.
     These are real image files now; the original had to scrape the base64 back
     out of the stylesheet to avoid duplicating ~900KB. ---- */
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
        ground.addColorStop(0, "#f2e3b2"); ground.addColorStop(0.55, "#d8ba72"); ground.addColorStop(1, "#b78f3c");
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

  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: GOLD, metalness: 1, roughness: 0.34,
    bumpMap: rimBump, bumpScale: 0.012,
    roughnessMap: rimRough,
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
        const mat = new THREE.MeshStandardMaterial({
          map: tex.map,
          metalness: 1,
          roughness: 0.3,
          roughnessMap: grainRough,
          normalMap: brushNormal,
          normalScale: new THREE.Vector2(0.35, 0.35),
          bumpMap: tex.bump,
          bumpScale: 0.006,
          envMapIntensity: 1.25,
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

  /* ---- Idle sheen + pointer tracking ---- */
  const sheen = { t: 0, lastUser: 0 };
  const tilt = { x: 0, y: 0, targetX: 0, targetY: 0 };

  function setPointer(nx, ny) {
    // nx, ny are -1..1 across the stage.
    tilt.targetY = nx * 0.22;
    tilt.targetX = ny * 0.16;
    keyLight.position.set(1.6 + nx * 1.6, 1.8 - ny * 1.4, 2.4);
    sheen.lastUser = performance.now();
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  /* Frame the opening shot before the first render. ScrollTrigger only reports
     progress once the user scrolls, so without this the coin sits at the
     constructor's distance and overflows the viewport as a flat gold field. */
  function setProgress(p) {
    const t = Math.min(1, Math.max(0, p));
    // Ease-out so most of the travel happens early and the shot settles.
    const eased = 1 - Math.pow(1 - t, 2);
    camera.position.z = 1.7 + eased * 3.0;      // 1.04 -> 2.87 visible height
    camera.position.y = (1 - eased) * 0.34;     // drift up off the crest
    // A residual tilt at the start reads as a raking macro shot rather than a
    // flat wall; it levels out as the camera pulls back.
    coin.rotation.z = (1 - eased) * 0.16;
    camera.lookAt(0, 0, 0);
  }
  setProgress(0);

  let frame = 0;
  let running = true;
  const clock = new THREE.Clock();

  function tick() {
    if (!running) return;
    const dt = clock.getDelta();

    // While the pointer is quiet, sweep the key light on its own so the coin
    // never looks frozen.
    if (performance.now() - sheen.lastUser > 1600) {
      sheen.t += dt * 0.5;
      keyLight.position.set(Math.sin(sheen.t) * 2.2, 1.8, 2.4);
    }

    // Ease toward the target so pointer movement feels weighted, not twitchy.
    tilt.x += (tilt.targetX - tilt.x) * Math.min(1, dt * 6);
    tilt.y += (tilt.targetY - tilt.y) * Math.min(1, dt * 6);
    coin.rotation.x = tilt.x;
    coin.rotation.y = tilt.y;

    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  return {
    setPointer,
    resize,
    /* Scroll progress 0..1 drives the macro camera: it starts close enough that
       the struck relief fills the frame, then pulls back to reveal the whole
       coin. The near distance is deliberately not extreme — at the FOV above
       the visible height is 0.61 * z, so anything under ~1.6 frames a patch of
       bare metal with no engraving in it at all. */
    setProgress,
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      scene.environment?.dispose();
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
