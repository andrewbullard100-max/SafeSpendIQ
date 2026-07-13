import "server-only";

import { createHash } from "node:crypto";
import type { Transaction } from "plaid";
import { decryptSecret } from "./crypto";
import { clearedRegisterBalance, currentReservedBills } from "./finance";
import { getPlaidClient } from "./plaid";
import { sendFallbackEmail, sendVarianceSms } from "./sms";
import { getSupabaseAdmin } from "./supabase-admin";
import type { BankAccount, PaydayRule, Profile, RecurringBill, RegisterEntry } from "./types";

interface PlaidItemRow {
  id: string;
  user_id: string;
  item_id: string;
  access_token_ciphertext: string;
  cursor: string | null;
  initial_sync_complete: boolean;
  status: string;
}

interface SyncOptions {
  notificationContext?: "event" | "daily" | "manual";
}

const cents = (amount: number) => Math.round(amount * 100);
const signedPlaidAmount = (amount: number) => -cents(amount);

function merchantText(transaction: Transaction): string {
  return (transaction.merchant_name ?? transaction.name ?? "Bank transaction").trim();
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function daysApart(a: string, b: string): number {
  const aDate = new Date(`${a}T12:00:00`);
  const bDate = new Date(`${b}T12:00:00`);
  return Math.abs(aDate.getTime() - bDate.getTime()) / 86_400_000;
}

function dayOfMonthDistance(dayA: number, dayB: number): number {
  return Math.min(Math.abs(dayA - dayB), 31 - Math.abs(dayA - dayB));
}

async function findMatch(args: {
  userId: string;
  accountId: string;
  transaction: Transaction;
}): Promise<{ kind: "manual"; entryId: string } | { kind: "bill"; billId: string } | { kind: "paycheck" } | null> {
  const db = getSupabaseAdmin();
  const signedAmount = signedPlaidAmount(args.transaction.amount);
  const amountTolerance = Math.max(2, Math.round(Math.abs(signedAmount) * 0.01));

  const { data: manualEntries } = await db
    .from("register_entries")
    .select("id, amount_cents, transaction_date, description")
    .eq("user_id", args.userId)
    .eq("account_id", args.accountId)
    .is("plaid_transaction_id", null)
    .gte("transaction_date", new Date(new Date(`${args.transaction.date}T12:00:00`).getTime() - 4 * 86_400_000).toISOString().slice(0, 10))
    .lte("transaction_date", new Date(new Date(`${args.transaction.date}T12:00:00`).getTime() + 4 * 86_400_000).toISOString().slice(0, 10));

  const manualMatch = (manualEntries ?? []).find((entry) =>
    Math.abs(entry.amount_cents - signedAmount) <= amountTolerance && daysApart(entry.transaction_date, args.transaction.date) <= 3,
  );
  if (manualMatch) return { kind: "manual", entryId: manualMatch.id };

  if (signedAmount < 0) {
    const { data: bills } = await db
      .from("recurring_bills")
      .select("id, name, amount_cents, due_day, merchant_hint")
      .eq("user_id", args.userId)
      .eq("active", true);

    const txText = normalized(`${args.transaction.merchant_name ?? ""} ${args.transaction.name}`);
    const txDay = Number(args.transaction.date.slice(8, 10));
    const billMatch = (bills ?? []).find((bill) => {
      const tolerance = Math.max(500, Math.round(bill.amount_cents * 0.08));
      const amountFits = Math.abs(bill.amount_cents - Math.abs(signedAmount)) <= tolerance;
      const dateFits = dayOfMonthDistance(bill.due_day, txDay) <= 7;
      const hint = normalized(bill.merchant_hint || bill.name);
      const nameFits = hint.length < 3 || hint.split(" ").some((token: string) => token.length > 2 && txText.includes(token));
      return amountFits && dateFits && nameFits;
    });
    if (billMatch) return { kind: "bill", billId: billMatch.id };
  }

  if (signedAmount > 0) {
    const { data: payRules } = await db
      .from("payday_rules")
      .select("expected_amount_cents")
      .eq("user_id", args.userId)
      .eq("active", true);
    const paycheck = (payRules ?? []).some((rule) => {
      const tolerance = Math.max(1000, Math.round(rule.expected_amount_cents * 0.1));
      return Math.abs(rule.expected_amount_cents - signedAmount) <= tolerance;
    });
    if (paycheck) return { kind: "paycheck" };
  }

  return null;
}

async function processTransaction(args: {
  item: PlaidItemRow;
  accountId: string;
  transaction: Transaction;
  initialSync: boolean;
}): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("plaid_transactions")
    .select("documented, review_status")
    .eq("plaid_transaction_id", args.transaction.transaction_id)
    .maybeSingle();

  let documented = existing?.documented ?? args.initialSync;
  let reviewStatus = existing?.review_status ?? (args.initialSync ? "historical" : "needs_review");
  let match: Awaited<ReturnType<typeof findMatch>> = null;

  if (!args.initialSync && !documented) {
    match = await findMatch({
      userId: args.item.user_id,
      accountId: args.accountId,
      transaction: args.transaction,
    });
    if (match) {
      documented = true;
      reviewStatus = "matched";
    }
  }

  const categoryPrimary = args.transaction.personal_finance_category?.primary ?? null;
  const signedAmount = signedPlaidAmount(args.transaction.amount);

  const { error: txError } = await db.from("plaid_transactions").upsert({
    user_id: args.item.user_id,
    account_id: args.accountId,
    plaid_transaction_id: args.transaction.transaction_id,
    merchant_name: args.transaction.merchant_name ?? null,
    name: args.transaction.name,
    amount_cents: cents(args.transaction.amount),
    signed_amount_cents: signedAmount,
    transaction_date: args.transaction.date,
    authorized_date: args.transaction.authorized_date ?? null,
    pending: args.transaction.pending,
    pending_transaction_id: args.transaction.pending_transaction_id,
    removed: false,
    documented,
    review_status: reviewStatus,
    category_primary: categoryPrimary,
    raw: args.transaction,
    updated_at: new Date().toISOString(),
  }, { onConflict: "plaid_transaction_id" });
  if (txError) throw txError;

  if (!match) return;

  if (match.kind === "manual") {
    const { error } = await db.from("register_entries").update({
      plaid_transaction_id: args.transaction.transaction_id,
      status: args.transaction.pending ? "pending" : "posted",
      documented: true,
    }).eq("id", match.entryId);
    if (error) throw error;
    return;
  }

  const { error } = await db.from("register_entries").upsert({
    user_id: args.item.user_id,
    account_id: args.accountId,
    amount_cents: signedAmount,
    description: merchantText(args.transaction),
    transaction_date: args.transaction.date,
    source: match.kind === "bill" ? "recurring_bill" : "paycheck",
    status: args.transaction.pending ? "pending" : "posted",
    documented: true,
    plaid_transaction_id: args.transaction.transaction_id,
    recurring_bill_id: match.kind === "bill" ? match.billId : null,
  }, { onConflict: "plaid_transaction_id" });
  if (error) throw error;
}

