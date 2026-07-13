import { z } from "zod";
import { ApiAuthError, requireApiUser } from "@/lib/api-auth";
import { encryptSecret } from "@/lib/crypto";
import { getPlaidClient } from "@/lib/plaid";
import { syncPlaidItemByItemId } from "@/lib/reconciliation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  public_token: z.string().min(1),
  institution_name: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = schema.parse(await request.json());
    const exchange = await getPlaidClient().itemPublicTokenExchange({ public_token: body.public_token });
    const db = getSupabaseAdmin();
    const { data: item, error } = await db.from("plaid_items").upsert({
      user_id: user.id,
      item_id: exchange.data.item_id,
      access_token_ciphertext: encryptSecret(exchange.data.access_token),
      institution_name: body.institution_name ?? null,
      status: "active",
    }, { onConflict: "item_id" }).select("id").single();
    if (error) throw error;

    const result = await syncPlaidItemByItemId(exchange.data.item_id, { notificationContext: "manual" });
    return Response.json({ ok: true, plaid_item_id: item.id, sync: result });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : error instanceof z.ZodError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to connect bank" }, { status });
  }
}
