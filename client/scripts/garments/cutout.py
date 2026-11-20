#!/usr/bin/env python
"""Cut a garment out of a photograph.   venv/bin/python -I cutout.py spec.json [id ...]

For each item in the spec: crop, run GrabCut seeded by the polygons given, tidy the mask,
bleed the garment's own colours outward so the edge carries no background halo, fade the
bottom if the photograph cropped the garment, and write a WebP with a transparent
background plus a preview on dark and the numbers the site needs (size, hook, height)."""
import json, sys, os
import cv2
import numpy as np
from PIL import Image

spec = json.load(open(sys.argv[1]))
only = set(sys.argv[2:])
base = spec["base"]

def poly_mask(shape, polys):
    m = np.zeros(shape[:2], np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.array(p, np.int32)], 255)
    return m

def process(it):
    img = cv2.imread(os.path.join(base, it["src"]))
    x0, y0, x1, y1 = it["crop"]
    img = img[y0:y1, x0:x1].copy()
    H, W = img.shape[:2]

    mask = np.full((H, W), cv2.GC_PR_BGD, np.uint8)
    if "rect" in it:
        rx, ry, rw, rh = it["rect"]
        mask[:] = cv2.GC_BGD
        mask[ry:ry + rh, rx:rx + rw] = cv2.GC_PR_FGD
    if "bgcolor_seed" in it:
        # everything that is the wall's colour, anywhere in the crop, is wall
        sx, sy = it["bgcolor_seed"]
        blur = cv2.GaussianBlur(img, (0, 0), 3).astype(np.float32)
        ref = blur[max(0, sy - 6):sy + 6, max(0, sx - 6):sx + 6].reshape(-1, 3).mean(axis=0)
        dist = np.linalg.norm(blur - ref, axis=2)
        mask[dist < it.get("bgcolor_tol", 22)] = cv2.GC_BGD
    if "flood" in it:
        # the wall as one connected patch of near-constant colour, grown from a seed
        sx, sy = it["flood"]["seed"]
        blur = cv2.GaussianBlur(img, (0, 0), 2)
        ff = np.zeros((H + 2, W + 2), np.uint8)
        tol = it["flood"].get("tol", 9)
        cv2.floodFill(blur, ff, (sx, sy), (0, 0, 0), (tol,) * 3, (tol,) * 3, cv2.FLOODFILL_FIXED_RANGE | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
        mask[ff[1:-1, 1:-1] > 0] = cv2.GC_BGD
    for key, val in (("probfg", cv2.GC_PR_FGD), ("probbg", cv2.GC_PR_BGD), ("fg", cv2.GC_FGD), ("bg", cv2.GC_BGD)):
        if key in it:
            mask[poly_mask(img.shape, it[key]) > 0] = val

    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    work = img
    scale = 1.0
    if max(H, W) > 1400:                       # GrabCut is slow on big images; solve small, upsample the mask
        scale = 1400 / max(H, W)
        work = cv2.resize(img, (int(W * scale), int(H * scale)), interpolation=cv2.INTER_AREA)
        mask_s = cv2.resize(mask, (work.shape[1], work.shape[0]), interpolation=cv2.INTER_NEAREST)
    else:
        mask_s = mask
    cv2.grabCut(work, mask_s, None, bgd, fgd, it.get("iters", 7), cv2.GC_INIT_WITH_MASK)
    fgm = ((mask_s == cv2.GC_FGD) | (mask_s == cv2.GC_PR_FGD)).astype(np.uint8) * 255
    if scale != 1.0:
        fgm = cv2.resize(fgm, (W, H), interpolation=cv2.INTER_LINEAR)
        fgm = (fgm > 127).astype(np.uint8) * 255

    # tidy: close pinholes, drop specks, keep the biggest piece (and anything touching it)
    k = max(3, int(min(H, W) * 0.004) | 1)
    kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    fgm = cv2.morphologyEx(fgm, cv2.MORPH_CLOSE, kern)
    fgm = cv2.morphologyEx(fgm, cv2.MORPH_OPEN, kern)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fgm, connectivity=8)
    if n > 1 and it.get("keep_all", False):
        big = np.zeros_like(fgm)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] > 0.01 * H * W:
                big[lab == i] = 255
        fgm = big
    elif n > 1:
        keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keepmask = (lab == keep)
        for i in range(1, n):
            if i != keep and stats[i, cv2.CC_STAT_AREA] > 0.02 * stats[keep, cv2.CC_STAT_AREA]:
                cx, cy = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP]
                # a piece that nearly touches the main one (a hook, a strap) belongs to it
                dil = cv2.dilate(keepmask.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
                if (dil[lab == i] > 0).any():
                    keepmask |= (lab == i)
        fgm = keepmask.astype(np.uint8) * 255
    if it.get("fill_holes", True):
        inv = cv2.bitwise_not(fgm)
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
        for i in range(1, n2):
            x, y, w, h, a = st2[i]
            touches = x == 0 or y == 0 or x + w == W or y + h == H
            if not touches and a < it.get("max_hole", 0.004) * H * W:
                fgm[lab2 == i] = 255

    # defringe: pull the cut in a little, and drop wall-coloured pixels hugging the edge
    er = it.get("erode", max(1, int(round(min(H, W) * 0.0022))))
    if er > 0:
        fgm = cv2.erode(fgm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * er + 1, 2 * er + 1)))
    if "whiteout" in it:
        # peel wall-coloured pixels off the edge, one layer at a time, until the garment's own colour is reached
        bright = img.min(axis=2) > it["whiteout"]
        step = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        for _ in range(it.get("peel", 140)):
            edge = (fgm > 0) & (cv2.erode(fgm, step) == 0)
            rm = edge & bright
            if not rm.any():
                break
            fgm[rm] = 0
        fgm = cv2.morphologyEx(fgm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    # soft edge, a hair inside the cut
    soft = cv2.GaussianBlur(fgm, (0, 0), max(1.0, min(H, W) * 0.0016))
    alpha = np.clip((soft.astype(np.float32) - 70) / (220 - 70), 0, 1)

    # bleed colour outward so filtering never pulls in the old background
    known = (fgm > 0).astype(np.uint8)
    col = img.astype(np.float32)
    col[known == 0] = 0
    cnt = known.astype(np.float32)
    filled = known.copy()
    for _ in range(18):
        s = cv2.blur(col, (5, 5)); c = cv2.blur(cnt, (5, 5)) + 1e-6
        new = s / c[..., None]
        grow = (cv2.blur(filled.astype(np.float32), (5, 5)) > 0) & (filled == 0)
        col[grow] = new[grow]; cnt[grow] = 1.0; filled[grow] = 1
    rgb = np.where(known[..., None] > 0, img.astype(np.float32), col)

    # tone: a touch of gain so the garment survives a dim room; per-item overrides
    tone = it.get("tone", {})
    rgb = np.clip(255 * np.power(np.clip(rgb / 255.0, 0, 1), 1.0 / tone.get("gamma", 1.0)) * tone.get("gain", 1.0), 0, 255)

    if "luma_key" in it:
        lo, hi = it["luma_key"]
        lum = np.clip((rgb.max(axis=2) - lo) / max(hi - lo, 1), 0, 1)
        alpha = alpha * (lum * lum * (3 - 2 * lum))

    # a photograph that cut the garment off: let the bottom dissolve instead of ending in a straight edge
    fade = it.get("fade", 0)
    if fade > 0:
        fh = int(H * fade)
        ramp = np.ones(H, np.float32)
        ramp[H - fh:] = np.linspace(1, 0, fh) ** 1.3
        alpha = alpha * ramp[:, None]

    # trim to what is actually there
    ys, xs = np.where(alpha > 0.02)
    pad = 6
    ty0, ty1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    tx0, tx1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    if it.get("keep_top", False):
        ty0 = 0
    rgb = rgb[ty0:ty1, tx0:tx1]; alpha = alpha[ty0:ty1, tx0:tx1]
    h2, w2 = alpha.shape
    height_m = round(h2 / it["px_per_m"], 3)          # real height of the trimmed picture, before it is shrunk
    # hook, in fractions of the trimmed picture
    hx, hy = it["hook"]
    hook = [round((hx * W - tx0) / w2, 4), round((hy * H - ty0) / h2, 4)]

    outh = it.get("maxh", 960)
    if h2 > outh:
        f = outh / h2
        rgb = cv2.resize(rgb, (int(w2 * f), outh), interpolation=cv2.INTER_AREA)
        alpha = cv2.resize(alpha, (int(w2 * f), outh), interpolation=cv2.INTER_AREA)
        h2, w2 = alpha.shape

    rgba = np.dstack([rgb[..., ::-1].astype(np.uint8), (alpha * 255).astype(np.uint8)])
    im = Image.fromarray(rgba, "RGBA")
    out = os.path.join(spec["out"], it["file"])
    im.save(out, "WEBP", quality=it.get("q", 86), method=6, alpha_quality=96)
    # preview on dark
    bgc = Image.new("RGBA", im.size, (28, 22, 18, 255)); bgc.alpha_composite(im)
    bgc.convert("RGB").save(os.path.join(spec["prev"], it["id"] + ".png"))
    return {"w": w2, "h": h2, "hook": hook, "height": height_m, "file": it["file"], "bytes": os.path.getsize(out)}

os.makedirs(spec["out"], exist_ok=True); os.makedirs(spec["prev"], exist_ok=True)
result = {}
for it in spec["items"]:
    if only and it["id"] not in only:
        continue
    r = process(it)
    result[it["id"]] = r
    print(it["id"], r)
json.dump(result, open(os.path.join(spec["out"], "_result.json"), "w"), indent=1)
