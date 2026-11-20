// Sculpts a gold display mannequin and writes a compact mesh.
//   node client/scripts/sculpt-mannequin.mjs <man|woman> <grid spacing in metres> <out.bin>
//   (the shipped figures: 0.010, into client/public/assets/showroom/man.bin and woman.bin)
//
// The body is a signed-distance field built from a lofted torso and limbs swept
// along splines, with muscle masses blended in, then meshed with surface nets and
// settled exactly onto the surface. Normals come from the field's own gradient, so
// the surface is smooth however coarse the mesh. A baked occlusion term per vertex
// darkens the armpits, the crotch and the folds between fingers and body.
import fs from "node:fs";

const [, , which = "man", resArg = "0.010", outPath = "out.bin"] = process.argv;
const H = parseFloat(resArg);

/* ------------------------------------------------------------------ maths */
const sq = (x) => x * x;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// monotone cubic through (x, y) pairs — no overshoot between the sculptor's marks
function curve(table) {
  const n = table.length;
  const xs = table.map((t) => t[0]), ys = table.map((t) => t[1]);
  const d = new Array(n - 1), m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/* ------------------------------------------------------------------ primitives */
const ell = (cx, cy, cz, rx, ry, rz) => {
  const ix = 1 / rx, iy = 1 / ry, iz = 1 / rz;
  return (x, y, z) => {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const k0 = Math.sqrt(sq(dx * ix) + sq(dy * iy) + sq(dz * iz));
    const k1 = Math.sqrt(sq(dx * ix * ix) + sq(dy * iy * iy) + sq(dz * iz * iz));
    return k1 < 1e-12 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
};
const ball = (cx, cy, cz, r) => (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r;

function roundCone(ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
    const vx = pax * l2 - bax * yy, vy = pay * l2 - bay * yy, vz = paz * l2 - baz * yy;
    const x2 = vx * vx + vy * vy + vz * vz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

// A limb: a spline through [x, y, z, radius] marks, swept as many short round cones.
function limb(marks, step = 0.018) {
  const P = [marks[0], ...marks, marks[marks.length - 1]];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const pts = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const [p0, p1, p2, p3] = [P[i], P[i + 1], P[i + 2], P[i + 3]];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < n; s++) pts.push([0, 1, 2, 3].map((a) => cr(p0[a], p1[a], p2[a], p3[a], s / n)));
  }
  pts.push(marks[marks.length - 1]);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push(roundCone(...pts[i].slice(0, 3), ...pts[i + 1].slice(0, 3), pts[i][3], pts[i + 1][3]));
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  let rmax = 0;
  for (const p of pts) { for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); } rmax = Math.max(rmax, p[3]); }
  return bounded((x, y, z) => { let d = 1e9; for (let i = 0; i < segs.length; i++) { const s = segs[i](x, y, z); if (s < d) d = s; } return d; }, lo, hi, rmax);
}

// cheap exterior for points nowhere near the surface; a true lower bound on distance
function bounded(f, lo, hi, pad) {
  return (x, y, z) => {
    const dx = Math.max(lo[0] - x, 0, x - hi[0]), dy = Math.max(lo[1] - y, 0, y - hi[1]), dz = Math.max(lo[2] - z, 0, z - hi[2]);
    const db = Math.hypot(dx, dy, dz) - pad;
    return db > 0.06 ? db : f(x, y, z);
  };
}

// A torso: elliptical cross-sections stacked up y, each with its own width, depth and forward offset.
function loft(yLo, yHi, A, B, Z) {
  return (x, y, z) => {
    const yy = clamp(y, yLo, yHi);
    const a = A(yy), b = B(yy), dz = z - Z(yy);
    const k0 = Math.hypot(x / a, dz / b);
    const k1 = Math.hypot(x / (a * a), dz / (b * b));
    const d2 = (k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1) * 0.92;
    const dy = Math.max(yLo - y, y - yHi);
    return dy > 0 ? Math.hypot(Math.max(d2, 0), dy) : d2;
  };
}

