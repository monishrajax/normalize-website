/* Supabase in the browser — for AUTH ONLY, and loaded off the critical path.

   This module signs people in and hands us an access token. It must never be
   used to read or write a table. Every piece of customer data goes through our
   own API, which verifies the token server-side and filters by the id inside
   it. That is not belt-and-braces: `products`, `orders`, `profiles`,
   `addresses` and `wishlists` all have RLS enabled with NO policies precisely
   so the anon key below cannot read a single row of them. Reaching for
   `supabase.from(...)` here would return nothing and tempt the next person to
   "fix" it by adding a permissive policy, which is the one change that would
   expose every customer's address to the internet.

   The anon key being public is by design — it identifies the project, it does
   not authorise anything. It ships in the bundle the same way a Razorpay key
   ID does.

   WHY THE DYNAMIC IMPORT. Statically importing the SDK put 61KB gzipped into
   the main chunk — measured: 64KB to 125KB — and charged it to every visitor,
   almost none of whom sign in. three.js and gsap are already dynamically
   imported here for the same reason. `authEnabled` below is a plain env check
   with no import behind it, so the header can decide whether to render an
   account button without pulling the SDK at all; the download happens on the
   first call to getSupabase(), which is after first paint.

   Missing config is NOT an error. The storefront has to work without accounts:
   guest checkout is the default path and always has been, so if the env vars
   are absent the app runs exactly as it did before and the account UI never
   appears. A hard throw here would white-screen the whole shop over a feature
   nobody is required to use. */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authEnabled = Boolean(url && anonKey);

/* The PROMISE is cached, not just the client. Two callers arriving together
   before the first import resolves would otherwise each start their own
   download and build their own client — and two clients means two sessions
   fighting over the same storage key. */
let clientPromise = null;

export function getSupabase() {
  if (!authEnabled) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          /* The site has no router and no server rendering, so there is no
             route to catch an OAuth or recovery redirect. Supabase reads the
             fragment off whatever URL it lands on instead, which is how the
             password-reset link resolves into a session on the home page. */
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      })
    );
  }
  return clientPromise;
}

if (!authEnabled && import.meta.env.DEV) {
  console.info(
    "[normalize] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — " +
      "accounts are hidden and the storefront runs in guest-only mode."
  );
}
