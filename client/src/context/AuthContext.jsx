import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase, authEnabled } from "../lib/supabase";
import { setAccessTokenProvider } from "../lib/api";

/* Who is signed in, and the four things they can do about it.

   Supabase owns identity entirely — the password hash, the confirmation state,
   the reset tokens, the refresh rotation. Nothing security-critical is
   implemented here; this file is the React-shaped wrapper around it, plus the
   one piece of glue that lets lib/api attach a token to its requests.

   When accounts are not configured this still mounts and still provides a
   context. Every consumer therefore reads the same shape whether or not the
   env vars exist, and the storefront runs guest-only instead of crashing —
   see lib/supabase for why that is a deliberate choice rather than laziness. */

const AuthCtx = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  /* Starts true so nothing renders a signed-out header for the split second
     before supabase-js has read the stored session back. That flash is how a
     returning customer concludes the site logged them out. */
  const [loading, setLoading] = useState(authEnabled);

  /* Read by lib/api on every request. Kept in a ref so registering the getter
     once at mount does not capture a stale session from the first render. */
  const sessionRef = useRef(null);
  sessionRef.current = session;

  useEffect(() => {
    if (!authEnabled) return;

    /* The getter asks supabase-js, not this component's state. It refreshes an
       expiring token transparently, which state cannot do — a token copied
       into React at sign-in would start failing an hour later. */
    setAccessTokenProvider(async () => {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token ?? null;
    });

    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data?.session ?? null);
      setLoading(false);
    });

    /* Covers every way the session can change WITHOUT this tab doing anything:
       a token refresh, a sign-out in another tab, a password-reset link landing
       on the page. Polling or trusting the initial read would miss all three. */
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
      setAccessTokenProvider(null);
    };
  }, []);

  /* Supabase returns errors rather than throwing, and its messages are written
     for developers ("Invalid login credentials"). Each call is normalised to
     `{ error }` — null on success — so callers have one shape to render. */
  const signIn = useCallback(async (email, password) => {
    if (!authEnabled) return { error: "Accounts are not available right now." };
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: error ? friendly(error) : null };
  }, []);

  const signUp = useCallback(async (email, password, fullName) => {
    if (!authEnabled) return { error: "Accounts are not available right now." };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: (fullName || "").trim() },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: friendly(error) };
    /* With email confirmation on, signUp succeeds but returns no session — the
       account is not usable until the link is clicked. Saying so is the whole
       difference between "check your inbox" and a customer typing their new
       password into a sign-in form that keeps rejecting it. */
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (!authEnabled) return;
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!authEnabled) return { error: "Accounts are not available right now." };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    /* Deliberately reports success even when the address is unknown. Telling a
       stranger "no account with that email" turns this box into a way to find
       out who has an account here. */
    return { error: error ? friendly(error) : null };
  }, []);

  const value = useMemo(
    () => ({
      enabled: authEnabled,
      loading,
      session,
      user: session?.user ?? null,
      email: session?.user?.email ?? null,
      signedIn: Boolean(session?.user),
      signIn, signUp, signOut, resetPassword,
    }),
    [loading, session, signIn, signUp, signOut, resetPassword]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function friendly(error) {
  const msg = String(error?.message || "");
  if (/invalid login credentials/i.test(msg)) return "That email and password don’t match.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox.";
  if (/user already registered|already been registered/i.test(msg)) {
    return "There’s already an account with that email. Try signing in.";
  }
  if (/password should be at least/i.test(msg)) return "Use at least 8 characters.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Please wait a minute.";
  /* Anything unrecognised is shown as-is rather than swallowed into "something
     went wrong" — a customer who can read "Signups not allowed for this
     instance" can tell you about it, and that is a configuration mistake we
     would otherwise never hear about. */
  return msg || "Something went wrong. Please try again.";
}
