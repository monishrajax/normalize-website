import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import Coin from "./Coin";

/* The early-access gate — fronts the entire site while VITE_EARLY_ACCESS is
   "true". Rebuilt against a full, precise spec handed over directly (single
   -column mobile layout, a physical coin toss via the Web Animations API, a
   synthesised ting, a real confirmation ticket) rather than the looser
   two-column version this replaces — see the commit message for exactly what
   changed and why, since several things here deliberately reverse recent
   decisions (a synthesised sound again, not the real recording; a dark,
   gate-only palette, not the site's cream one; one column, not two).

   This is not a <Panel>. Every other full-viewport canvas on the site has a
   close button and sits ON TOP of a site that still exists underneath; this
   one IS the site for as long as the flag is on, so there is nothing to
   close back to. App.jsx renders it in place of everything else.

   No new image assets were required to build this. The spec calls for
   emblem.webp / wordmark.webp / coin-heads.webp / coin-tails.webp; this reuses
   what the rest of the site already has instead — the real wordmark's own
   gold-gradient text treatment (.metallic-text, the same font-stretch:125%
   Archivo used in the header) stands in for a wordmark image, and the real
   coin-front.webp / coin-back.webp (already installed, already used
   elsewhere) are the two coin faces. The five video loops are the ones
   already compressed and installed from the last pass (loop1-v2.mp4 etc.),
   referenced by their real names rather than the spec's loop1.mp4 — same five
   clips, no new files needed. */

