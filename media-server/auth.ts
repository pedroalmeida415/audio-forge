import type { Context, Next } from "hono";
import postgres from "postgres";

interface AuthConfig {
  internalToken: string;
  databaseUrl: string;
  authSecret: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
}

// Session token cookie name used by better-auth
// May have __Secure- prefix in production
const SESSION_COOKIE_NAMES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
];

/**
 * Creates an auth middleware that handles both:
 * - Worker requests with internal token (bypasses session validation)
 * - Browser requests with session cookie (validates via direct DB lookup)
 */
export function createAuthMiddleware(config: AuthConfig) {
  const sql = postgres(config.databaseUrl, {
    max: 5, // Small pool for auth queries only
    idle_timeout: 30,
  });

  return async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header("Authorization");
    const storageKey = c.req.query("storageKey");

    if (!storageKey) {
      return c.json({ error: "Missing storageKey" }, 400);
    }

    // Check for internal worker token first
    if (authHeader === `Bearer ${config.internalToken}`) {
      // Worker request - allow access (internal network only)
      return next();
    }

    // Browser request - validate session via direct DB lookup
    const user = await validateSession(c.req.raw, sql, config.authSecret);

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Validate ownership - storageKey must contain user ID
    // StorageKey format: diarization/{userId}/... or clips/{userId}/...
    if (!storageKey.includes(user.id)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Attach user to context for downstream handlers
    c.set("user", user);

    return next();
  };
}

/**
 * Parse and verify session token from cookie header
 *
 * Cookie format: better-auth.session_token={token}.{signature}
 * The cookie is URL-encoded, signature is HMAC-SHA256 base64
 */
async function parseAndVerifySessionToken(
  cookieHeader: string | null,
  secret: string,
): Promise<string | null> {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c) => c.trim());

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=");
    if (!name || !SESSION_COOKIE_NAMES.includes(name)) continue;

    // URL decode the cookie value
    const rawValue = valueParts.join("=");
    const decoded = decodeURIComponent(rawValue);

    // Format is "token.signature"
    const dotIndex = decoded.lastIndexOf(".");
    if (dotIndex === -1) continue;

    const token = decoded.substring(0, dotIndex);
    const signature = decoded.substring(dotIndex + 1);

    // Verify HMAC-SHA256 signature
    const isValid = await verifySignature(token, signature, secret);
    if (isValid) {
      return token;
    }
  }

  return null;
}

/**
 * Verify HMAC-SHA256 signature
 * better-auth signs: HMAC-SHA256(token, secret) -> base64
 */
async function verifySignature(
  value: string,
  base64Signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    // Decode base64 signature to bytes
    const signatureBytes = Uint8Array.from(atob(base64Signature), (c) =>
      c.charCodeAt(0),
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(value),
    );
  } catch {
    return false;
  }
}

/**
 * Validate session by querying DB directly
 * Looks up session token and joins with user table
 */
async function validateSession(
  request: Request,
  sql: postgres.Sql,
  authSecret: string,
): Promise<User | null> {
  try {
    const cookieHeader = request.headers.get("Cookie");
    const sessionToken = await parseAndVerifySessionToken(
      cookieHeader,
      authSecret,
    );

    if (!sessionToken) {
      return null;
    }

    // Query session + user in one go
    const result = await sql<
      { userId: string; email: string; name: string | null }[]
    >`
      SELECT u.id as "userId", u.email, u.name
      FROM session s
      JOIN "user" u ON s.user_id = u.id
      WHERE s.token = ${sessionToken}
        AND s.expires_at > NOW()
      LIMIT 1
    `;

    const row = result[0];
    if (!row) {
      return null;
    }

    return {
      id: row.userId,
      email: row.email,
      name: row.name,
    };
  } catch (error) {
    console.error("[auth] Error validating session:", error);
    return null;
  }
}