const mirror = (f) => (x, y, z) => f(Math.abs(x), y, z);
const union = (parts, k) => (x, y, z) => {
  let d = parts[0](x, y, z);
  for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), k);
  return d;
};

/* ------------------------------------------------------------------ the man */
function man() {
  const torso = loft(0.86, 1.56,
    curve([[0.86, 0.108], [0.93, 0.158], [1.00, 0.160], [1.10, 0.138], [1.20, 0.146], [1.30, 0.166], [1.385, 0.182], [1.45, 0.178], [1.50, 0.150], [1.56, 0.080]]),
    curve([[0.86, 0.082], [0.93, 0.104], [1.00, 0.102], [1.10, 0.090], [1.20, 0.094], [1.30, 0.102], [1.385, 0.108], [1.45, 0.098], [1.50, 0.084], [1.56, 0.068]]),
    curve([[0.86, -0.006], [1.00, -0.008], [1.20, 0.000], [1.385, 0.004], [1.50, -0.006], [1.56, -0.002]]));

  const muscles = union([
    mirror(ell(0.088, 1.405, 0.052, 0.090, 0.054, 0.040)),       // pectorals
    mirror(ell(0.214, 1.452, -0.002, 0.050, 0.074, 0.056)),      // deltoid
    mirror(ell(0.092, 1.505, -0.016, 0.092, 0.040, 0.058)),      // trapezius, up to the neck
    mirror(ell(0.050, 1.285, 0.082, 0.040, 0.030, 0.024)),       // abdominals, three soft courses
    mirror(ell(0.048, 1.215, 0.080, 0.039, 0.030, 0.023)),
    mirror(ell(0.045, 1.145, 0.077, 0.037, 0.030, 0.022)),
    mirror(ell(0.070, 0.940, -0.056, 0.090, 0.092, 0.066)),      // glutes
    mirror(ell(0.098, 1.060, 0.022, 0.060, 0.062, 0.050)),       // oblique / hip crest
  ], 0.03);
  const head = union([
    ell(0, 1.722, 0.004, 0.078, 0.118, 0.094),                  // cranium
    ell(0, 1.668, 0.026, 0.060, 0.072, 0.070),                  // face and jaw
    ell(0, 1.640, 0.050, 0.030, 0.034, 0.030),                  // chin
  ], 0.05);
  const neck = limb([[0, 1.62, 0.004, 0.052], [0, 1.57, 0.000, 0.057], [0, 1.52, -0.004, 0.064]]);

  const arm = limb([
    [0.202, 1.458, -0.002, 0.058], [0.222, 1.380, 0.000, 0.052], [0.236, 1.300, 0.003, 0.046],
    [0.246, 1.205, -0.002, 0.040], [0.252, 1.145, 0.004, 0.040], [0.262, 1.060, 0.014, 0.034],
    [0.278, 0.975, 0.026, 0.026], [0.290, 0.930, 0.034, 0.023],
  ]);
  const biceps = ell(0.230, 1.330, 0.022, 0.034, 0.070, 0.036);
  const triceps = ell(0.236, 1.335, -0.022, 0.032, 0.066, 0.030);
  const forearm = ell(0.256, 1.120, 0.010, 0.034, 0.066, 0.036);
  const hand = limb([[0.292, 0.925, 0.036, 0.024], [0.298, 0.880, 0.044, 0.030], [0.303, 0.825, 0.056, 0.026], [0.306, 0.775, 0.066, 0.015]]);
  const palm = ell(0.299, 0.865, 0.046, 0.020, 0.052, 0.034);
  const thumb = limb([[0.282, 0.905, 0.060, 0.013], [0.276, 0.860, 0.078, 0.011], [0.274, 0.828, 0.088, 0.008]]);
  const arms = mirror(union([arm, biceps, triceps, forearm, hand, palm, thumb], 0.026));

  const leg = limb([
    [0.094, 0.935, 0.000, 0.092], [0.098, 0.830, 0.006, 0.086], [0.100, 0.720, 0.012, 0.075],
    [0.101, 0.610, 0.018, 0.063], [0.101, 0.520, 0.022, 0.056], [0.099, 0.440, 0.014, 0.054],
    [0.097, 0.360, -0.008, 0.052], [0.096, 0.260, -0.012, 0.042], [0.095, 0.150, -0.010, 0.033], [0.094, 0.090, -0.008, 0.031],
  ]);
  const quad = ell(0.104, 0.760, 0.034, 0.066, 0.150, 0.056);
  const hamstring = ell(0.100, 0.740, -0.026, 0.060, 0.130, 0.050);
  const calf = ell(0.098, 0.370, -0.032, 0.046, 0.096, 0.044);
  const foot = union([
    ball(0.095, 0.052, -0.042, 0.038),                           // heel
    ell(0.098, 0.050, 0.030, 0.040, 0.040, 0.082),               // arch and instep
    ell(0.101, 0.026, 0.118, 0.044, 0.026, 0.060),               // ball and toes
  ], 0.034);
  const legs = mirror(union([leg, quad, hamstring, calf, foot], 0.030));

  return (x, y, z) => {
    let d = smin(torso(x, y, z), muscles(x, y, z), 0.05);
    d = smin(d, head(x, y, z), 0.05);
    d = smin(d, neck(x, y, z), 0.045);
    d = smin(d, arms(x, y, z), 0.04);
    d = smin(d, legs(x, y, z), 0.05);
    return smax(d, -y, 0.006);
  };
}

