import { useEffect, useRef, useState } from "react";
import Coin from "./Coin";
import { api } from "../lib/api";

/* The early-access gate — fronts the entire site while VITE_EARLY_ACCESS is
   "true". Modelled on onthefence.in's own password-gate flow, checked by
   actually clicking through it rather than going off a screenshot: land on
   it, answer ONE rotating yes/no-shaped question (never a form alongside
   it), get a one-line reaction, then — and only then — the signup form.
   Reload and you get a different question; it is never the same six-or-so
   questions shown all at once.

   This is not a <Panel>. Every other full-viewport canvas on the site has a
   close button and sits ON TOP of a site that still exists underneath; this
   one IS the site for as long as the flag is on, so there is nothing to
   close back to. App.jsx renders it in place of everything else. */

const WAITLIST_KEY = "normalize_waitlisted";
const GATE_KEY = "normalize_gate_unlocked";
const PHONE = /^[6-9][0-9]{9}$/;

/* The nineteen this-or-that questions, straight from the reference sheet
   ("Normalize Loops & Questions") rather than the brand-fact set this started
   with — on request, swapped for exact parity with that page. Each is just
   the question text; the two options are derived by splitting on " or ",
   the same way that sheet's own script builds its table, so there is one
   source of truth for the wording and nothing to keep in sync by hand. */
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

/* Two small pools rather than one bespoke line per answer: which option
   someone picked matters less here than whether they picked it themselves or
   handed it to the coin, so the reveal is drawn at random from whichever pool
   matches that — not keyed to the specific answer. */
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
function pickQuestion() { return pick(QUESTIONS); }

/* One of five vertical background loops, picked at random per mount — the
   same "rotate one at random" rule the questions follow, not all five
   layered or cycling. Files are expected at /assets/gate/loop1..5-v2.mp4
   (and matching .jpg posters); until those exist this quietly renders nothing
   and the plain dark panel underneath shows through unchanged, so shipping
   the gate is never blocked on the clips being ready.

   The "-v2" is load-bearing, not cosmetic. vercel.json sets
   `Cache-Control: public, max-age=31536000, immutable` on everything under
   /assets/ — correct for Vite's own hashed JS/CSS output, but these clips are
   a plain static passthrough with no hash of their own. The first upload and
   a later re-compress both replaced the bytes under the SAME filename, and
   `immutable` tells every browser and CDN edge that already fetched either
   one to never check again — for up to a year. Bumping the suffix is what
   actually changes the URL, which is the only thing that forces a fresh
   fetch under this header; silently overwriting loop1.mp4 a third time would
   just repeat the exact bug this fixes. The next real change here needs a
   "-v3" (or better, swap to a hash), not another overwrite. */
const LOOP_COUNT = 5;
function GateVideo() {
  const [index] = useState(() => 1 + Math.floor(Math.random() * LOOP_COUNT));
  const [broken, setBroken] = useState(false);
  const videoRef = useRef(null);

  const reduced = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Neither the `autoPlay` attribute nor a plain `.play()` call was actually
     starting playback — checked by reading `.paused` after mount, not just
     trusting either one. The cause is a known React/<video> gap: setting
     `muted` as a JSX prop writes the ATTRIBUTE, but the browser's autoplay
     gate checks the live `muted` IDL PROPERTY, and React does not reliably
     sync that property from the attribute before the browser evaluates
     whether to allow this clip to autoplay. The fix is to set `.muted` (and
     `.defaultMuted`, for the loop restarting cleanly) on the actual DOM node
     imperatively, BEFORE calling `.play()`, rather than trusting JSX for it.
     The rejection is still swallowed — a browser that blocks it regardless
     should just leave the poster frame showing, not log a console error. */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || reduced || broken) return;
    el.muted = true;
    el.defaultMuted = true;
    el.play().catch(() => {});
  }, [reduced, broken, index]);

  if (broken) return null;

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      src={`/assets/gate/loop${index}-v2.mp4`}
      poster={`/assets/gate/loop${index}-v2.jpg`}
      muted
      loop
      playsInline
      autoPlay={!reduced}
      preload="auto"
      onError={() => setBroken(true)}
    />
  );
}

