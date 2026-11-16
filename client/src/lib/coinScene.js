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

/* Face brightness as a function of the coin's own rotation.

   Not a plain cosine power. |cos|³ starts dimming the moment the face leaves
   the axis — 0.83 at 20°, 0.65 at 30°, 0.35 at 45° — which read as the coin
   going dark too early in a turn. This HOLDS full brightness until the face
   is about 42° off axis, then falls through a smoothstep to the floor by
   about 83°, so the flash lingers through the first half of the turn and the
   shadow still arrives at the profile. */
const SHADOW_FLOOR = 0.14;   // at profile — deep shadow, never pure black
const FLASH_GAIN = 1.45;     // peak overdrive, face-on
const HOLD_COS = 0.74;       // full brightness down to this |cos|  (~42° off axis)
const DARK_COS = 0.12;       // at the floor from this |cos| inward (~83°)
export function faceBrightness(rotY) {
  const c = Math.abs(Math.cos(rotY));
  const t = Math.min(1, Math.max(0, (c - DARK_COS) / (HOLD_COS - DARK_COS)));
  return t * t * (3 - 2 * t);
}

/* The coin itself — geometry, metal, artwork, studio environment and lights —
   with no opinion about how it is framed or driven. The intro builds its coin
   from this (lib/introScene.js). */
export function buildCoinRig(renderer, scene, { isSmall = false, facePx, maxAnisotropy } = {}) {
  const MAX_ANISO = Math.min(renderer.capabilities.getMaxAnisotropy(), maxAnisotropy ?? Infinity);
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
  /* The artwork files are 1024px, so anything above that is the same pixels
     resampled — the launch stage keeps its large canvas for the smooth
     magnification it wants at macro range; a caller that never magnifies
     (the intro) can ask for less and skip the cost. */
  const FACE_PX = facePx ?? (isSmall ? 2048 : 4096);
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

  const ready = Promise.all([loadFace(FACE_FRONT), loadFace(FACE_BACK)])
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

  /* Face brightness follows the coin's own rotation (see faceBrightness). The
     glint adds to it; only the two FACE materials are driven, so the milled
     rim keeps its shine right through a turn. */
  function setFaceLight(face, glint = 0) {
    const env = BASE_ENV_FACE * (SHADOW_FLOOR + FLASH_GAIN * face) + glint;
    frontMaterial.envMapIntensity = env;
    backMaterial.envMapIntensity = env;
  }

  return {
    tiltGroup, pivot, keyLight, setFaceLight, ready,
    dispose() {
      envRT.dispose();
      geometry.dispose();
      [rimMaterial, frontMaterial, backMaterial].forEach((m) => {
        m.map?.dispose(); m.bumpMap?.dispose(); m.dispose();
      });
      [rimBump, rimRough, grainRough, brushNormal].forEach((t) => t.dispose());
    },
  };
}