/* ------------------------------------------------------------------ the woman */
function woman() {
  const torso = loft(0.86, 1.52,
    curve([[0.86, 0.108], [0.93, 0.160], [1.00, 0.158], [1.06, 0.130], [1.12, 0.110], [1.22, 0.120], [1.30, 0.130], [1.38, 0.138], [1.44, 0.136], [1.48, 0.116], [1.52, 0.070]]),
    curve([[0.86, 0.080], [0.93, 0.098], [1.00, 0.094], [1.06, 0.080], [1.12, 0.072], [1.22, 0.078], [1.30, 0.086], [1.38, 0.092], [1.44, 0.082], [1.48, 0.072], [1.52, 0.060]]),
    curve([[0.86, -0.006], [1.00, -0.008], [1.20, 0.000], [1.38, 0.004], [1.48, -0.004], [1.52, -0.002]]));

  const muscles = union([
    mirror(ell(0.062, 1.360, 0.064, 0.064, 0.066, 0.052)),       // bust
    mirror(ell(0.164, 1.418, -0.002, 0.040, 0.058, 0.044)),      // shoulder
    mirror(ell(0.070, 1.462, -0.014, 0.075, 0.032, 0.046)),      // trapezius
    mirror(ell(0.068, 0.950, -0.054, 0.086, 0.090, 0.064)),      // glutes / hips
    mirror(ell(0.100, 1.000, 0.004, 0.066, 0.072, 0.060)),       // hips, sides
  ], 0.045);
  const head = union([
    ell(0, 1.672, 0.002, 0.068, 0.108, 0.086),
    ell(0, 1.622, 0.022, 0.052, 0.066, 0.064),
    ell(0, 1.598, 0.044, 0.026, 0.030, 0.026),
  ], 0.045);
  const neck = limb([[0, 1.585, 0.004, 0.039], [0, 1.545, 0.000, 0.043], [0, 1.495, -0.004, 0.050]]);

  // left arm hangs; right hand rests on the hip
  const armHang = limb([
    [-0.162, 1.424, -0.002, 0.046], [-0.178, 1.340, 0.000, 0.040], [-0.190, 1.250, 0.002, 0.036],
    [-0.200, 1.170, 0.000, 0.031], [-0.212, 1.080, 0.010, 0.029], [-0.226, 0.995, 0.024, 0.023], [-0.236, 0.945, 0.032, 0.020],
  ]);
  const handHang = limb([[-0.236, 0.940, 0.034, 0.020], [-0.241, 0.895, 0.042, 0.025], [-0.246, 0.845, 0.052, 0.022], [-0.248, 0.800, 0.060, 0.012]]);
  const armHip = limb([
    [0.162, 1.424, -0.002, 0.046], [0.186, 1.340, -0.006, 0.040], [0.208, 1.255, -0.020, 0.036],
    [0.222, 1.175, -0.032, 0.032], [0.200, 1.115, -0.010, 0.029], [0.166, 1.062, 0.020, 0.024], [0.146, 1.032, 0.036, 0.020],
  ]);
  const handHip = limb([[0.146, 1.032, 0.036, 0.020], [0.126, 1.022, 0.046, 0.024], [0.100, 1.012, 0.056, 0.020], [0.082, 1.004, 0.060, 0.012]]);

  const legL = limb([                                            // the weight leg, straight
    [-0.084, 0.935, 0.000, 0.084], [-0.088, 0.830, 0.006, 0.078], [-0.091, 0.720, 0.012, 0.067],
    [-0.093, 0.610, 0.016, 0.056], [-0.093, 0.520, 0.018, 0.050], [-0.091, 0.440, 0.010, 0.047],
    [-0.089, 0.360, -0.008, 0.046], [-0.088, 0.260, -0.010, 0.036], [-0.088, 0.150, -0.008, 0.028], [-0.088, 0.090, -0.006, 0.026],
  ]);
  const footL = union([
    ball(-0.088, 0.048, -0.036, 0.032),
    ell(-0.091, 0.046, 0.026, 0.034, 0.034, 0.072),
    ell(-0.094, 0.024, 0.104, 0.036, 0.022, 0.052),
  ], 0.030);
  const legR = limb([                                            // the relaxed leg, knee soft and forward
    [0.088, 0.935, 0.002, 0.084], [0.098, 0.830, 0.026, 0.078], [0.108, 0.725, 0.050, 0.067],
    [0.112, 0.620, 0.068, 0.056], [0.112, 0.530, 0.070, 0.050], [0.110, 0.445, 0.050, 0.047],
    [0.108, 0.360, 0.018, 0.046], [0.106, 0.260, -0.004, 0.036], [0.105, 0.150, -0.014, 0.028], [0.105, 0.090, -0.016, 0.026],
  ]);
  const footR = union([
    ball(0.105, 0.048, -0.046, 0.032),
    ell(0.108, 0.046, 0.016, 0.034, 0.034, 0.072),
    ell(0.111, 0.024, 0.094, 0.036, 0.022, 0.052),
  ], 0.030);

  const thighL = ell(-0.090, 0.760, 0.030, 0.058, 0.140, 0.050);
  const thighR = ell(0.104, 0.760, 0.050, 0.058, 0.140, 0.050);
  const calfL = ell(-0.090, 0.372, -0.026, 0.040, 0.090, 0.038);
  const calfR = ell(0.108, 0.378, 0.000, 0.040, 0.090, 0.038);
  const legs = union([legL, footL, legR, footR, thighL, thighR, calfL, calfR], 0.030);
  const arms = union([armHang, handHang, armHip, handHip], 0.024);

  return (x, y, z) => {
    let d = smin(torso(x, y, z), muscles(x, y, z), 0.05);
    d = smin(d, head(x, y, z), 0.045);
    d = smin(d, neck(x, y, z), 0.04);
    d = smin(d, arms(x, y, z), 0.035);
    d = smin(d, legs(x, y, z), 0.045);
    return smax(d, -y, 0.006);
  };
}

