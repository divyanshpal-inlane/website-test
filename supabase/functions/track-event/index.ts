// Public funnel event sink.
//
// A browser may report the client-allowed half of the canonical PRD §4
// taxonomy. It may NOT:
//   * emit a server-only event (`lead_captured`, payment/booking/supply/
//     priority events) — those are rejected with 403;
//   * supply a `lead_id` — the lead is always resolved server-side from the
//     session, and only `capture-lead` may set it;
//   * set the lead state or the prioritisation tier — both are recomputed
//     server-side on every event.
//
// Request body (single event):
//   {
//     "event_name": "home_viewed",
//     "client_session_id": "<uuid v4>",
//     "client_event_id": "<deterministic idempotency key>",
//     "occurred_at": "2026-10-21T10:00:00.000Z",   // optional, clamped
//     "page_path": "/",                            // query string stripped
//     "properties": { ... },                       // allowlisted per event
//     "correlation_id": "<uuid>",                  // optional
//     "attribution": { "utm_source": "...", ... }  // allowlisted
//   }
//
// Request body (batch, max 10):
//   { "events": [ { ... }, { ... } ] }
//
// Response: { ok, recorded, duplicate }  (200) — `duplicate: true` means the
// event was already stored (a retry or a double render), NOT an error.
//
// Rate limits: 60 events / 10 min per session and 300 events / 10 min per
// hashed IP. Exceeding either returns 429.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { extractClientIp, handleClientEvent } from "../_shared/funnelEvents.ts";
import {
  EVENT_IP_RATE_LIMIT_MAX,
  EVENT_IP_RATE_LIMIT_WINDOW_MS,
  EVENT_RATE_LIMIT_MAX,
  EVENT_RATE_LIMIT_WINDOW_MS,
} from "../_shared/funnelTaxonomy.ts";

const MAX_BATCH = 10;

interface RawEvent {
  event_name?: unknown;
  client_session_id?: unknown;
  client_event_id?: unknown;
  occurred_at?: unknown;
  page_path?: unknown;
  properties?: unknown;
  correlation_id?: unknown;
  attribution?: unknown;
}

function parseBody(raw: string): unknown {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeEvent(input: unknown): RawEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  return {
    event_name: obj.event_name ?? obj.eventName,
    client_session_id: obj.client_session_id ?? obj.clientSessionId,
    client_event_id: obj.client_event_id ?? obj.clientEventId,
    occurred_at: obj.occurred_at ?? obj.occurredAt,
    page_path: obj.page_path ?? obj.pagePath,
    properties: obj.properties,
    correlation_id: obj.correlation_id ?? obj.correlationId,
    attribution: obj.attribution,
  };
}

serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(
      { error: { code: "method_not_allowed", message: "Use POST." } },
      405,
    );
  }

  let body: unknown;
  try {
    body = parseBody(await req.text());
  } catch {
    return jsonResponse(
      { error: { code: "validation_error", message: "Could not read the request body." } },
      400,
    );
  }

  if (body === null) {
    return jsonResponse(
      { error: { code: "validation_error", message: "Malformed JSON body." } },
      422,
    );
  }

  // Normalise into a list of raw events.
  const rawEvents: RawEvent[] = [];
  if (body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)) {
    const list = (body as { events: unknown[] }).events;
    if (list.length > MAX_BATCH) {
      return jsonResponse(
        {
          error: {
            code: "validation_error",
            message: `At most ${MAX_BATCH} events per request.`,
          },
        },
        422,
      );
    }
    for (const entry of list) {
      const normalized = normalizeEvent(entry);
      if (normalized) rawEvents.push(normalized);
    }
  } else {
    const normalized = normalizeEvent(body);
    if (normalized) rawEvents.push(normalized);
  }

  if (rawEvents.length === 0) {
    return jsonResponse(
      { error: { code: "validation_error", message: "No event supplied." } },
      422,
    );
  }

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error("track-event: service_client_failed", error?.message ?? error);
    return jsonResponse(
      { error: { code: "internal", message: "Could not record the event." } },
      500,
    );
  }

  const clientIp = extractClientIp(req);
  const userAgent = req.headers.get("user-agent");

  const results: Array<{ ok: boolean; recorded?: boolean; duplicate?: boolean; error?: unknown }> = [];

  for (const raw of rawEvents) {
    const outcome = await handleClientEvent(
      client as never,
      {
        eventName: raw.event_name,
        clientSessionId: raw.client_session_id,
        clientEventId: raw.client_event_id,
        occurredAt: raw.occurred_at,
        pagePath: raw.page_path,
        properties: raw.properties,
        correlationId: raw.correlation_id,
        attribution: raw.attribution,
        userAgent,
      },
      {
        sessionLimit: EVENT_RATE_LIMIT_MAX,
        sessionWindowMs: EVENT_RATE_LIMIT_WINDOW_MS,
        ipLimit: EVENT_IP_RATE_LIMIT_MAX,
        ipWindowMs: EVENT_IP_RATE_LIMIT_WINDOW_MS,
        durableIpLimit: EVENT_IP_RATE_LIMIT_MAX,
        durableIpWindowMs: EVENT_IP_RATE_LIMIT_WINDOW_MS,
        clientIp,
      },
    );

    results.push({
      ok: outcome.ok,
      recorded: outcome.body?.recorded as boolean | undefined,
      duplicate: outcome.body?.duplicate as boolean | undefined,
      error: outcome.ok ? undefined : outcome.body?.error,
    });

    // A hard rejection (unknown / server-only / malformed / rate limit) stops
    // the batch — the client will retry the whole thing.
    if (!outcome.ok && outcome.status !== 200) {
      return jsonResponse(outcome.body, outcome.status);
    }
  }

  const recorded = results.filter((r) => r.recorded === true).length;
  const duplicates = results.filter((r) => r.duplicate === true).length;

  return jsonResponse({
    ok: true,
    recorded,
    duplicates,
    accepted: results.length,
  });
});
