import { z } from "zod";
import { ApiAuthError, requireApiUser } from "@/lib/api-auth";
import { sendVarianceSms } from "@/lib/sms";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const schema = z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) });

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const { phone } = schema.parse(await request.json());
    const db = getSupabaseAdmin();
    const { data: variance } = await db.from("variances").select("id").eq("user_id", user.id).order("detected_at", { ascending: false }).limit(1).maybeSingle();
    const sid = await sendVarianceSms({
      to: phone,
      varianceCents: -4217,
      safeToSpendCents: 41800,
      transactionCount: 2,
      varianceId: variance?.id ?? "test",
    });
    return Response.json({ ok: true, sid });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : error instanceof z.ZodError ? 400 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to send test SMS" }, { status });
  }
}
