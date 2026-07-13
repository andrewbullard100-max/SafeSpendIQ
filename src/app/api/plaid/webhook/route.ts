import { createHash } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { getPlaidClient } from "@/lib/plaid";
import { syncPlaidItemByItemId } from "@/lib/reconciliation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PlaidWebhookBody {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: { error_code?: string; error_message?: string } | null;
}

async function verifyWebhook(rawBody: string, verification: string | null): Promise<boolean> {
  if (process.env.PLAID_ENV === "sandbox" && !verification) return true;
  if (!verification) return false;
  const header = decodeProtectedHeader(verification);
  if (!header.kid || header.alg !== "ES256") return false;
  const response = await getPlaidClient().webhookVerificationKeyGet({ key_id: header.kid });
  const key = await importJWK(response.data.key as JWK, "ES256");
  const result = await jwtVerify(verification, key, { algorithms: ["ES256"] });
  const expectedHash = createHash("sha256").update(rawBody).digest("hex");
  const bodyHash = result.payload.request_body_sha256;
  const issuedAt = result.payload.iat;
  const fresh = typeof issuedAt === "number" && Math.abs(Date.now() / 1000 - issuedAt) <= 300;
  return fresh && bodyHash === expectedHash;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const valid = await verifyWebhook(rawBody, request.headers.get("plaid-verification"));
    if (!valid) return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
    const body = JSON.parse(rawBody) as PlaidWebhookBody;
    if (!body.item_id) return Response.json({ ok: true });

    if (body.webhook_type === "TRANSACTIONS" && ["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "TRANSACTIONS_REMOVED"].includes(body.webhook_code ?? "")) {
      await syncPlaidItemByItemId(body.item_id, { notificationContext: "event" });
    } else if (body.webhook_type === "ITEM" && body.webhook_code === "ERROR") {
      await getSupabaseAdmin().from("plaid_items").update({
        status: "error",
        last_error: body.error?.error_message ?? body.error?.error_code ?? "Plaid Item error",
      }).eq("item_id", body.item_id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Plaid webhook error", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
