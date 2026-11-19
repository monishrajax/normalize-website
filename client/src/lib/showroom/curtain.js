import * as THREE from "three";

/* A velvet stage curtain that behaves like cloth rather than like a picture of it.

   THE FOLDS. A curtain has a fixed number of pleats pinned along its rail and a
   fixed width of fabric. Drawing it open changes neither; it brings the pleats
   closer together, and because cloth cannot stretch the extra length has nowhere to
   go but outward, so every fold gets deeper.

   That is modelled directly. A row of the cloth is a curve whose direction at each
   point of the fabric is an angle theta(s), s being the distance along the fabric:

       x(s) = integral of cos(theta)        z(s) = integral of sin(theta)

   theta is a fixed, irregular wave, scaled by one number per row, thetaM. The span
   is whatever x ends up as, so for a given span thetaM is solved, and nothing about
   the folds is animated by hand: close the curtain and they are wide and shallow,
   gather it and they stack up tight and deep. Because the folds are written in terms
   of the fabric, a fold is the same piece of cloth on every row and every frame; a
   row that is more open than its neighbour simply leans, as cloth does.

   thetaM is capped just below 130 degrees. A wave built this way first folds back
   on itself and passes through itself at about 130.7 degrees, which is also roughly
   how tightly real cloth stacks before its own thickness stops it.

   Two different wave profiles are blended down the drop, so a fold near the rail is
   not the same fold at the hem: they drift, split and merge as real folds do.

   THE HANG. Every row is a mass on a spring chain hanging from the rail. The top row
   is the rail and follows the scroll exactly; the rows below follow it through the
   chain, so a quick scroll sends a wave down the fabric and the heavy hem trails,
   overshoots and settles. A breeze keeps the lower folds slowly breathing.

   THE VELVET. A physical material with sheen (the fuzz catching light at grazing
   angles) and a baked darkening in the valleys of the folds.                        */

const ROWS = 64;       // down the drop
const COLS = 288;      // along the fabric
const KEYS = 11;       // rows on which thetaM is solved exactly; the rest interpolate
const THETA_MAX = 2.2; // radians; see above

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

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

/* One fold profile: `folds` pleats of uneven width and strength, periodic over the
   fabric so that sliding it a little (the folds meander as they hang) changes nothing
   about how much cloth it holds. Sampled into a table, peak 1. */
const GN = 4096;
function buildProfile(folds, seed) {
  const rnd = mulberry32(seed);
  const warp = [1, 2, 3, 4, 6].map((m) => ({ m, c: (0.5 / m) * (0.22 + 0.30 * rnd()), p: TAU * rnd() }));
  const strength = [1, 2, 3, 5].map((m) => ({ m, c: 0.10 + 0.16 * rnd(), p: TAU * rnd() }));
  const psi = (u) => {
    let s = folds * u;
    for (const h of warp) s += h.c * Math.sin(TAU * h.m * u + h.p);
    return s;
  };
  const amp = (u) => {
    let a = 1;
    for (const h of strength) a += h.c * Math.sin(TAU * h.m * u + h.p);
    return a;
  };
  // rounded crests, a slightly pinched valley — what cloth does against a pleat
  const raw = (u) => {
    const t = TAU * psi(u);
    return amp(u) * (Math.sin(t) + 0.12 * Math.sin(2 * t + 0.9));
  };
  let peak = 0;
  for (let i = 0; i < GN; i++) peak = Math.max(peak, Math.abs(raw(i / GN)));
  const table = new Float64Array(GN + 1);
  for (let i = 0; i <= GN; i++) table[i] = raw(i / GN) / peak;
  return table;
}

const sample = (table, u) => {
  u -= Math.floor(u);
  const f = u * GN, i = f | 0, t = f - i;
  return table[i] * (1 - t) + table[i + 1] * t;
};

/* cos and sin from tables: an angle is only ever between -THETA_MAX and THETA_MAX here, and a
   few thousand rows' worth of Math.sin per frame is the most expensive thing in this file. */
