import * as THREE from "three";
import { buildGoldEnvironment } from "./studioEnv.js";
import { createStage } from "./stage.js";
import { createWardrobe } from "./wardrobe.js";
import { loadGarment } from "./garments.js";

/* The showroom's one renderer and one loop.

   There are two scenes, the stage (curtain and mannequins) and a wardrobe, and one canvas.
   Choosing a mannequin pushes the camera toward it, dims the canvas to the page's own black,
   swaps scenes, brings the canvas back with the wardrobe doors shut and swings them open.
   Going back is the same in reverse. All of that is this file; the scenes know nothing
   about each other.

   The page (components/Showroom.jsx) drives it with plain calls: scroll progress, pointer,
   which figure is hovered, enter, leave. It draws nothing itself.                          */

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export async function createShowroom(canvas, { assetBase, garmentBase, loadItem, caption, onRects, onMode, reduced = false }) {
  const fetchItem = loadItem || ((item) => loadGarment(item, garmentBase));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const env = buildGoldEnvironment(renderer);
  const stage = createStage({ envTexture: env.texture, assetBase });
  const wardrobe = createWardrobe({ envTexture: env.texture });

  const input = {
    progress: { open: reduced ? 1 : 0, lights: reduced ? 1 : 0 },
    pointer: { x: 0, y: 0, inside: false, speed: 0 },
    hover: null,
    reduced,
  };
  const wd = { doors: 0, goal: 0 };           // 0 closed .. 1 open, before easing
  const flow = { mode: "stage", id: null, t: 0, phase: null, fade: 0, focus: 0, token: 0, queue: [] };

  const size = { w: 1, h: 1, dpr: 1 };

  function resize(w, h, dpr) {
    size.w = Math.max(1, Math.round(w)); size.h = Math.max(1, Math.round(h)); size.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.w, size.h, false);
    stage.layout(size.w, size.h);
    wardrobe.layout(size.w, size.h);
    onRects?.(stage.rects());
  }

  /* ---- the sequence between the two scenes: a list of timed steps ---- */
  const later = (secs, fn) => flow.queue.push({ at: flow.t + secs, fn });
  const setMode = (m) => { flow.mode = m; onMode?.(m, flow.id); };

  async function enter(id, items) {
    if (flow.mode !== "stage") return;
    const token = ++flow.token;
    flow.id = id;
    setMode("to-wardrobe");
    flow.phase = "push"; flow.t = 0; flow.queue.length = 0;

    // fetch the garments while the camera moves
    const loading = Promise.all(items.map((it) => fetchItem(it).then((r) => ({ ...r, label: it.label })).catch(() => null)));
    const quick = reduced ? 0 : 0.75;
    await new Promise((r) => later(quick, r));
    const loaded = (await loading).filter(Boolean);
    if (token !== flow.token) return;

    wardrobe.setContent(loaded);
    wd.doors = 0; wd.goal = 0;
    flow.phase = "swap";
    flow.fade = 1;
    later(0, () => { flow.phase = "in"; });
    later(reduced ? 0.01 : 0.55, () => { wd.goal = 1; });
    later(reduced ? 0.02 : 0.5, () => { setMode("wardrobe"); });
  }

  function leave() {
    if (flow.mode !== "wardrobe") return;
    const token = ++flow.token;
    setMode("to-stage");
    wd.goal = 0;
    flow.queue.length = 0; flow.t = 0;
    const closing = reduced ? 0.01 : 1.05;
    later(closing, () => { flow.phase = "out2"; });
    later(closing + (reduced ? 0 : 0.4), () => {
      if (token !== flow.token) return;
      flow.phase = "back"; flow.focus = 0;
      setMode("stage");
    });
  }

  function step(dt, time) {
    flow.t += dt;
    for (let i = flow.queue.length - 1; i >= 0; i--) {
      if (flow.queue[i].at <= flow.t) { const q = flow.queue.splice(i, 1)[0]; q.fn(); }
    }

    // fade and push, by phase
    if (flow.phase === "push") {
      const k = clamp01(flow.t / 0.75);
      flow.focus = ease(k);
      flow.fade = ease(clamp01((k - 0.45) / 0.55));
    } else if (flow.phase === "in") {
      flow.fade = Math.max(0, flow.fade - dt / (reduced ? 0.05 : 0.5));
      if (flow.fade === 0) flow.phase = null;
    } else if (flow.phase === "out2") {
      flow.fade = Math.min(1, flow.fade + dt / 0.38);
    } else if (flow.phase === "back") {
      flow.fade = Math.max(0, flow.fade - dt / (reduced ? 0.05 : 0.6));
      if (flow.fade === 0) flow.phase = null;
    }

    // the doors
    const dd = wd.goal - wd.doors;
    wd.doors += Math.sign(dd) * Math.min(Math.abs(dd), dt / (wd.goal > wd.doors ? 1.45 : 1.0));
    const doors = reduced ? wd.goal : ease(wd.doors);

    const inWardrobe = flow.mode === "wardrobe" || flow.mode === "to-stage" || flow.phase === "swap" || flow.phase === "in" || flow.phase === "out2";
    const showWardrobe = (flow.mode === "wardrobe") || (flow.mode === "to-wardrobe" && (flow.phase === "swap" || flow.phase === "in")) || (flow.mode === "to-stage" && flow.phase !== "back");

    if (showWardrobe && inWardrobe) {
      const info = wardrobe.update(dt, time, { doors, pointer: input.pointer, reduced });
      if (caption) {
        if (info.index >= 0 && flow.mode === "wardrobe") {
          if (caption.textContent !== info.label) caption.textContent = info.label;
          caption.style.transform = `translate(${info.x.toFixed(1)}px, ${info.y.toFixed(1)}px) translate(-50%, 0)`;
          caption.dataset.show = "1";
        } else caption.dataset.show = "0";
      }
      renderer.render(wardrobe.scene, wardrobe.camera);
    } else {
      if (caption) caption.dataset.show = "0";
      stage.update(dt, time, { open: input.progress.open, lights: input.progress.lights, pointer: input.pointer, hover: input.hover, reduced, focus: flow.mode === "to-wardrobe" ? { id: flow.id, amount: flow.focus } : null });
      renderer.render(stage.scene, stage.camera);
    }

    const op = (1 - flow.fade).toFixed(3);
    if (canvas.dataset.op !== op) { canvas.dataset.op = op; canvas.style.opacity = op; }
  }

  /* ---- the loop: only while someone can see it ---- */
  let raf = 0, last = 0, running = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt, now / 1000);
  }
  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { last = 0; raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
  }

  /* ---- what the page can tell it ---- */
  let lastPX = 0, lastPT = 0;
  const api = {
    resize,
    setRunning,
    setProgress(open, lights) { input.progress.open = open; input.progress.lights = lights; },
    setPointer(x, y, inside) {
      const now = performance.now();
      const dtp = Math.max(1, now - lastPT) / 1000;
      const speed = Math.min(1, Math.abs(x - lastPX) / dtp / 6);
      input.pointer.speed += (speed - input.pointer.speed) * 0.25;
      lastPX = x; lastPT = now;
      input.pointer.x = x; input.pointer.y = y; input.pointer.inside = inside;
    },
    setHover(id) { input.hover = id; },
    enter, leave,
    pan(dxPx) { wardrobe.pan(-dxPx * wardrobe.worldPerPixel()); },
    // keyboard: step the light to the next garment along the rod
    nudge(delta) {
      const gs = wardrobe.garments;
      if (!gs.length) return;
      const cur = gs.findIndex((g) => g.hov > 0.5);
      const next = Math.min(gs.length - 1, Math.max(0, (cur < 0 ? (delta > 0 ? -1 : gs.length) : cur) + delta));
      const g = gs[next];
      const v = new THREE.Vector3(g.x, 1.55, 0).project(wardrobe.camera);
      input.pointer.x = v.x; input.pointer.y = v.y; input.pointer.inside = true;
    },
    get mode() { return flow.mode; },
    get mannequinsReady() { return stage.ready; },
    dispose() {
      setRunning(false);
      stage.dispose(); wardrobe.dispose();
      env.dispose();
      renderer.dispose();
    },
  };
  return api;
}
