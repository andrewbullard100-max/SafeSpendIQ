import twilio from "twilio";
import { publicAppUrl } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const params = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !twilio.validateRequest(token, signature, `${publicAppUrl()}/api/twilio/status`, params)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sid = params.MessageSid;
  const status = params.MessageStatus;
  if (sid && status) {
    await getSupabaseAdmin().from("notification_log").update({ status, updated_at: new Date().toISOString() }).eq("provider_id", sid);
  }
  return new Response("OK");
}
