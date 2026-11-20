# Garment photographs

The clothes that hang in the showroom's wardrobes are real photographs, cut out of their
backgrounds. The cut-outs live in `client/public/assets/showroom/garments/` with a
`manifest.json`; this folder is how they were made, so any of them can be redone or replaced.

- `sources.json` — where every photograph came from (all Unsplash, free licence) and which
  ones are used. Download each with the `download` URL into `raw/<id>/photo.jpg`.
- `spec.json` — per garment: the crop, the seed shapes for GrabCut, the real-world scale
  (`px_per_m`), where its hook is and whether the bottom needs fading.
- `cutout.py` — `python3 -I cutout.py spec.json [id ...]` (needs `opencv-python-headless`,
  `numpy`, `pillow`). Writes a transparent WebP per garment plus a preview on dark.

After running it, copy the WebPs into `public/assets/showroom/garments/` and update
`manifest.json` (file, size, `hook`, real `height`, and `hanger` — "wire", "clip" or
"shoulder" — for any picture that doesn't already show its own hanger and hook).
A kind with no manifest entry hangs nothing; it is never replaced by a drawing.