const WAITLIST_KEY = "normalize_waitlisted";
const GATE_KEY = "normalize_gate_unlocked";
const LAST_Q_KEY = "nz_last_q";
const PHONE = /^[6-9][0-9]{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOOP_COUNT = 5;

/* Reads/writes localStorage through one place, swallowing failures — a
   private window or a blocked storage API must degrade to "always ask a
   question", never crash the gate. */
function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

/* The nineteen this-or-that questions, in the exact order specified. Each is
   just the question text; the two options are derived by splitting on
   " or " — one source of truth for the wording, nothing to keep in sync
   by hand. */
const QUESTION_TEXT = [
  "Late nights or early mornings?", "Oversized or fitted?", "Black or white?",
  "Text back or leave on read?", "Chai or coffee?", "Sneakers or loafers?",
  "Stay in or go out?", "Plans or plot twists?", "Gold or silver?",
  "Window seat or aisle?", "Voice note or call?", "Repeat the outfit or never again?",
  "Main character or side character?", "Early to the party or fashionably late?",
  "Night drive or long walk?", "Shuffle or repeat?", "Linen or denim?",
  "Dress up or dress down?", "Heads or tails?",
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const QUESTIONS = QUESTION_TEXT.map((q) => {
  const [a, b] = q.replace(/\?$/, "").split(" or ");
  return { q, a: cap(a), b: cap(b) };
});

/* Picked at random, but never the same question twice in a row — "Ask me
   another" would otherwise sometimes do nothing visible. Persisted so a
   reload doesn't just repeat whatever was last on screen either. */
function pickQuestion() {
  if (QUESTIONS.length < 2) return QUESTIONS[0];
  const last = storage(LAST_Q_KEY);
  let next;
  do { next = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]; }
  while (next.q === last);
  storage(LAST_Q_KEY, next.q);
  return next;
}

const CHOSEN_LINES = [
  "Normal. Now get on the list before the doors open.",
  "Noted. You'd fit right in.",
  "Good answer. The list is short on people like you.",
  "Decided. That's the first step. Early access is the second.",
];
const COIN_LINES = [
  "The coin has spoken. So have we: you're early.",
  "You didn't choose. The coin did. The list is still your call.",
  "Fate picked the answer. You pick early access.",
  "Some things you leave to the coin. This one you shouldn't.",
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------------------------------------------------------------------------
   The film — one of five loops, picked at random per mount. Mirrors the spec
   closely: play immediately without waiting for canplay, retry on the tab
   becoming visible again and on the visitor's first tap, and go
   poster-only (here: just paused on whatever frame loaded) under reduced
   motion rather than autoplaying at all.
--------------------------------------------------------------------------- */
function Film() {
  const videoRef = useRef(null);
  const [index] = useState(() => 1 + Math.floor(Math.random() * LOOP_COUNT));
  const [playing, setPlaying] = useState(false);
  const reduced = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Safari — desktop and iOS — can refuse even a muted, playsInline,
     autoplay video outright: under Low Power Mode, or on a domain's first
     few visits before it has "learned" the site is trustworthy. Neither is
     something script can force past. So this retries on every signal the
     element gives that it's ready (metadata/data/canplay, visibility
     regained, the visitor's first tap anywhere) AND tracks whether playback
     actually started — if it hasn't, our own branded play button sits over
     the frame instead of leaving Safari's bare icon on a black rectangle. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || reduced) return;
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();

    const events = ["loadedmetadata", "loadeddata", "canplay"];
    events.forEach((e) => v.addEventListener(e, tryPlay));
    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    const onVisible = () => { if (!document.hidden) tryPlay(); };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", tryPlay, { once: true, passive: true });
    return () => {
      events.forEach((e) => v.removeEventListener(e, tryPlay));
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", tryPlay);
    };
  }, [reduced]);

  return (
    <div
      className="relative w-full shrink-0 overflow-hidden bg-black aspect-[4/5] max-h-[56vh] md:aspect-auto md:h-dvh md:max-h-none md:w-1/2"
    >
      <video
        ref={videoRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "50% 45%" }}
        src={`/assets/gate/loop${index}-v2.mp4`}
        muted
        playsInline
        autoPlay={!reduced}
        loop
        preload="auto"
        disablePictureInPicture
      />
      {/* Mobile: fades into the content that sits below the film. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 md:hidden"
        style={{
          background: "linear-gradient(to bottom, rgba(13,12,10,.15) 0%, rgba(13,12,10,0) 35%, rgba(13,12,10,.55) 78%, #0d0c0a 100%)",
        }}
      />
      {/* Desktop: the film is a full-height left column, content sits beside
          it rather than under it — fade toward that seam instead of the
          floor. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden md:block"
        style={{
          background: "linear-gradient(to right, rgba(13,12,10,0) 60%, #0d0c0a 100%)",
        }}
      />
      {!reduced && !playing && (
        <button
          type="button"
          onClick={() => videoRef.current?.play().catch(() => {})}
          aria-label="Play film"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-sm"
            style={{ background: "rgba(13,12,10,.55)", border: "1px solid rgba(214,176,102,.6)" }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="#d6b066" style={{ marginLeft: 2 }}>
              <path d="M5 3.5v13l12-6.5z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The coin toss — a real physical arc via the Web Animations API, not a
   continuous spin: it rises, flips face to face, and drops back down with a
   shadow that shrinks and returns in sync. Runs once per mount; the parent
   remounts this (via a key) each time the visitor tosses again.
--------------------------------------------------------------------------- */
function CoinToss({ questionA, questionB, onDone }) {
  const coinRef = useRef(null);
  const shadowRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [caption, setCaption] = useState("Letting the coin decide");

  /* Three sine tones layered into one metallic "ting", synthesised rather
     than a recording — no file to fetch, and calling it straight from this
     effect (which only ever runs as a direct result of the visitor's own
     click on "Let the coin decide") is still a genuine user gesture as far
     as the browser's autoplay policy is concerned. */
  const playTing = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      // Safari sometimes hands back a context that's still "suspended" even
      // from a genuine click — resume() is a no-op everywhere else.
      if (ctx.state === "suspended") ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.12;
      master.connect(ctx.destination);
      const now = ctx.currentTime;
      [[2350, 1.1, 1], [6486, 0.5, 0.5], [12690, 0.25, 0.3]].forEach(([freq, time, gain]) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + time);
        osc.connect(g).connect(master);
        osc.start(now);
        osc.stop(now + time + 0.05);
      });
    } catch {
      // A sound effect is a nice-to-have; it must never block the toss.
    }
  }, []);

  useEffect(() => {
    const coin = coinRef.current;
    const shadow = shadowRef.current;
    if (!coin) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heads = Math.random() < 0.5;
    const side = heads ? "heads" : "tails";

    if (reduced || !coin.animate) {
      coin.style.transform = `rotateX(${heads ? 0 : 180}deg)`;
      setCaption(heads ? "Heads" : "Tails");
      const t = setTimeout(() => onDone(side), 700);
      return () => clearTimeout(t);
    }

    const spins = 6 + Math.floor(Math.random() * 3);
    const end = spins * 360 + (heads ? 0 : 180);
    const duration = 1700;

    playTing();
    const coinAnim = coin.animate(
      [
        { transform: "translateY(0) rotateX(0deg) scale(1)", easing: "cubic-bezier(.2,.7,.35,1)" },
        { offset: 0.45, transform: `translateY(-150px) rotateX(${end * 0.55}deg) scale(1.08)`, easing: "cubic-bezier(.55,0,.8,.35)" },
        { offset: 0.88, transform: `translateY(0) rotateX(${end - 12}deg) scale(1)` },
        { offset: 0.94, transform: `translateY(-10px) rotateX(${end + 4}deg) scale(1)` },
        { transform: `translateY(0) rotateX(${end}deg) scale(1)` },
      ],
      { duration, fill: "forwards" }
    );
    shadow?.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { offset: 0.45, transform: "scale(.45)", opacity: 0.35 },
        { offset: 0.88, transform: "scale(1)", opacity: 1 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration, fill: "forwards" }
    );

    let settleTimer;
    coinAnim.onfinish = () => {
      playTing();
      setCaption(heads ? `Heads · ${questionA}` : `Tails · ${questionB}`);
      settleTimer = setTimeout(() => onDone(side), 900);
    };
    return () => clearTimeout(settleTimer);
    // Runs once per mount by design — the parent remounts this component
    // (via a key bump) for a retoss rather than this effect re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex w-full flex-col items-center pt-2.5">
      <div className="relative" style={{ width: 190, height: 300, perspective: 900, WebkitPerspective: 900 }}>
        <div
          ref={coinRef}
          className="absolute bottom-[34px] left-0"
          style={{ width: 190, height: 190, transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d" }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          >
            <img src="/assets/coin-front.webp" alt="Heads" className="block h-full w-full rounded-full" />
          </div>
          <div
            className="absolute inset-0 rounded-full"
            style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
          >
            <img src="/assets/coin-back.webp" alt="Tails" className="block h-full w-full rounded-full" />
          </div>
        </div>
        <div
          ref={shadowRef}
          className="absolute bottom-[14px] left-1/2 h-[18px] w-[150px] -ml-[75px] rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(0,0,0,.75), rgba(0,0,0,0))" }}
        />
      </div>
      <div className="min-h-[28px] text-[12px] tracking-[0.24em] uppercase" style={{ color: "#d6b066" }}>
        {caption}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The gate itself.
--------------------------------------------------------------------------- */
export default function EarlyAccessGate({ onUnlock }) {
  /* "already" is a real step, not a flag that keeps re-asserting itself over
     every other render — it decides where a RETURNING, already-signed-up
     visitor lands on first paint, nothing more. Without that distinction,
     "Ask me another" could not do what it says for someone who has already
     submitted once: the flag would keep winning and snap them straight back
     to the reassurance screen no matter what step they tried to move to. */
  const [alreadyOnList, setAlreadyOnList] = useState(() => storage(WAITLIST_KEY) === "1");
  const [step, setStep] = useState(() => (storage(WAITLIST_KEY) === "1" ? "already" : "ask"));
                                                           // already | ask -> toss -> result -> done
  const [question, setQuestion] = useState(pickQuestion);
  const [tossKey, setTossKey] = useState(0);              // bumped to remount CoinToss on a retoss
  const [answer, setAnswer] = useState(null);             // { pick, byCoin, side }
  const [verdictLabel, setVerdictLabel] = useState("");
  const [verdictLine, setVerdictLine] = useState("");

  const askAnother = () => {
    setQuestion(pickQuestion());
    setStep("ask");
  };

  const reveal = (nextAnswer) => {
    setAnswer(nextAnswer);
    if (nextAnswer.byCoin) {
      setVerdictLabel(nextAnswer.side === "heads" ? "Heads. The coin chose" : "Tails. The coin chose");
      setVerdictLine(pick(COIN_LINES));
    } else {
      setVerdictLabel("You chose");
      setVerdictLine(pick(CHOSEN_LINES));
    }
    setFormError("");
    setStep("result");
  };

  /* A direct pick is a decision already made — it goes straight to the
     result. The toss belongs only to "Let the coin decide". */
  const choose = (label) => reveal({ pick: label, byCoin: false, side: null });

  const onCoinDecide = () => setStep("toss");

  const onTossDone = (side) => {
    reveal({ pick: side === "heads" ? question.a : question.b, byCoin: true, side });
  };

  /* ---- the sign-up form ---- */
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { name, q, a, by }
  const nameRef = useRef(null);

  useEffect(() => {
    if (step !== "result") return;
    const t = setTimeout(() => {
      try { nameRef.current?.focus({ preventScroll: true }); } catch { /* not focusable yet */ }
    }, 350);
    return () => clearTimeout(t);
  }, [step]);

  const onPhoneChange = (e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const name = fullName.trim();
    if (!name) return setFormError("Add your full name.");
    if (!EMAIL.test(email.trim())) return setFormError("Enter an email address like name@example.com.");
    if (!PHONE.test(phone)) return setFormError("Enter a 10-digit Indian mobile number, without +91.");

    setFormError("");
    setBusy(true);
    try {
      await api.submitWaitlist({
        name,
        email: email.trim(),
        phone,
        question: question.q,
        answer: answer?.pick || "",
      });
      try { storage(WAITLIST_KEY, "1"); } catch { /* private window */ }
      setDone({
        name,
        q: question.q,
        a: answer?.pick || "",
        by: answer?.byCoin ? `The coin (${answer.side})` : "You",
      });
      setAlreadyOnList(true);
      setStep("done");
    } catch (err) {
      setFormError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const doneAgain = () => {
    setDone(null);
    setFullName(""); setEmail(""); setPhone("");
    askAnother();
  };

  /* ---- the "Enter using password" escape hatch ---- */
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const GATE_PASSWORD = import.meta.env.VITE_GATE_PASSWORD || "";

  const onPasswordSubmit = (e) => {
    e.preventDefault();
    if (GATE_PASSWORD && password === GATE_PASSWORD) {
      try { storage(GATE_KEY, "1"); } catch { /* private window */ }
      onUnlock();
    } else {
      setPasswordError("That's not it.");
    }
  };

  const ink = "#0d0c0a", ink2 = "#16140f", line = "#2c281f", cream = "#efe6d4",
    muted = "#968c7a", gold = "#d6b066";

  return (
    <div className="min-h-dvh w-full md:flex" style={{ background: ink, colorScheme: "dark" }}>
    {/* Mobile: the film sits full-width above the content, which follows
        below it. Desktop (md+): a proper two-column split — the film is a
        full-height left column, the content is vertically centred beside
        it on the right, never stacked under a lonely strip of video. */}
    <Film />
    <main
      className="mx-auto flex w-full max-w-[480px] flex-col items-center px-5 pb-10 antialiased md:my-auto md:w-1/2 md:px-10"
      style={{ color: cream, fontFamily: "var(--font-mono)" }}
    >
      {/* Brand — overlaps the bottom of the film. The real wordmark treatment
          stands in for a separate wordmark image; the coin IS the emblem.
          The same interactive Coin as the hero, not a static image — drag,
          tap, or arrow keys turn it, same gestures everywhere on the site. */}
      <header className="relative z-[2] -mt-16 flex flex-col items-center gap-3.5 md:mt-0">
        <Coin size="lg" interactive className="[filter:drop-shadow(0_6px_18px_rgba(0,0,0,.6))]" />
        <span
          className="metallic-text wordmark text-base tracking-[0.2em]"
          style={{ fontStretch: "125%" }}
          aria-label="Normalize"
        >
          NORMALIZE
        </span>
      </header>

      <section key={step} className="fade-in mt-[34px] flex w-full flex-col items-center text-center">
        {step === "already" ? (
          <>
            <p className="text-[11px] tracking-[0.28em] uppercase" style={{ color: gold }}>Early access</p>
            <h1 className="my-3 font-display text-[clamp(34px,9.4vw,44px)] leading-[1.08] italic">
              See you at the gate.
            </h1>
            <p className="max-w-[32ch]" style={{ color: muted }}>
              We'll message you on WhatsApp before the doors open.
            </p>
            <button
              type="button" onClick={askAnother}
              className="mt-5 px-2 py-1.5 text-[12px] tracking-[0.12em] uppercase underline underline-offset-4"
              style={{ color: muted }}
            >
              Ask me another
            </button>
          </>
        ) : step === "ask" ? (
          <>
            <p className="text-[11px] tracking-[0.28em] uppercase" style={{ color: "#d9cfbc" }}>
              Early access · one question
            </p>
            <h1 className="my-3 mb-7 font-display text-[clamp(34px,9.4vw,44px)] leading-[1.08] italic text-balance">
              {question.q}
            </h1>
            <div className="flex w-full flex-col gap-3">
              <button
                type="button" onClick={() => choose(question.a)}
                className="w-full rounded-full border px-[22px] py-[18px] text-[15px] tracking-[0.04em] transition-[transform,border-color] active:scale-[.985]"
                style={{ background: ink2, color: cream, borderColor: line }}
              >
                {question.a}
              </button>
              <button
                type="button" onClick={() => choose(question.b)}
                className="w-full rounded-full border px-[22px] py-[18px] text-[15px] tracking-[0.04em] transition-[transform,border-color] active:scale-[.985]"
                style={{ background: ink2, color: cream, borderColor: line }}
              >
                {question.b}
              </button>
              <button
                type="button" onClick={onCoinDecide}
                className="flex w-full items-center justify-center gap-3 rounded-full border px-[22px] py-[18px] text-[15px] tracking-[0.04em] transition-[filter] active:scale-[.985] hover:brightness-[1.06]"
                style={{
                  background: "linear-gradient(135deg, #e8cc8a 0%, #d6b066 45%, #9c7430 100%)",
                  color: "#1b1307", borderColor: "#e6c886",
                }}
              >
                <img src="/assets/coin-front.webp" alt="" width="26" height="26"
                  className="h-[26px] w-[26px] rounded-full" style={{ boxShadow: "0 1px 3px rgba(0,0,0,.4)" }} />
                Let the coin decide
              </button>
              <div className="mt-0.5 text-[11px] tracking-[0.06em]" style={{ color: muted }}>
                {question.a === "Heads"
                  ? "Heads or tails, the coin knows."
                  : `Heads: ${question.a} · Tails: ${question.b}`}
              </div>
            </div>
            <button
              type="button" onClick={askAnother}
              className="mt-5 px-2 py-1.5 text-[12px] tracking-[0.12em] uppercase underline underline-offset-4 transition-colors"
              style={{ color: muted }}
            >
              Ask me another
            </button>
          </>
        ) : step === "toss" ? (
          <CoinToss
            key={tossKey}
            questionA={question.a}
            questionB={question.b}
            onDone={onTossDone}
          />
        ) : step === "result" ? (
          <>
            <p className="text-[11px] tracking-[0.28em] uppercase" style={{ color: gold }}>{verdictLabel}</p>
            <h2 className="my-2.5 font-display text-[clamp(38px,10vw,50px)] leading-[1.05] italic text-balance">
              {answer?.pick}.
            </h2>
            <p className="mb-6.5 max-w-[32ch] text-balance" style={{ color: muted }}>{verdictLine}</p>

            <form onSubmit={onSubmit} noValidate className="flex w-full flex-col gap-2.5 text-left">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: muted }}>Full name</span>
                <input
                  ref={nameRef} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name" placeholder="Your full name" required
                  className="w-full rounded px-4 py-[15px] text-base outline-none"
                  style={{ background: ink2, color: cream, border: `1px solid ${line}` }}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: muted }}>Email</span>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email" placeholder="you@example.com" required
                  className="w-full rounded px-4 py-[15px] text-base outline-none"
                  style={{ background: ink2, color: cream, border: `1px solid ${line}` }}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: muted }}>WhatsApp number</span>
                <div className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="flex flex-none items-center rounded px-3.5 text-[15px] tabular-nums"
                    style={{ background: ink2, color: cream, border: `1px solid ${line}` }}
                  >
                    +91
                  </span>
                  <input
                    type="tel" inputMode="numeric" value={phone} onChange={onPhoneChange}
                    autoComplete="tel-national" placeholder="10-digit number" maxLength={10} required
                    className="min-w-0 flex-1 rounded px-4 py-[15px] text-base tabular-nums outline-none"
                    style={{ background: ink2, color: cream, border: `1px solid ${line}` }}
                  />
                </div>
              </label>
              <div className="min-h-[18px] text-[12px]" style={{ color: "#e59a7e" }} role="alert">{formError}</div>
              <button
                type="submit" disabled={busy}
                className="mt-1 w-full rounded-full border px-[22px] py-[18px] text-[15px] tracking-[0.04em] transition-[filter] disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #e8cc8a 0%, #d6b066 45%, #9c7430 100%)",
                  color: "#1b1307", borderColor: "#e6c886",
                }}
              >
                {busy ? "Please wait…" : "Get early access"}
              </button>
              <p className="mt-3 text-center text-[11px] leading-[1.6]" style={{ color: "#6f675a" }}>
                By signing up you agree to receive automated updates and marketing messages from Normalize on
                WhatsApp and email. Reply STOP to unsubscribe at any time.
              </p>
            </form>
          </>
        ) : step === "done" && done ? (
          <>
            <div
              className="flex w-full flex-col items-center gap-3.5 rounded-md px-[22px] pt-[26px] pb-[22px] text-center"
              style={{ background: ink2, border: `1px solid ${line}` }}
            >
              <img src="/assets/coin-front.webp" alt="" width="72" height="72" className="h-[72px] w-[72px] rounded-full" />
              <h2 className="font-display text-[36px] leading-[1.1] italic text-balance">
                You're on the list, {done.name}.
              </h2>
              <dl
                className="mt-1.5 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 pt-4 text-left"
                style={{ borderTop: `1px dashed ${line}` }}
              >
                <dt className="text-[11px] tracking-[0.1em] uppercase" style={{ color: muted }}>Name</dt>
                <dd>{done.name}</dd>
                <dt className="text-[11px] tracking-[0.1em] uppercase" style={{ color: muted }}>Question</dt>
                <dd>{done.q}</dd>
                <dt className="text-[11px] tracking-[0.1em] uppercase" style={{ color: muted }}>Answer</dt>
                <dd>{done.a}</dd>
                <dt className="text-[11px] tracking-[0.1em] uppercase" style={{ color: muted }}>Decided by</dt>
                <dd>{done.by}</dd>
              </dl>
              <p style={{ color: muted }}>We'll message you on WhatsApp before the doors open.</p>
            </div>
            <button
              type="button" onClick={doneAgain}
              className="mt-5 px-2 py-1.5 text-[12px] tracking-[0.12em] uppercase underline underline-offset-4"
              style={{ color: muted }}
            >
              Ask me another
            </button>
          </>
        ) : null}
      </section>

      {/* The password escape hatch — a soft speed bump for the team, same bar
          onthefence.in's own equivalent sets, not a real lock. */}
      {Boolean(GATE_PASSWORD) && (
        <div className="mt-7 flex w-full flex-col items-center border-t pt-3" style={{ borderColor: line }}>
          {showPassword ? (
            <form onSubmit={onPasswordSubmit} className="flex w-full flex-wrap items-end gap-3">
              <label className="min-w-[160px] flex-1 text-left">
                <span className="mb-2 block text-[11px] tracking-[0.16em] uppercase" style={{ color: muted }}>Password</span>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoFocus className="w-full rounded px-4 py-[15px] text-base outline-none"
                  style={{ background: ink2, color: cream, border: `1px solid ${line}` }}
                />
              </label>
              <button type="submit" className="min-h-11 border px-5 py-2.5 text-[11px] tracking-[0.12em] uppercase"
                style={{ borderColor: cream, color: cream }}>
                Enter
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setShowPassword(true)}
              className="min-h-11 px-2 text-[12px] tracking-[0.12em] uppercase underline underline-offset-4" style={{ color: muted }}>
              Enter using password
            </button>
          )}
          {passwordError && <p className="mt-2 text-xs" style={{ color: "#e59a7e" }}>{passwordError}</p>}
        </div>
      )}

      <footer className="mt-4 flex justify-center">
        <a
          href="https://www.instagram.com/thenormalize/" target="_blank" rel="noopener noreferrer"
          aria-label="Normalize on Instagram"
          className="flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:border-[#d6b066] hover:text-[#d6b066]"
          style={{ color: muted, borderColor: line }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4.2" />
            <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </a>
      </footer>
    </main>
    </div>
  );
}
