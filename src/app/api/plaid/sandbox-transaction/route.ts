import { z } from "zod";
import { ApiAuthError, requireApiUser } from "@/lib/api-auth";
import { decryptSecret } from "@/lib/crypto";
import { getPlaidClient } from "@/lib/plaid";
import { syncPlaidItemByItemId } from "@/lib/reconciliation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  amount: z.number().positive().max(10000).default(42.17),
  description: z.string().min(2).max(100).default("SafeSpend undocumented test purchase"),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    if ((process.env.PLAID_ENV ?? "sandbox") !== "sandbox") {
      return Response.json({ error: "Sandbox tools are disabled outside Plaid Sandbox" }, { status: 403 });
    }
    const body = schema.parse(await request.json().catch(() => ({})));
    const db = getSupabaseAdmin();
    const { data: item, error } = await db.from("plaid_items")
      .select("item_id, access_token_ciphertext")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !item) return Response.json({ error: "Connect a Plaid Sandbox account first" }, { status: 404 });

    const today = new Date().toISOString().slice(0, 10);
    await getPlaidClient().sandboxTransactionsCreate({
      access_token: decryptSecret(item.access_token_ciphertext),
      transactions: [{
        date_transacted: today,
        date_posted: today,
        amount: body.amount,
        description: body.description,
        iso_currency_code: "USD",
      }],
    });

    const sync = await syncPlaidItemByItemId(item.item_id, { notificationContext: "manual" });
    return Response.json({ ok: true, sync });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : error instanceof z.ZodError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create Sandbox transaction" }, { status });
  }
}
