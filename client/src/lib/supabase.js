import { createClient } from "@supabase/supabase-js";

/* Supabase in the browser — for AUTH ONLY.

   This client signs people in and hands us an access token. It must never be
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

   Missing config is NOT an error. The storefront has to work without accounts:
   guest checkout is the default path and always has been, so if the env vars
   are absent the app runs exactly as it did before and the account UI simply
   never appears. A hard throw here would white-screen the whole shop over a
   feature nobody is required to use. */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authEnabled = Boolean(url && anonKey);

export const supabase = authEnabled
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /* The site has no router and no server rendering, so there is no route
           to catch an OAuth or recovery redirect. Supabase reads the fragment
           off whatever URL it lands on instead, which is how the password-reset
           link resolves into a session on the home page. */
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;

if (!authEnabled && import.meta.env.DEV) {
  console.info(
    "[normalize] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — " +
      "accounts are hidden and the storefront runs in guest-only mode."
  );
}