const sdf = which === "woman" ? woman() : man();

/* ------------------------------------------------------------------ the field */
const min = [-0.46, -0.02, -0.26], max = [0.46, 1.90, 0.30];
const n = [0, 1, 2].map((i) => Math.ceil((max[i] - min[i]) / H) + 1);
const [nx, ny, nz] = n;
const idx = (i, j, k) => i + nx * (j + ny * k);
const field = new Float32Array(nx * ny * nz).fill(NaN);

const C = 4;
const cnx = Math.ceil((nx - 1) / C) + 1, cny = Math.ceil((ny - 1) / C) + 1, cnz = Math.ceil((nz - 1) / C) + 1;
const coarse = new Float32Array(cnx * cny * cnz);
for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++)
  coarse[i + cnx * (j + cny * k)] = sdf(min[0] + i * C * H, min[1] + j * C * H, min[2] + k * C * H);
const margin = C * H * 1.9;
let evaluated = 0;
for (let ck = 0; ck < cnz - 1; ck++) for (let cj = 0; cj < cny - 1; cj++) for (let ci = 0; ci < cnx - 1; ci++) {
  let lo = Infinity, hi = -Infinity;
  for (let c = 0; c < 8; c++) {
    const v = coarse[(ci + (c & 1)) + cnx * ((cj + ((c >> 1) & 1)) + cny * (ck + ((c >> 2) & 1)))];
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  const active = lo < margin && hi > -margin;
  for (let k = ck * C; k <= Math.min(ck * C + C, nz - 1); k++)
    for (let j = cj * C; j <= Math.min(cj * C + C, ny - 1); j++)
      for (let i = ci * C; i <= Math.min(ci * C + C, nx - 1); i++) {
        const t = idx(i, j, k);
        if (!Number.isNaN(field[t])) continue;
        field[t] = active ? sdf(min[0] + i * H, min[1] + j * H, min[2] + k * H) : (lo > 0 ? margin : -margin);
        if (active) evaluated++;
      }
}
console.error(`grid ${nx}x${ny}x${nz}  fine evaluations ${evaluated} (${((100 * evaluated) / field.length).toFixed(1)}%)`);

/* ------------------------------------------------------------------ surface nets */
const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
const verts = [];
const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
const cv = new Float32Array(8);
for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
  let mask = 0;
  for (let c = 0; c < 8; c++) { cv[c] = field[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (cv[c] < 0) mask |= 1 << c; }
  if (mask === 0 || mask === 255) continue;
  let sx = 0, sy = 0, sz = 0, cnt = 0;
  for (const [a, b] of edges) {
    if ((cv[a] < 0) === (cv[b] < 0)) continue;
    const t = cv[a] / (cv[a] - cv[b]);
    sx += corners[a][0] + t * (corners[b][0] - corners[a][0]);
    sy += corners[a][1] + t * (corners[b][1] - corners[a][1]);
    sz += corners[a][2] + t * (corners[b][2] - corners[a][2]);
    cnt++;
  }
  cellVert[cidx(i, j, k)] = verts.length / 3;
  verts.push(min[0] + (i + sx / cnt) * H, min[1] + (j + sy / cnt) * H, min[2] + (k + sz / cnt) * H);
}

const gradient = (x, y, z, e) => {
  const gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
};
const V = verts.length / 3;
const normals = new Float32Array(V * 3);
const ao = new Float32Array(V);
for (let v = 0; v < V; v++) {
  let x = verts[v * 3], y = verts[v * 3 + 1], z = verts[v * 3 + 2];
  for (let it = 0; it < 3; it++) {
    const d = sdf(x, y, z);
    const [gx, gy, gz] = gradient(x, y, z, H * 0.35);
    x -= gx * d * 0.85; y -= gy * d * 0.85; z -= gz * d * 0.85;
  }
  verts[v * 3] = x; verts[v * 3 + 1] = y; verts[v * 3 + 2] = z;
  const g = gradient(x, y, z, H * 0.6);
  normals[v * 3] = g[0]; normals[v * 3 + 1] = g[1]; normals[v * 3 + 2] = g[2];
  // how boxed-in is this point? walk out along the normal and see how far the surface is from where it ought to be
  let occ = 0, w = 1;
  for (let s = 1; s <= 5; s++) {
    const h = 0.006 + 0.075 * (s / 5);
    occ += (h - sdf(x + g[0] * h, y + g[1] * h, z + g[2] * h)) * w;
    w *= 0.8;
  }
  ao[v] = clamp(1 - 4.2 * occ, 0, 1);
}

const tris = [];
const emit = (a, b, c) => {
  if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) return;
  const ax = verts[a * 3], ay = verts[a * 3 + 1], az = verts[a * 3 + 2];
  const ux = verts[b * 3] - ax, uy = verts[b * 3 + 1] - ay, uz = verts[b * 3 + 2] - az;
  const vx = verts[c * 3] - ax, vy = verts[c * 3 + 1] - ay, vz = verts[c * 3 + 2] - az;
  const nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
  const dot = nxx * (normals[a * 3] + normals[b * 3] + normals[c * 3]) + nyy * (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]) + nzz * (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]);
  if (dot >= 0) tris.push(a, b, c); else tris.push(a, c, b);
};
for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
  const here = field[idx(i, j, k)] < 0;
  if (i < nx - 1 && (field[idx(i + 1, j, k)] < 0) !== here) {
    const a = cellVert[cidx(i, j, k)], b = cellVert[cidx(i, j - 1, k)], c = cellVert[cidx(i, j - 1, k - 1)], d = cellVert[cidx(i, j, k - 1)];
    emit(a, b, c); emit(a, c, d);
  }
  if (j < ny - 1 && (field[idx(i, j + 1, k)] < 0) !== here) {
    const a = cellVert[cidx(i, j, k)], b = cellVert[cidx(i, j, k - 1)], c = cellVert[cidx(i - 1, j, k - 1)], d = cellVert[cidx(i - 1, j, k)];
    emit(a, b, c); emit(a, c, d);
  }
  if (k < nz - 1 && (field[idx(i, j, k + 1)] < 0) !== here) {
    const a = cellVert[cidx(i, j, k)], b = cellVert[cidx(i - 1, j, k)], c = cellVert[cidx(i - 1, j - 1, k)], d = cellVert[cidx(i, j - 1, k)];
    emit(a, b, c); emit(a, c, d);
  }
}