async function updateAccountBalances(item: PlaidItemRow, accessToken: string): Promise<Map<string, string>> {
  const db = getSupabaseAdmin();
  const response = await getPlaidClient().accountsGet({ access_token: accessToken });
  const now = new Date().toISOString();

  for (const account of response.data.accounts) {
    const current = cents(account.balances.current ?? 0);
    const available = account.balances.available == null ? null : cents(account.balances.available);
    const payload: Record<string, unknown> = {
      user_id: item.user_id,
      plaid_item_id: item.id,
      plaid_account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      mask: account.mask,
      subtype: String(account.subtype ?? ""),
      current_balance_cents: current,
      available_balance_cents: available,
      last_synced_at: now,
    };
    if (!item.initial_sync_complete) {
      payload.baseline_balance_cents = current;
      payload.baseline_at = now;
    }
    const { error } = await db.from("accounts").upsert(payload, { onConflict: "plaid_account_id" });
    if (error) throw error;
  }

  const { data: rows, error } = await db
    .from("accounts")
    .select("id, plaid_account_id, is_primary")
    .eq("plaid_item_id", item.id);
  if (error) throw error;
  if (rows?.length && !rows.some((row) => row.is_primary)) {
    await db.from("accounts").update({ is_primary: true }).eq("id", rows[0].id);
  }
  return new Map((rows ?? []).map((row) => [row.plaid_account_id, row.id]));
}