const TT = 2048;
const TRIG_RANGE = 2.4;
const cosTab = new Float64Array(TT + 2), sinTab = new Float64Array(TT + 2);
for (let i = 0; i <= TT + 1; i++) { const a = (i / TT) * 2 * TRIG_RANGE - TRIG_RANGE; cosTab[i] = Math.cos(a); sinTab[i] = Math.sin(a); }
const TRIG_SCALE = TT / (2 * TRIG_RANGE);
let trigC = 1, trigS = 0;
function trig(a) {
  const f = (a + TRIG_RANGE) * TRIG_SCALE;
  const i = f | 0, t = f - i;
  trigC = cosTab[i] + (cosTab[i + 1] - cosTab[i]) * t;
  trigS = sinTab[i] + (sinTab[i + 1] - sinTab[i]) * t;
}

export function createCurtain({ side = -1, folds = 7, fullness = 1.95, seed = 7 } = {}) {
  const profileA = buildProfile(folds, seed);
  const profileB = buildProfile(folds, seed * 31 + 5);

  // the last pleat at each end eases flat onto the rail, so two panels meet in a clean seam
  const edgeW = 0.85 / folds;
  const win = new Float64Array(COLS);
  const sigma = new Float64Array(COLS);
  for (let c = 0; c < COLS; c++) {
    sigma[c] = c / (COLS - 1);
    win[c] = smooth(0, edgeW, sigma[c]) * smooth(0, edgeW, 1 - sigma[c]);
  }

  /* ---- geometry (buffers reused every frame) ---- */
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(ROWS * COLS * 3);
  const nor = new Float32Array(ROWS * COLS * 3);
  const col = new Float32Array(ROWS * COLS * 3);
  const uv = new Float32Array(ROWS * COLS * 2);
  const depth = new Float32Array(ROWS * COLS);
  const idx = new Uint32Array((ROWS - 1) * (COLS - 1) * 6);
  let q = 0;
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1;
      // winding chosen so the front (toward +z) is the lit face for both panels
      if (side < 0) { idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e; }
      else { idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = b; idx[q++] = e; idx[q++] = d; }
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e3);   // it moves; never cull it

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x6a0610,
    roughness: 0.92,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(0xb02a3c),
    sheenRoughness: 0.5,
    vertexColors: true,
    side: THREE.DoubleSide,
    envMapIntensity: 0.35,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  /* ---- the hang: a chain of rows, top one driven ---- */
  const o = new Float64Array(ROWS);        // how open each row currently is
  const ov = new Float64Array(ROWS);       // and how fast it is changing
  let primed = false;

  // Chain constants. The explicit step is only stable while omega_max * h stays under 2,
  // with omega_max = sqrt(4 * STIFF / lightest mass); these keep it near 1 at the longest step.
  const STIFF = 9000;
  const DAMP = 6.0;
  const MAX_H = 1 / 300;

  const state = { left: 0, closedSpan: 1, openSpan: 0.2, height: 4, z0: 0, hem: 0.03 };

  function configure({ left, closedSpan, openSpan, height, z0, hem = 0.03 }) {
    Object.assign(state, { left, closedSpan, openSpan, height, z0, hem });
  }

  const shape = new Float64Array(COLS);    // theta / thetaM along one row
  const rowX = new Float64Array(COLS);
  const rowZ = new Float64Array(COLS);
  const rowTheta = new Float64Array(ROWS);
  const keyRow = Array.from({ length: KEYS }, (_, i) => Math.round((i * (ROWS - 1)) / (KEYS - 1)));
  let lastTheta = 1.3;

  /* This row's wave: both profiles at their current drift, blended, scaled so the steepest tangent is 1. */
  function buildShape(v, breeze, time) {
    const lower = v * v;
    // folds drift sideways a little down the drop, and breathe in the breeze
    const meander = 0.020 * Math.sin(v * 5.1 + 0.7) + 0.012 * Math.sin(v * 11.3 + 2.1);
    const sway = lower * breeze * (0.010 * Math.sin(time * 0.9 + v * 3.2) + 0.006 * Math.sin(time * 1.7 + v * 7.0 + 1.3));
    const phaseA = meander + sway;
    const phaseB = 0.31 + 0.6 * meander - sway * 0.7;
    // two profiles, cross-faded down the drop
    const theta = v * 1.15 + 0.35;
    const mA = Math.cos(theta), mB = Math.sin(theta);
    let peak = 1e-9;
    for (let c = 0; c < COLS; c++) {
      const w = win[c] * (mA * sample(profileA, sigma[c] + phaseA) + mB * sample(profileB, sigma[c] + phaseB));
      shape[c] = w;
      const a = w < 0 ? -w : w;
      if (a > peak) peak = a;
    }
    const inv = 1 / peak;
    for (let c = 0; c < COLS; c++) shape[c] *= inv;
  }

  /* The ground covered along x for a given steepest tangent, and how fast that falls as the
     tangent steepens (for Newton's method). Trapezoid rule over the fabric. */
  let slopeOut = 0;
  function reach(thetaM, ds) {
    let x = 0, dx = 0;
    trig(thetaM * shape[0]);
    let pc = trigC, ps = trigS * shape[0];
    for (let c = 1; c < COLS; c++) {
      trig(thetaM * shape[c]);
      const ss = trigS * shape[c];
      x += 0.5 * (pc + trigC) * ds;
      dx -= 0.5 * (ps + ss) * ds;
      pc = trigC; ps = ss;
    }
    slopeOut = dx;
    return x;
  }

  /* Advance the chain by dt and rebuild the cloth.
       open  0..1     the rail's position (scroll)
       time  seconds  for the breeze
       gust  0..1     extra stir, from the cursor                                */
  function update(open, dt, time, gust = 0) {
    if (!primed) { o.fill(open); ov.fill(0); primed = true; }

    const frame = Math.min(dt, 1 / 24);
    const steps = Math.max(1, Math.ceil(frame / MAX_H));
    const h = frame / steps;
    for (let s = 0; s < steps; s++) {
      o[0] = open; ov[0] = 0;
      for (let i = 1; i < ROWS; i++) {
        const up = o[i - 1];
        const dn = i < ROWS - 1 ? o[i + 1] : o[i];
        const heavy = 0.55 + 0.45 * (i / ROWS);               // lower rows are slower to move
        ov[i] += (STIFF * (up + dn - 2 * o[i]) / heavy - DAMP * ov[i]) * h;
      }
      for (let i = 1; i < ROWS; i++) o[i] += ov[i] * h;
    }

    const { left, closedSpan, openSpan, height, z0, hem } = state;
    const dir = -side;                                           // the panel on the left reaches right
    const fabric = closedSpan * fullness;
    const ds = fabric / (COLS - 1);
    const breeze = 0.35 + 0.65 * gust;
    const spanOf = (r) => mix(closedSpan, openSpan, clamp(o[r], -0.05, 1.05));

    /* thetaM such that a row spans exactly what it should, solved on the key rows only.
       Reach falls steadily as thetaM rises, so Newton's method, with a bracket as a safety
       net, converges in a couple of steps from the row above. */
    let guess = lastTheta;
    for (let i = 0; i < KEYS; i++) {
      const r = keyRow[i];
      buildShape(r / (ROWS - 1), breeze, time);
      const span = spanOf(r);
      let lo = 0, hi = THETA_MAX;
      let thetaM = clamp(guess, 0.02, THETA_MAX);
      if (span >= fabric) thetaM = 0;
      else {
        for (let it = 0; it < 12; it++) {
          const x = reach(thetaM, ds);
          const err = x - span;
          if (Math.abs(err) < fabric * 2e-5) break;
          if (err > 0) lo = thetaM; else hi = thetaM;       // reached too far: the folds must be steeper
          let next = thetaM - err / (slopeOut || -1e-6);
          if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
          thetaM = next;
        }
      }
      rowTheta[r] = thetaM;
      guess = thetaM > 0.05 ? thetaM : guess;
    }
    lastTheta = rowTheta[keyRow[0]] > 0.05 ? rowTheta[keyRow[0]] : lastTheta;
    for (let i = 0; i < KEYS - 1; i++) {
      const r0 = keyRow[i], r1 = keyRow[i + 1];
      for (let r = r0 + 1; r < r1; r++) rowTheta[r] = mix(rowTheta[r0], rowTheta[r1], (r - r0) / (r1 - r0));
    }

    for (let r = 0; r < ROWS; r++) {
      const v = r / (ROWS - 1);                                  // 0 at the rail, 1 at the hem
      const y = height - v * (height - hem);
      const draft = v * v * breeze * 0.016 * Math.sin(time * 0.8 + v * 2.2);   // the hem drifts in and out

      buildShape(v, breeze, time);
      const thetaM = rowTheta[r];
      const span = spanOf(r);

      // integrate the row
      rowX[0] = 0; rowZ[0] = 0;
      trig(thetaM * shape[0]);
      let pc = trigC, ps = trigS;
      for (let c = 1; c < COLS; c++) {
        trig(thetaM * shape[c]);
        rowX[c] = rowX[c - 1] + 0.5 * (pc + trigC) * ds;
        rowZ[c] = rowZ[c - 1] + 0.5 * (ps + trigS) * ds;
        pc = trigC; ps = trigS;
      }
      // pin both ends to the rail: no net drift in depth, and the span exactly as asked
      const xEnd = rowX[COLS - 1], zEnd = rowZ[COLS - 1];
      const xs = xEnd > 1e-6 ? Math.max(span, 0) / xEnd : 1;
      let zMin = 1e9, zMax = -1e9;
      for (let c = 0; c < COLS; c++) {
        rowX[c] *= xs;
        rowZ[c] -= zEnd * (c / (COLS - 1));
        if (rowZ[c] < zMin) zMin = rowZ[c];
        if (rowZ[c] > zMax) zMax = rowZ[c];
      }
      const inv = 1 / Math.max(zMax - zMin, 1e-4);

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        pos[i * 3] = left + dir * rowX[c];
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z0 + rowZ[c] + draft + (side < 0 ? 0.035 : 0);
        depth[i] = (rowZ[c] - zMin) * inv;                    // 0 deepest valley, 1 crest
        uv[i * 2] = c * ds;
        uv[i * 2 + 1] = v;
      }
    }

    // normals by central differences over the grid
    for (let r = 0; r < ROWS; r++) {
      const r0 = Math.max(0, r - 1), r1 = Math.min(ROWS - 1, r + 1);
      const vv = r / (ROWS - 1);
      const fade = 1 - 0.22 * vv;
      for (let c = 0; c < COLS; c++) {
        const c0 = Math.max(0, c - 1), c1 = Math.min(COLS - 1, c + 1);
        const a0 = (r * COLS + c0) * 3, a1 = (r * COLS + c1) * 3;
        const b0 = (r0 * COLS + c) * 3, b1 = (r1 * COLS + c) * 3;
        const tx = pos[a1] - pos[a0], ty = pos[a1 + 1] - pos[a0 + 1], tz = pos[a1 + 2] - pos[a0 + 2];
        const ux = pos[b1] - pos[b0], uy = pos[b1 + 1] - pos[b0 + 1], uz = pos[b1 + 2] - pos[b0 + 2];
        // along-the-cloth × down-the-drop. The left panel runs toward +x and the right toward -x,
        // which flips the sign of this product, so `dir` puts both on the audience's side.
        const nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux;
        const k = -dir / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
        const i3 = (r * COLS + c) * 3;
        nor[i3] = nx * k; nor[i3 + 1] = ny * k; nor[i3 + 2] = nz * k;

        // darker in the valleys, a little darker toward the floor where less light reaches
        const d = depth[r * COLS + c];
        const shade = (0.10 + 0.90 * d * Math.sqrt(Math.sqrt(Math.sqrt(d)))) * fade;   // d^1.125 without pow()
        col[i3] = shade; col[i3 + 1] = shade; col[i3 + 2] = shade;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.uv.needsUpdate = true;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, configure, update, dispose, material };
}
