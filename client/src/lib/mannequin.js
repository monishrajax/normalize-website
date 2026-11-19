import * as THREE from "three";

/* Reads a sculpted mannequin (client/scripts/sculpt-mannequin.mjs writes them).

   The file is a header, then four tightly packed arrays, so a whole figure is a
   few hundred kilobytes before gzip rather than a mesh interchange format:

     0   "MNQ2"
     4   vertex count            (u32)
     8   index count             (u32)
     12  bytes per index, 2 or 4 (u32)
     16  bounding-box min xyz    (3 x f32)
     28  bounding-box max xyz    (3 x f32)
     40  positions  Int16  x3 per vertex, spread over the bounding box, padded to 4
         normals    Int8   x3 per vertex, padded to 4
         occlusion  Uint8  x1 per vertex, padded to 4 — baked "how boxed-in is this point"
         indices                                                                   */
export function parseMannequin(buffer) {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "MNQ2") throw new Error("Not a mannequin file");

  const count = dv.getUint32(4, true);
  const indexCount = dv.getUint32(8, true);
  const indexBytes = dv.getUint32(12, true);
  const lo = [0, 1, 2].map((a) => dv.getFloat32(16 + a * 4, true));
  const hi = [0, 1, 2].map((a) => dv.getFloat32(28 + a * 4, true));

  const pad4 = (n) => (n + 3) & ~3;
  const posAt = 40;
  const norAt = posAt + pad4(count * 6);
  const aoAt = norAt + pad4(count * 3);
  const idxAt = aoAt + pad4(count);

  const q = new Int16Array(buffer, posAt, count * 3);
  const position = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    for (let a = 0; a < 3; a++) {
      position[v * 3 + a] = lo[a] + ((q[v * 3 + a] + 32768) / 65535) * (hi[a] - lo[a]);
    }
  }

  const n8 = new Int8Array(buffer, norAt, count * 3);
  const normal = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    const x = n8[i], y = n8[i + 1], z = n8[i + 2];
    const l = Math.hypot(x, y, z) || 1;
    normal[i] = x / l; normal[i + 1] = y / l; normal[i + 2] = z / l;
  }

  const occlusion = new Uint8Array(buffer.slice(aoAt, aoAt + count));
  const index = indexBytes === 2
    ? new Uint16Array(buffer.slice(idxAt, idxAt + indexCount * 2))
    : new Uint32Array(buffer.slice(idxAt, idxAt + indexCount * 4));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("ao", new THREE.BufferAttribute(occlusion, 1, true));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export async function loadMannequin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mannequin ${url}: ${res.status}`);
  return parseMannequin(await res.arrayBuffer());
}

/* Polished gold. The baked occlusion attribute darkens what the environment
   would otherwise light straight through the armpit, the crotch and the gap
   between a hand and the hip. */
export function goldMaterial({ envMapIntensity = 1.35 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffd57a,
    metalness: 1,
    roughness: 0.17,
    clearcoat: 0.35,
    clearcoatRoughness: 0.1,
    envMapIntensity,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float ao;\nvarying float vAo;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAo = ao;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vAo;")
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
         float occ = mix(0.12, 1.0, vAo * vAo);
         reflectedLight.indirectSpecular *= occ;
         reflectedLight.directSpecular *= mix(0.55, 1.0, vAo);`
      );
  };
  return m;
}
