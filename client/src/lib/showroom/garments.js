import * as THREE from "three";

/* The photographs that hang in the wardrobes.

   client/public/assets/showroom/garments/manifest.json says, for each kind of garment,
   which picture it is and the three things a picture cannot tell you about itself:

       file    the cut-out, a WebP with a transparent background
       w, h    its size in pixels
       hook    where the hanger's hook is, as a fraction of the picture from its top-left
               corner. This is the point the garment swings from.
       height  how tall the whole picture is in real life, in metres, so a dress is a
               dress and a pair of socks is a pair of socks.
       hanger  what the photograph lacks and the site must add: "wire" a hook over the
               rod, "clip" a clip hanger (trousers, shorts, skirts, socks), "shoulder"
               a shoulder hanger (the dress). Absent when the picture already shows its
               own hanger and hook.

   A kind with no entry hangs nothing. It never falls back to a drawing.              */
let manifest;

export function loadGarment(item, base) {
  manifest ??= fetch(`${base}manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`garment manifest: ${r.status}`);
    return r.json();
  });
  return manifest.then(async (all) => {
    const e = all[item.kind];
    if (!e) throw new Error(`no photograph for ${item.kind}`);
    const map = await new THREE.TextureLoader().loadAsync(`${base}${e.file}`);
    return { map, aspect: e.w / e.h, hook: e.hook, height: e.height, hanger: e.hanger || null };
  });
}
