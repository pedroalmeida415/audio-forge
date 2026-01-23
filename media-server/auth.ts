import type { Context, Next } from "hono";

interface AuthConfig {
  internalToken: string;
  nextAuthUrl: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface Session {
  user: User;
}

/**
 * Creates an auth middleware that handles both:
 * - Worker requests with internal token (bypasses session validation)
 * - Browser requests with session cookie (validates via Next.js auth endpoint)
 */
export function createAuthMiddleware(config: AuthConfig) {
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

    // Browser request - validate session via Next.js auth endpoint
    const session = await validateSession(c.req.raw, config.nextAuthUrl);

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Validate ownership - storageKey must contain user ID
    // StorageKey format: diarization/{userId}/... or clips/{userId}/...
    if (!storageKey.includes(session.user.id)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Attach user to context for downstream handlers
    c.set("user", session.user);

    return next();
  };
}

/**
 * Validate session by calling Next.js better-auth endpoint
 * Forwards cookies from the original request
 */
async function validateSession(
  request: Request,
  nextAuthUrl: string,
): Promise<Session | null> {
  try {
    // Forward cookies from the original request
    const cookie = request.headers.get("Cookie");

    const response = await fetch(`${nextAuthUrl}/api/auth/get-session`, {
      headers: {
        Cookie: cookie ?? "",
      },
    });

    if (!response.ok) {
      console.error(
        `[auth] Session validation failed: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();

    // better-auth returns { session, user } or null
    if (data?.user?.id) {
      return { user: data.user };
    }

    return null;
  } catch (error) {
    console.error("[auth] Error validating session:", error);
    return null;
  }
}