export default function EarlyAccessGate({ onUnlock }) {
  /* A visitor who already signed up does not get re-asked the question on
     every return trip — they land straight on the "you're on the list"
     state. This is NOT the same as unlocking the site: the product still
     is not live for them, only the gate's own nagging stops. */
  const [alreadyOnList, setAlreadyOnList] = useState(() => {
    try { return localStorage.getItem(WAITLIST_KEY) === "1"; } catch { return false; }
  });

  const [question] = useState(pickQuestion);
  const [step, setStep] = useState("question"); // question -> reveal -> form
  const [answer, setAnswer] = useState(null);    // { question, choice }
  const [revealText, setRevealText] = useState("");
  const revealTimer = useRef(null);

  useEffect(() => () => clearTimeout(revealTimer.current), []);

  /* `viaCoin` is the only thing that decides which line pool answers from —
     the coin resolves to a REAL choice (so the stored answer is still "Late
     nights", never "the coin"), it just got there without being asked. */
  const choose = (label, viaCoin = false) => {
    setAnswer({ question: question.q, choice: label });
    setRevealText(pick(viaCoin ? COIN_LINES : CHOSEN_LINES));
    setStep("reveal");
    clearTimeout(revealTimer.current);
    // Auto-advances on its own — a one-line reaction does not need a "next"
    // button, and onthefence.in's own interstitial does the same.
    revealTimer.current = setTimeout(() => setStep("form"), 1600);
  };

  const letCoinDecide = () => choose(Math.random() < 0.5 ? question.a : question.b, true);

  /* ---- the signup form ---- */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const onPhoneChange = (e) => {
    setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10));
    setPhoneError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (phone && !PHONE.test(phone)) {
      setPhoneError("Enter a 10-digit Indian mobile number.");
      return;
    }
    setSubmitError("");
    setBusy(true);
    try {
      await api.submitWaitlist({
        name: name.trim(),
        email: email.trim(),
        phone,
        question: answer?.question || "",
        answer: answer?.choice || "",
      });
      try { localStorage.setItem(WAITLIST_KEY, "1"); } catch { /* private window */ }
      setAlreadyOnList(true);
    } catch (err) {
      setSubmitError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /* ---- the "Enter using password" escape hatch ----
     A soft speed bump for the team and early press, not a real lock — the
     same bar onthefence.in's own equivalent sets. The value never leaves this
     bundle as anything more sensitive than a Razorpay public key ID does; do
     not raise this to a security boundary without moving the check server-side. */
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const GATE_PASSWORD = import.meta.env.VITE_GATE_PASSWORD || "";

  const onPasswordSubmit = (e) => {
    e.preventDefault();
    if (GATE_PASSWORD && password === GATE_PASSWORD) {
      try { localStorage.setItem(GATE_KEY, "1"); } catch { /* private window */ }
      onUnlock();
    } else {
      setPasswordError("That's not it.");
    }
  };

  /* Reduced motion needs nothing special here: Coin.jsx checks it itself for
     drag/flip, and the passive idle spin is already killed globally by the
     .coin-spin .coin-inner rule under @media (prefers-reduced-motion: reduce)
     in index.css. */
  return (
    <div className="grid min-h-dvh bg-cream md:grid-cols-2">
      {/* ---- the dark panel: the real coin, spinning, same as the header and
          footer — no WebGL here on purpose. This page is the first thing a
          visitor on a slow connection ever sees, so it stays light: zero JS
          beyond this component, the same two textures the rest of the site
          already caches. ---- */}
      <div className="relative order-first flex min-h-[320px] flex-col items-center justify-center gap-7 overflow-hidden bg-ink px-7 py-16 text-cream md:min-h-0">
        <GateVideo />
        {/* Dark scrim over the video so the coin and copy keep their contrast
            whatever the clip is doing — without this a bright cut could wash
            the gold coin out entirely. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ink/55" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center select-none font-brand text-[46vw] leading-none font-extrabold text-gold/5 md:text-[26vw]"
          style={{ fontStretch: "125%" }}
        >
          N
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 55% at 50% 38%, rgba(212,175,55,.16), transparent 70%)" }}
        />
        <div className="relative z-10" style={{ filter: "drop-shadow(0 24px 48px rgba(0,0,0,.5))" }}>
          <Coin size="xl" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-3 text-center">
          <p className="font-display text-xl text-gold-light italic">&ldquo;Let the Coin Decide.&rdquo;</p>
          <a
            href="https://www.instagram.com/thenormalize/"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full border border-gold/35 px-4 py-2.5
                       text-[11px] tracking-[0.14em] text-cream/80 transition-colors hover:border-gold hover:text-gold-light"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
              <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" />
            </svg>
            @thenormalize
          </a>
        </div>
      </div>

      {/* ---- the content panel ---- */}
      <div className="flex flex-col justify-center px-6 py-16 md:px-14 lg:px-20">
        <div className="mx-auto w-full max-w-md">
          {alreadyOnList ? (
            <>
              <p className="mb-5 text-[11px] tracking-[0.22em] text-gold-dark uppercase">You're on the list</p>
              <h1 className="mb-5 font-display text-4xl text-ink md:text-5xl">See you at the gate.</h1>
              <p className="max-w-prose text-sm leading-relaxed text-brown">
                We'll be in touch the moment it opens. Until then — the coin keeps spinning.
              </p>
            </>
          ) : step === "reveal" ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 text-center">
              <p className="font-display text-2xl text-ink italic md:text-3xl">{revealText}</p>
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-dark" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-dark [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-dark [animation-delay:300ms]" />
              </span>
            </div>
          ) : step === "question" ? (
            <>
              <p className="mb-5 text-[11px] tracking-[0.22em] text-gold-dark uppercase">One question · Edition 001</p>
              <h1 className="mb-5 font-display text-4xl text-ink md:text-5xl">{question.q}</h1>
              <p className="mb-8 max-w-prose text-sm leading-relaxed text-brown">
                We ask one small thing before the gate, never a form up front.
                Answer honestly, or don't — there's always a third option.
              </p>
              <hr className="doc-rule" />
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => choose(question.a)}
                  className="min-h-12 rounded-full border border-ink bg-ink px-6 py-3.5 text-[12px] tracking-[0.1em]
                             text-cream uppercase transition-colors hover:border-brown hover:bg-brown"
                >
                  {question.a}
                </button>
                <button
                  onClick={() => choose(question.b)}
                  className="min-h-12 rounded-full border border-ink bg-ink px-6 py-3.5 text-[12px] tracking-[0.1em]
                             text-cream uppercase transition-colors hover:border-brown hover:bg-brown"
                >
                  {question.b}
                </button>
                <button
                  onClick={letCoinDecide}
                  className="min-h-12 rounded-full border border-gold-dark px-6 py-3.5 text-[12px] tracking-[0.1em]
                             text-brown uppercase transition-colors hover:bg-gold hover:text-ink"
                >
                  Let the coin decide
                </button>
              </div>
              <GateFooter showPassword={showPassword} setShowPassword={setShowPassword}
                password={password} setPassword={setPassword} passwordError={passwordError}
                onPasswordSubmit={onPasswordSubmit} hasPassword={Boolean(GATE_PASSWORD)} />
            </>
          ) : (
            <>
              <p className="mb-5 text-[11px] tracking-[0.22em] text-gold-dark uppercase">Launch · Edition 001</p>
              <h1 className="mb-5 font-display text-4xl text-ink md:text-5xl">The coin hasn't landed yet.</h1>
              <p className="mb-6 max-w-prose text-sm leading-relaxed text-brown">
                One product at a time. The Butterfly Tote is next — indigo jute
                under a scatter of white butterflies. We open the gate the
                moment the first run is off the machines in Chennai.
              </p>

              {answer && (
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-2
                                 text-[11px] tracking-[0.08em] text-brown">
                  You told us: <b className="font-bold text-ink">{answer.question.replace("?", "")}: {answer.choice}</b>
                  <button
                    type="button"
                    onClick={() => setStep("question")}
                    className="ml-0.5 underline decoration-gold-dark underline-offset-4"
                  >
                    change
                  </button>
                </div>
              )}

              <hr className="doc-rule" />

              <form onSubmit={onSubmit}>
                <label className="mb-6 block">
                  <span className="mb-2 block text-[11px] tracking-[0.16em] text-brown uppercase">Full name</span>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                    autoComplete="name" required maxLength={80} className="field" />
                </label>

                <label className="mb-6 block">
                  <span className="mb-2 block text-[11px] tracking-[0.16em] text-brown uppercase">Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email" required inputMode="email" className="field" />
                </label>

                <label className="mb-6 block">
                  <span className="mb-2 block text-[11px] tracking-[0.16em] text-brown uppercase">WhatsApp number</span>
                  <div className="flex items-end gap-2.5">
                    <span className="border-b border-line pb-2.5 text-sm text-brown">🇮🇳 +91</span>
                    <input type="text" value={phone} onChange={onPhoneChange}
                      inputMode="numeric" maxLength={10} placeholder="98765 43210"
                      autoComplete="tel-national" className="field flex-1" />
                  </div>
                  {phoneError && <p className="mt-1.5 text-xs text-brown">{phoneError}</p>}
                </label>

                {submitError && <p role="alert" className="mb-5 text-sm text-brown">{submitError}</p>}

                <button
                  type="submit" disabled={busy}
                  className="min-h-11 w-full border border-gold bg-gold px-9 py-4 text-[11px] tracking-[0.18em]
                             text-ink uppercase transition-opacity duration-300 ease-(--ease-out) disabled:opacity-50"
                >
                  {busy ? "Please wait…" : "Get Early Access"}
                </button>
              </form>

              <GateFooter showPassword={showPassword} setShowPassword={setShowPassword}
                password={password} setPassword={setPassword} passwordError={passwordError}
                onPasswordSubmit={onPasswordSubmit} hasPassword={Boolean(GATE_PASSWORD)} />
            </>
          )}

        </div>
      </div>
    </div>
  );
}

/* The bottom-of-form password escape hatch, shared by the question and form
   steps so the one way past the gate is never more than a scroll away. */
function GateFooter({ showPassword, setShowPassword, password, setPassword, passwordError, onPasswordSubmit, hasPassword }) {
  if (!hasPassword) return null;
  return (
    <div className="mt-8 border-t border-line pt-6">
      {showPassword ? (
        <form onSubmit={onPasswordSubmit} className="flex flex-wrap items-end gap-3">
          <label className="min-w-[160px] flex-1">
            <span className="mb-2 block text-[11px] tracking-[0.16em] text-brown uppercase">Password</span>
            <input
              type="password" value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              autoFocus className="field"
            />
          </label>
          <button type="submit" className="min-h-11 border border-ink px-5 py-2.5 text-[11px] tracking-[0.12em] text-ink uppercase">
            Enter
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowPassword(true)}
          className="min-h-11 text-[12px] text-brown underline underline-offset-4">
          Enter using password
        </button>
      )}
      {passwordError && <p className="mt-2 text-xs text-brown">{passwordError}</p>}
    </div>
  );
}
