import { useEffect, useRef, useState } from "react";
import Panel from "./Panel";
import { useAuth } from "../context/AuthContext";

/* Sign in, create an account, or ask for a reset link.

   Rule 2: this is a full-viewport canvas through the shared Panel chassis, not
   a modal. One component covers all three states because they share a form,
   a busy flag and an error line — three panels would be three copies of the
   same submit handler drifting apart.

   Nothing here gates checkout. Nothing here is required to buy. The account is
   an offer, and a customer who closes this panel loses nothing. */

const MODES = {
  signin: { title: "Welcome back.", eyebrow: "Your account", cta: "Sign in" },
  signup: { title: "Create your account.", eyebrow: "Your account", cta: "Create account" },
  reset:  { title: "Reset your password.", eyebrow: "Your account", cta: "Send reset link" },
};

/* Supabase's own floor is 6. Eight is not arbitrary — it is the shortest length
   at which a password is worth having, and rejecting it HERE means the
   customer is told before a round trip rather than after. */
const MIN_PASSWORD = 8;

export default function AuthPanel({ open, onClose }) {
  const { signIn, signUp, resetPassword, signedIn } = useAuth();

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const emailRef = useRef(null);

  /* Reset on close, not on open: wiping on open would clear a half-typed email
     if the panel ever re-rendered while visible, and leaving a password in
     state after close means it sits in memory for the rest of the session. */
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => emailRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
    setPassword("");
    setError("");
    setNotice("");
    setMode("signin");
  }, [open]);

  // Signing in is the whole point of the panel; once it happens, get out of the way.
  useEffect(() => {
    if (open && signedIn) onClose();
  }, [open, signedIn, onClose]);

  const go = (next) => { setMode(next); setError(""); setNotice(""); };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;                    // a double submit is two signup attempts
    setError("");
    setNotice("");

    if (mode !== "reset" && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) setError(error);
        // Success needs no branch — the effect above closes the panel.
      } else if (mode === "signup") {
        const { error, needsConfirmation } = await signUp(email, password, fullName);
        if (error) setError(error);
        else if (needsConfirmation) {
          setNotice(`Almost there — we've sent a confirmation link to ${email.trim()}. Click it to finish.`);
          setPassword("");
        }
      } else {
        const { error } = await resetPassword(email);
        if (error) setError(error);
        else setNotice("If there's an account with that email, a reset link is on its way.");
      }
    } finally {
      setBusy(false);
    }
  };

  const m = MODES[mode];

  return (
    <Panel open={open} onClose={onClose} eyebrow={m.eyebrow}>
      <h2 className="mb-8 font-display text-4xl text-ink md:text-5xl">{m.title}</h2>
      <hr className="doc-rule" />

      <p className="mb-8 max-w-prose text-sm leading-relaxed text-brown">
        {mode === "signup"
          ? "Save your address, keep your wishlist across devices, and find your orders in one place."
          : mode === "reset"
            ? "Enter your email and we'll send you a link to set a new password."
            : "Sign in to see your orders and saved addresses."}
      </p>

      <form onSubmit={onSubmit} className="max-w-md">
        {mode === "signup" && (
          <label className="mb-6 block">
            <span className="mb-2 block text-[11px] tracking-[0.16em] text-brown uppercase">Full name</span>
            <input
              type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              autoComplete="name" required maxLength={80} className="field"
            />
          </label>
        )}

        <label className="mb-6 block">
          <span className="mb-2 block text-[11px] tracking-[0.16em] text-brown uppercase">Email</span>
          <input
            ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" required inputMode="email" className="field"
          />
        </label>

        {mode !== "reset" && (
          <label className="mb-6 block">
            <span className="mb-2 block text-[11px] tracking-[0.16em] text-brown uppercase">Password</span>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              /* current-password vs new-password is what tells a password
                 manager whether to offer the saved one or generate a fresh. */
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required minLength={MIN_PASSWORD} className="field"
            />
            {mode === "signup" && (
              <span className="mt-2 block text-[11px] text-muted">At least {MIN_PASSWORD} characters.</span>
            )}
          </label>
        )}

        {error && <p role="alert" className="mb-5 text-sm text-brown">{error}</p>}
        {notice && <p role="status" className="mb-5 text-sm text-gold-dark">{notice}</p>}

        <button
          type="submit" disabled={busy}
          className="min-h-11 w-full border border-ink bg-ink px-9 py-4 text-[11px] tracking-[0.18em]
                     text-cream uppercase transition-opacity duration-300 ease-(--ease-out)
                     disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Please wait…" : m.cta}
        </button>
      </form>

      <div className="mt-10 border-t border-line pt-6 text-[12px] tracking-[0.04em] text-brown">
        {mode === "signin" && (
          <>
            <button onClick={() => go("signup")} className="min-h-11 underline underline-offset-4">
              Create an account
            </button>
            <span className="mx-3 text-line">·</span>
            <button onClick={() => go("reset")} className="min-h-11 underline underline-offset-4">
              Forgot your password?
            </button>
          </>
        )}
        {mode !== "signin" && (
          <button onClick={() => go("signin")} className="min-h-11 underline underline-offset-4">
            Back to sign in
          </button>
        )}
      </div>

      <p className="mt-8 max-w-prose text-[11px] leading-relaxed text-muted">
        You never need an account to order — checkout works without one.
      </p>
    </Panel>
  );
}