/* ------------------------------------------------------------------ write it */
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let v = 0; v < V; v++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], verts[v * 3 + a]); hi[a] = Math.max(hi[a], verts[v * 3 + a]); }
const M = tris.length;
const idxBytes = V < 65536 ? 2 : 4;
const pad4 = (b) => (b + 3) & ~3;
const posBytes = pad4(V * 6), norBytes = pad4(V * 3), aoBytes = pad4(V), indBytes = pad4(M * idxBytes);
const buf = Buffer.alloc(40 + posBytes + norBytes + aoBytes + indBytes);
buf.write("MNQ2", 0, "ascii");
buf.writeUInt32LE(V, 4); buf.writeUInt32LE(M, 8); buf.writeUInt32LE(idxBytes, 12);
for (let a = 0; a < 3; a++) { buf.writeFloatLE(lo[a], 16 + a * 4); buf.writeFloatLE(hi[a], 28 + a * 4); }
let o = 40;
for (let v = 0; v < V; v++) for (let a = 0; a < 3; a++) {
  buf.writeInt16LE(Math.round(((verts[v * 3 + a] - lo[a]) / (hi[a] - lo[a])) * 65535) - 32768, o); o += 2;
}
o = 40 + posBytes;
for (let v = 0; v < V; v++) for (let a = 0; a < 3; a++) { buf.writeInt8(clamp(Math.round(normals[v * 3 + a] * 127), -127, 127), o); o++; }
o = 40 + posBytes + norBytes;
for (let v = 0; v < V; v++) { buf.writeUInt8(Math.round(ao[v] * 255), o); o++; }
o = 40 + posBytes + norBytes + aoBytes;
for (let t = 0; t < M; t++) { if (idxBytes === 2) buf.writeUInt16LE(tris[t], o); else buf.writeUInt32LE(tris[t], o); o += idxBytes; }
fs.writeFileSync(outPath, buf);
console.error(`${which}: ${V} vertices, ${M / 3} triangles, ${(buf.length / 1024).toFixed(0)} KB  bbox ${lo.map((x) => x.toFixed(2))} .. ${hi.map((x) => x.toFixed(2))}`);
