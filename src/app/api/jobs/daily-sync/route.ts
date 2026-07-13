import { syncAllPlaidItems } from "@/lib/reconciliation";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncAllPlaidItems("daily");
  return Response.json({ ok: true, ...result });
}
