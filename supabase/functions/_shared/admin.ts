// Admin verification for the booking edge functions.
//
// Admins in this project log in with PHONE + password (Go auth / Supabase phone
// auth). Their Supabase JWT carries `phone` and `user_metadata.user_role` but an
// EMPTY email, so an email allowlist alone can never authorise them. The
// authoritative admin directory is the `Admin` table (phones flagged
// `is_admin` / `is_super_admin`) — the same source `create-admin-user` /
// `create-user` rely on.
//
// Verification therefore: (1) validates the JWT signature via GoTrue
// (`client.auth.getUser(token)`) — never trusting an unsigned payload, then
// (2) allows the request when the email is on the allowlist OR the user's phone
// resolves to an admin row.
//
// Pure helpers live here with NO external imports so the Node test harness can
// import this file directly (the async verifier takes the Supabase client as an
// argument instead of importing `serviceClient`).

export const ADMIN_EMAILS: ReadonlySet<string> = new Set([
  "admin@inlane.in",
  "ops@inlane.in",
  "support@inlane.in",
]);

export interface AdminRow {
  is_admin?: boolean | null;
  is_super_admin?: boolean | null;
}

export interface AuthUser {
  email?: string | null;
  phone?: string | null;
}

// Minimal structural type for the service client so this module stays free of
// the @supabase/supabase-js (esm.sh) import.
export interface AdminClient {
  auth: {
    getUser: (token: string) => Promise<{
      data: { user: AuthUser | null };
      error: unknown;
    }>;
  };
  from: (table: string) => {
    select: (columns: string) => {
      in: (
        column: string,
        values: string[],
      ) => Promise<{ data: AdminRow[] | null; error: unknown }>;
    };
  };
}

export type AdminDenyReason =
  | "missing_token"
  | "invalid_token"
  | "no_phone"
  | "not_admin";

export interface AdminCheck {
  ok: boolean;
  reason?: AdminDenyReason;
  email?: string | null;
  phone?: string | null;
}

export function normalizePhoneLast10(phone: unknown): string {
  return String(phone ?? "").replace(/\D/g, "").slice(-10);
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

/** Read a JWT claim without verifying the signature (do not trust for authz). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const parsed = JSON.parse(base64UrlDecode(parts[1]));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function isAdminRow(row: AdminRow | null | undefined): boolean {
  return row?.is_admin === true || row?.is_super_admin === true;
}

function isAllowedEmail(email: unknown): boolean {
  return (
    typeof email === "string" &&
    email.trim().length > 0 &&
    ADMIN_EMAILS.has(email.trim().toLowerCase())
  );
}

// Phone values in `Admin` are stored in mixed formats (raw 10-digit, 91XXXXXXXXXX,
// +91XXXXXXXXXX), so we look up every plausible spelling of the last 10 digits.
export function adminPhoneCandidates(phone: unknown): string[] {
  const last10 = normalizePhoneLast10(phone);
  if (last10.length !== 10) return [];
  return [last10, `91${last10}`, `+91${last10}`, `+${last10}`];
}

export async function verifyAdmin(
  req: Request,
  client: AdminClient,
): Promise<AdminCheck> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, reason: "missing_token" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, reason: "missing_token" };

  // Validate the JWT signature / expiry with GoTrue before trusting any claim.
  const { data, error } = await client.auth.getUser(token);
  const user = data?.user ?? null;
  if (error || !user) return { ok: false, reason: "invalid_token" };

  if (isAllowedEmail(user.email)) {
    return { ok: true, email: user.email ?? null, phone: user.phone ?? null };
  }

  const candidates = adminPhoneCandidates(user.phone);
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "no_phone",
      email: user.email ?? null,
      phone: user.phone ?? null,
    };
  }

  const { data: admins, error: adminError } = await client
    .from("Admin")
    .select("is_admin,is_super_admin")
    .in("phone", candidates);

  if (adminError || !admins || admins.length === 0) {
    return {
      ok: false,
      reason: "not_admin",
      email: user.email ?? null,
      phone: user.phone ?? null,
    };
  }

  const allowed = admins.some(isAdminRow);
  return allowed
    ? { ok: true, email: user.email ?? null, phone: user.phone ?? null }
    : {
        ok: false,
        reason: "not_admin",
        email: user.email ?? null,
        phone: user.phone ?? null,
      };
}
