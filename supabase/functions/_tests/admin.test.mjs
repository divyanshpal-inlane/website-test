import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhoneLast10,
  decodeJwtPayload,
  isAdminRow,
  adminPhoneCandidates,
  verifyAdmin,
  ADMIN_EMAILS,
} from "../_shared/admin.ts";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function jwt(payload, header = { alg: "HS256", typ: "JWT" }) {
  return `${b64url(header)}.${b64url(payload)}.signature`;
}

function req(token) {
  const headers = new Headers();
  if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://example.test/review-booking", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "list" }),
  });
}

// ── normalizePhoneLast10 ────────────────────────────────────────────────────
test("normalizePhoneLast10 keeps the final 10 digits across formats", () => {
  assert.equal(normalizePhoneLast10("+91 70063 42430"), "7006342430");
  assert.equal(normalizePhoneLast10("917006342430"), "7006342430");
  assert.equal(normalizePhoneLast10(7006342430), "7006342430");
  assert.equal(normalizePhoneLast10("7006342430"), "7006342430");
  assert.equal(normalizePhoneLast10(""), "");
  assert.equal(normalizePhoneLast10(null), "");
  assert.equal(normalizePhoneLast10(undefined), "");
});

// ── decodeJwtPayload ────────────────────────────────────────────────────────
test("decodeJwtPayload reads base64url claims (with - and _ chars)", () => {
  const token = jwt({
    email: "ops@inlane.in",
    phone: "7006342430",
    user_role: "admin",
    sub: "abc-_-zz~",
  });
  const payload = decodeJwtPayload(token);
  assert.equal(payload.email, "ops@inlane.in");
  assert.equal(payload.phone, "7006342430");
  assert.equal(payload.user_role, "admin");
});

test("decodeJwtPayload returns null for malformed tokens", () => {
  assert.equal(decodeJwtPayload("not-a-jwt"), null);
  assert.equal(decodeJwtPayload(""), null);
  assert.equal(decodeJwtPayload("a.b"), null);
});

// ── isAdminRow ──────────────────────────────────────────────────────────────
test("isAdminRow accepts either admin flag and rejects everything else", () => {
  assert.equal(isAdminRow({ is_admin: true }), true);
  assert.equal(isAdminRow({ is_super_admin: true }), true);
  assert.equal(isAdminRow({ is_admin: false, is_super_admin: false }), false);
  assert.equal(isAdminRow({ is_admin: "true" }), false);
  assert.equal(isAdminRow(null), false);
  assert.equal(isAdminRow(undefined), false);
  assert.equal(isAdminRow({}), false);
});

// ── adminPhoneCandidates ────────────────────────────────────────────────────
test("adminPhoneCandidates lists every stored spelling of the last 10 digits", () => {
  assert.deepEqual(adminPhoneCandidates("+917006342430"), [
    "7006342430",
    "917006342430",
    "+917006342430",
    "+7006342430",
  ]);
  assert.deepEqual(adminPhoneCandidates("7006342430"), [
    "7006342430",
    "917006342430",
    "+917006342430",
    "+7006342430",
  ]);
  assert.deepEqual(adminPhoneCandidates("12345"), []);
  assert.deepEqual(adminPhoneCandidates(null), []);
});

// ── verifyAdmin ─────────────────────────────────────────────────────────────
function mockClient({ user, userError = null, adminRows = [], adminError = null }) {
  const calls = { getUser: 0, from: 0, inArgs: null };
  const client = {
    auth: {
      getUser: async () => {
        calls.getUser++;
        return { data: { user }, error: userError };
      },
    },
    from: () => ({
      select: () => ({
        in: async (column, values) => {
          calls.from++;
          calls.inArgs = { column, values };
          return { data: adminRows, error: adminError };
        },
      }),
    }),
  };
  return { client, calls };
}

test("verifyAdmin rejects a request with no Authorization header", async () => {
  const { client } = mockClient({ user: { phone: "7006342430" } });
  const res = await verifyAdmin(req(undefined), client);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "missing_token");
});

test("verifyAdmin rejects an invalid/expired JWT (getUser error)", async () => {
  const { client } = mockClient({
    user: null,
    userError: { message: "invalid" },
  });
  const res = await verifyAdmin(req(jwt({ phone: "7006342430" })), client);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "invalid_token");
});

test("verifyAdmin allows an email on the allowlist (no Admin lookup)", async () => {
  const { client, calls } = mockClient({
    user: { email: "OPS@inlane.in", phone: "7006342430" },
  });
  const res = await verifyAdmin(req(jwt({ email: "OPS@inlane.in" })), client);
  assert.equal(res.ok, true);
  assert.equal(calls.from, 0);
  assert.ok(ADMIN_EMAILS.has("ops@inlane.in"));
});

test("verifyAdmin allows a phone-auth admin found in the Admin table", async () => {
  const { client, calls } = mockClient({
    user: { email: "", phone: "7006342430" },
    adminRows: [{ is_admin: true, is_super_admin: false }],
  });
  const res = await verifyAdmin(req(jwt({ phone: "7006342430" })), client);
  assert.equal(res.ok, true);
  assert.equal(calls.from, 1);
  assert.equal(calls.inArgs.column, "phone");
  assert.deepEqual(calls.inArgs.values, [
    "7006342430",
    "917006342430",
    "+917006342430",
    "+7006342430",
  ]);
});

test("verifyAdmin rejects a signed-in non-admin phone", async () => {
  const { client } = mockClient({
    user: { email: "", phone: "9999999999" },
    adminRows: [],
  });
  const res = await verifyAdmin(req(jwt({ phone: "9999999999" })), client);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "not_admin");
});

test("verifyAdmin rejects an Admin row without an admin flag", async () => {
  const { client } = mockClient({
    user: { email: "", phone: "7006342430" },
    adminRows: [{ is_admin: false, is_super_admin: false }],
  });
  const res = await verifyAdmin(req(jwt({ phone: "7006342430" })), client);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "not_admin");
});

test("verifyAdmin rejects a user with neither email nor phone", async () => {
  const { client } = mockClient({ user: { email: "", phone: "" } });
  const res = await verifyAdmin(req(jwt({})), client);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "no_phone");
});

test("verifyAdmin does not trust an unsigned payload claim on its own", async () => {
  // Email allowlist is applied to the GoTrue-verified user, not the raw token.
  const { client } = mockClient({
    user: { email: "someone@example.com", phone: "7006342430" },
    adminRows: [],
  });
  const res = await verifyAdmin(
    req(jwt({ email: "admin@inlane.in", phone: "7006342430" })),
    client,
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, "not_admin");
});
