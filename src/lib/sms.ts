import "server-only";

import twilio from "twilio";
import { publicAppUrl, requireEnv } from "./env";
import { money } from "./finance";

export interface VarianceAlertInput {
  to: string;
  varianceCents: number;
  safeToSpendCents: number;
  transactionCount: number;
  varianceId: string;
}

export async function sendVarianceSms(input: VarianceAlertInput): Promise<string> {
  const client = twilio(requireEnv("TWILIO_ACCOUNT_SID"), requireEnv("TWILIO_AUTH_TOKEN"));
  const unexplained = money(Math.abs(input.varianceCents));
  const direction = input.varianceCents < 0 ? "lower" : "higher";
  const body = [
    `SafeSpend alert: Your bank balance is ${unexplained} ${direction} than your documented register.`,
    `${input.transactionCount} transaction${input.transactionCount === 1 ? " needs" : "s need"} review.`,
    `Safe to spend: ${money(input.safeToSpendCents)}.`,
    `${publicAppUrl()}/app?tab=review&variance=${encodeURIComponent(input.varianceId)}`,
    "Reply STOP to opt out.",
  ].join(" ");

  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!messagingServiceSid && !from) throw new Error("Configure TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER");

  const message = await client.messages.create({
    to: input.to,
    body,
    statusCallback: `${publicAppUrl()}/api/twilio/status`,
    ...(messagingServiceSid ? { messagingServiceSid } : { from }),
  });
  return message.sid;
}

export async function sendFallbackEmail(args: {
  to: string;
  varianceCents: number;
  safeToSpendCents: number;
  varianceId: string;
}): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: `SafeSpend variance: ${money(Math.abs(args.varianceCents))}`,
      html: `<p>Your actual bank balance differs from your documented register by <strong>${money(Math.abs(args.varianceCents))}</strong>.</p><p>Your estimated safe-to-spend amount is <strong>${money(args.safeToSpendCents)}</strong>.</p><p><a href="${publicAppUrl()}/app?tab=review&variance=${encodeURIComponent(args.varianceId)}">Review transactions</a></p>`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  const data = await response.json() as { id?: string };
  return data.id ?? null;
}