async function reconcileAndNotify(userId: string, accountId: string, context: NonNullable<SyncOptions["notificationContext"]>): Promise<void> {
  const db = getSupabaseAdmin();
  const [accountResult, entriesResult, txResult, billResult, payResult, profileResult] = await Promise.all([
    db.from("accounts").select("*").eq("id", accountId).single(),
    db.from("register_entries").select("*").eq("account_id", accountId),
    db.from("plaid_transactions").select("plaid_transaction_id, signed_amount_cents").eq("account_id", accountId).eq("pending", false).eq("removed", false).eq("documented", false).eq("review_status", "needs_review"),
    db.from("recurring_bills").select("*").eq("user_id", userId).eq("active", true),
    db.from("payday_rules").select("*").eq("user_id", userId).eq("active", true).limit(1),
    db.from("profiles").select("*").eq("user_id", userId).single(),
  ]);
  if (accountResult.error) throw accountResult.error;
  if (entriesResult.error) throw entriesResult.error;
  if (txResult.error) throw txResult.error;
  if (profileResult.error) throw profileResult.error;

  const account = accountResult.data as BankAccount;
  const entries = (entriesResult.data ?? []) as RegisterEntry[];
  const profile = profileResult.data as Profile;
  const bills = (billResult.data ?? []) as RecurringBill[];
  const payRule = (payResult.data?.[0] as PaydayRule | undefined);
  const registerBalance = clearedRegisterBalance(account, entries);
  const varianceCents = account.current_balance_cents - registerBalance;
  const reservedCents = currentReservedBills(bills, payRule);
  const safeToSpendCents = (account.available_balance_cents ?? account.current_balance_cents) - reservedCents - profile.safe_spend_floor_cents;
  const transactionIds = (txResult.data ?? []).map((tx) => tx.plaid_transaction_id).sort();

  if (transactionIds.length === 0 || Math.abs(varianceCents) < 100) {
    await db.from("variances").update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("account_id", accountId).eq("status", "open");
    return;
  }

  const fingerprint = createHash("sha256")
    .update(`${accountId}:${transactionIds.join(",")}:${varianceCents}`)
    .digest("hex");

  const { data: variance, error: varianceError } = await db.from("variances").upsert({
    user_id: userId,
    account_id: accountId,
    actual_balance_cents: account.current_balance_cents,
    register_balance_cents: registerBalance,
    variance_cents: varianceCents,
    safe_to_spend_cents: safeToSpendCents,
    transaction_ids: transactionIds,
    fingerprint,
    status: "open",
    detected_at: new Date().toISOString(),
  }, { onConflict: "fingerprint" }).select("id").single();
  if (varianceError) throw varianceError;

  const { data: existingNotification } = await db
    .from("notification_log")
    .select("id")
    .eq("variance_id", variance.id)
    .eq("channel", "sms")
    .in("status", ["queued", "sent", "delivered"])
    .maybeSingle();
  if (existingNotification) return;

  const meetsThreshold = Math.abs(varianceCents) >= profile.sms_threshold_cents;
  const contextMatches = profile.sms_mode === "immediate"
    ? context !== "daily"
    : profile.sms_mode === "daily"
      ? context === "daily"
      : safeToSpendCents < 0 || Math.abs(varianceCents) >= profile.sms_threshold_cents * 2;

  if (!profile.sms_opt_in || !profile.phone_e164 || !meetsThreshold || !contextMatches) return;

  try {
    const sid = await sendVarianceSms({
      to: profile.phone_e164,
      varianceCents,
      safeToSpendCents,
      transactionCount: transactionIds.length,
      varianceId: variance.id,
    });
    await db.from("notification_log").insert({
      user_id: userId,
      variance_id: variance.id,
      channel: "sms",
      provider_id: sid,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    await db.from("notification_log").insert({
      user_id: userId,
      variance_id: variance.id,
      channel: "sms",
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown SMS error",
    });
    if (profile.email) {
      const emailId = await sendFallbackEmail({
        to: profile.email,
        varianceCents,
        safeToSpendCents,
        varianceId: variance.id,
      }).catch(() => null);
      if (emailId) {
        await db.from("notification_log").insert({
          user_id: userId,
          variance_id: variance.id,
          channel: "email",
          provider_id: emailId,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      }
    }
  }
}

export async function syncPlaidItemByItemId(itemId: string, options: SyncOptions = {}): Promise<{ added: number; modified: number; removed: number }> {
  const db = getSupabaseAdmin();
  const { data: item, error: itemError } = await db.from("plaid_items").select("*").eq("item_id", itemId).single();
  if (itemError) throw itemError;
  const typedItem = item as PlaidItemRow;
  const accessToken = decryptSecret(typedItem.access_token_ciphertext);
  const accountMap = await updateAccountBalances(typedItem, accessToken);

  let cursor = typedItem.cursor ?? undefined;
  let hasMore = true;
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  while (hasMore) {
    const response = await getPlaidClient().transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,
      options: { include_personal_finance_category: true },
    });
    const payload = response.data;

    for (const transaction of [...payload.added, ...payload.modified]) {
      const accountId = accountMap.get(transaction.account_id);
      if (!accountId) continue;
      await processTransaction({
        item: typedItem,
        accountId,
        transaction,
        initialSync: !typedItem.initial_sync_complete,
      });
    }

    for (const removed of payload.removed) {
      const { data: prior } = await db.from("plaid_transactions")
        .select("account_id")
        .eq("plaid_transaction_id", removed.transaction_id)
        .maybeSingle();
      await db.from("plaid_transactions").update({ removed: true, updated_at: new Date().toISOString() })
        .eq("plaid_transaction_id", removed.transaction_id);
      await db.from("register_entries").delete().eq("plaid_transaction_id", removed.transaction_id).eq("source", "plaid");
      if (prior?.account_id) await reconcileAndNotify(typedItem.user_id, prior.account_id, options.notificationContext ?? "event");
    }

    addedCount += payload.added.length;
    modifiedCount += payload.modified.length;
    removedCount += payload.removed.length;
    cursor = payload.next_cursor;
    hasMore = payload.has_more;
  }

  const { error: updateError } = await db.from("plaid_items").update({
    cursor: cursor ?? null,
    initial_sync_complete: true,
    status: "active",
    last_synced_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", typedItem.id);
  if (updateError) throw updateError;

  if (typedItem.initial_sync_complete) {
    for (const accountId of accountMap.values()) {
      await reconcileAndNotify(typedItem.user_id, accountId, options.notificationContext ?? "event");
    }
  }

  return { added: addedCount, modified: modifiedCount, removed: removedCount };
}

export async function syncAllPlaidItems(context: "daily" | "manual" = "daily"): Promise<{ synced: number; failed: number }> {
  const db = getSupabaseAdmin();
  const { data: items, error } = await db.from("plaid_items").select("item_id").eq("status", "active");
  if (error) throw error;
  let synced = 0;
  let failed = 0;
  for (const item of items ?? []) {
    try {
      await syncPlaidItemByItemId(item.item_id, { notificationContext: context });
      synced += 1;
    } catch (syncError) {
      failed += 1;
      await db.from("plaid_items").update({
        last_error: syncError instanceof Error ? syncError.message : "Unknown sync error",
      }).eq("item_id", item.item_id);
    }
  }
  return { synced, failed };
}
