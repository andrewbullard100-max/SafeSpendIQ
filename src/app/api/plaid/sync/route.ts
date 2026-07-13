import { z } from "zod";
import { ApiAuthError, requireApiUser } from "@/lib/api-auth";
import { syncPlaidItemByItemId } from "@/lib/reconciliation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ item_id: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const { item_id } = schema.parse(await request.json());
    const { data } = await getSupabaseAdmin().from("plaid_items").select("user_id").eq("item_id", item_id).single();
    if (!data || data.user_id !== user.id) return Response.json({ error: "Not found" }, { status: 404 });
    const result = await syncPlaidItemByItemId(item_id, { notificationContext: "manual" });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : error instanceof z.ZodError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status });
  }
}
