import type { Config } from "@netlify/functions";

const dailySync = async () => {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response("Missing configuration", { status: 500 });
  return fetch(`${base.replace(/\/$/, "")}/api/jobs/daily-sync`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
};

export default dailySync;

export const config: Config = { schedule: "0 13 * * *" };
