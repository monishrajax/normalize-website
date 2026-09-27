import { createRemoteJWKSet, jwtVerify } from "jose";

/* Who is calling? Answered from a Supabase access token, verified here.

   The rule this file exists to enforce: THE SERVER NEVER LEARNS WHO YOU ARE
   FROM THE REQUEST BODY. A browser can put any uuid in a JSON payload, so a
   route that reads `req.body.userId` is a route that hands one customer another
   customer's home address. Every account route takes its user id from
   `req.user.id`, which can only have come from a signature check below.

   Verification is LOCAL, against Supabase's published keys. The obvious
   alternative — calling /auth/v1/user with the token on every request — adds a
   network round trip to Supabase to every single API call, on a serverless
   platform where cold starts are already the thing customers feel.

   Two signing schemes exist and a project can be on either:

   · Asymmetric (current). Supabase signs with a private key and publishes the
     public half at /auth/v1/.well-known/jwks.json. Nothing secret lives on this
     server at all, and a key rotation is picked up automatically.
   · HS256 (legacy). One shared secret signs and verifies. Supported here as a
     fallback because older projects still issue these, but it means the same
     string that verifies a token can also MINT one — so it is only read from
     SUPABASE_JWT_SECRET, never logged, and never sent anywhere.

   JWKS is preferred whenever SUPABASE_URL is set. */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";

export function authConfigured() {
  return Boolean(SUPABASE_URL || JWT_SECRET);
}

/* Built once per warm instance, not per request: createRemoteJWKSet keeps its
   own cache of the fetched keys, so rebuilding it would re-fetch them and throw
   away the one thing it is for. */
let jwks = null;
function keySet() {
  if (!jwks) {
    if (!SUPABASE_URL) return null;
    jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), {
      cooldownDuration: 30_000,     // don't re-fetch on every unknown kid
      cacheMaxAge: 10 * 60_000,
    });
  }
  return jwks;
}

let secretKey = null;
function hsKey() {
  if (!JWT_SECRET) return null;
  if (!secretKey) secretKey = new TextEncoder().encode(JWT_SECRET);
  return secretKey;
}

function bearer(req) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

/**
 * Verify a Supabase access token and return `{ id, email }`, or null.
 * Never throws — an unverifiable token is simply not a user.
 */
export async function verifyToken(token) {
  if (!token) return null;

  /* `audience: "authenticated"` is not decoration. Supabase issues tokens to
     several audiences, and without pinning it a token minted for something
     else would sail through a signature check and be treated as a signed-in
     customer. Expiry is enforced by jwtVerify itself. */
  const options = { audience: "authenticated" };
  if (SUPABASE_URL) options.issuer = `${SUPABASE_URL}/auth/v1`;

  try {
    const keys = keySet();
    if (keys) {
      const { payload } = await jwtVerify(token, keys, options);
      return toUser(payload);
    }
  } catch {
    /* Fall through to the legacy secret. A project mid-migration can be issuing
       HS256 tokens while already publishing a JWKS, and failing the whole
       request because the first scheme did not match would sign those customers
       out for no reason. */
  }

  try {
    const key = hsKey();
    if (key) {
      const { payload } = await jwtVerify(token, key, options);
      return toUser(payload);
    }
  } catch {
    /* Not a valid token. Deliberately silent: the reason a signature failed is
       useful to an attacker probing for one that works, and useless to us. */
  }

  return null;
}

function toUser(payload) {
  if (!payload?.sub) return null;
  /* Anonymous sign-ins are a real Supabase feature and produce a token with a
     user id but no verified identity behind it. They are not customers and must
     not reach an account route. */
  if (payload.is_anonymous === true) return null;
  return {
    id: String(payload.sub),
    email: payload.email ? String(payload.email) : null,
    /* Whether Supabase has confirmed the address. The account routes do not
       care, but ANY future feature that links historical orders by email must:
       matching on an unconfirmed address would show a stranger's delivery
       address to whoever typed it at signup. */
    emailVerified: Boolean(payload.email_verified ?? payload.user_metadata?.email_verified),
  };
}

/** Attach `req.user` when a valid token is present; continue regardless. */
export async function optionalAuth(req, res, next) {
  req.user = await verifyToken(bearer(req));
  next();
}

/** 401 unless a valid token is present. */
export async function requireAuth(req, res, next) {
  if (!authConfigured()) {
    return res.status(503).json({ error: "Accounts are not configured yet." });
  }
  req.user = await verifyToken(bearer(req));
  if (!req.user) return res.status(401).json({ error: "Please sign in and try again." });
  next();
}
