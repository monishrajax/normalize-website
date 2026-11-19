import * as THREE from "three";

/* What the gold reflects.

   Polished metal shows nothing of its own: it is its surroundings, bent over its shape.
   So a mannequin only looks like metal if the room around it has something to show,
   which is dark space broken by a few hard, bright, soft-edged shapes. This paints that
   room once as an equirectangular picture and has PMREM turn it into the blurred mip
   chain three samples for rough metal (a raw canvas texture would be sampled without
   that, and the gold would reflect a hard-edged photograph of the canvas).

   Layout in u, as three maps it:  0.50 +X (right of the stage)   0.00 / 1.00 -X (left)
                                    0.25 -Z (behind the figures)   0.75 +Z (behind the camera,
                                    which is what a surface facing the audience reflects).
   v runs 0 at the zenith, 0.5 at the horizon, 1 at the floor.                             */
export function buildGoldEnvironment(renderer) {
  const W = 2048, H = 1024;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, "#2a231b");
  g.addColorStop(0.22, "#120e0b");
  g.addColorStop(0.50, "#0a0807");
  g.addColorStop(0.62, "#0c0906");
  g.addColorStop(0.80, "#1f160b");
  g.addColorStop(1.00, "#0d0904");
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // a blurred rectangle in (u, v) units, wrapped around the seam at u = 0 / 1
  const panel = (u0, v0, u1, v1, colour, blur, mode = "screen", alpha = 1) => {
    x.save();
    x.globalCompositeOperation = mode;
    x.globalAlpha = alpha;
    x.filter = `blur(${blur}px)`;
    x.fillStyle = colour;
    for (const shift of [-W, 0, W]) x.fillRect(u0 * W + shift, v0 * H, (u1 - u0) * W, (v1 - v0) * H);
    x.restore();
  };

  // red velvet at either side of the stage — what the gold picks up along its edges
  panel(0.455, 0.20, 0.545, 0.72, "#8a0e18", 60, "screen", 0.55);
  panel(0.955, 0.20, 1.045, 0.72, "#8a0e18", 60, "screen", 0.55);
  panel(0.18, 0.18, 0.32, 0.70, "#4a0810", 70, "screen", 0.45);

  // overhead softboxes: the long highlight that runs over the shoulders and the head
  panel(0.60, 0.035, 0.90, 0.135, "#fff4de", 5);
  panel(0.60, 0.035, 0.90, 0.135, "#ffe2b0", 34);
  panel(0.12, 0.05, 0.38, 0.13, "#ffe9c8", 8, "screen", 0.55);

  // the tall key behind the camera, and its two strip lights either side: these are the
  // vertical bands that sweep down a gold arm or leg as it turns
  panel(0.715, 0.25, 0.785, 0.64, "#fffaf0", 7);
  panel(0.715, 0.25, 0.785, 0.64, "#ffe9bf", 40, "screen", 0.8);
  panel(0.625, 0.22, 0.645, 0.62, "#fff1d6", 6, "screen", 0.9);
  panel(0.855, 0.22, 0.875, 0.62, "#fff1d6", 6, "screen", 0.9);
  // kickers from behind, to catch the far edge of each body
  panel(0.235, 0.26, 0.255, 0.60, "#ffe5b8", 7, "screen", 0.8);
  panel(0.30, 0.30, 0.32, 0.58, "#ffe5b8", 7, "screen", 0.55);

  // warm bounce off the floor
  panel(0.55, 0.72, 0.95, 0.86, "#c08a38", 40, "screen", 0.7);

  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromEquirectangular(t);
  t.dispose();
  pmrem.dispose();
  return rt;
}
