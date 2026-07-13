import { addDays, toISODate } from "./finance";
import type { AppData } from "./types";

const today = new Date();
const nextFriday = addDays(today, (5 - today.getDay() + 7) % 7 || 7);
const uid = "demo-user";
const accountId = "demo-checking";

export const demoData: AppData = {
  profile: {
    user_id: uid,
    full_name: "Demo User",
    email: "demo@example.com",
    phone_e164: "+16155550123",
    sms_opt_in: true,
    sms_threshold_cents: 2500,
    sms_mode: "immediate",
    safe_spend_floor_cents: 20000,
    timezone: "America/Chicago",
  },
  accounts: [{
    id: accountId,
    user_id: uid,
    plaid_item_id: null,
    plaid_account_id: null,
    name: "Primary Checking",
    official_name: null,
    mask: "1234",
    subtype: "checking",
    current_balance_cents: 384600,
    available_balance_cents: 379600,
    baseline_balance_cents: 401900,
    baseline_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    is_primary: true,
  }],
  bills: [
    { id: "bill-1", user_id: uid, name: "Mortgage", amount_cents: 214500, due_day: 1, frequency: "monthly", category: "Housing", merchant_hint: "mortgage", active: true },
    { id: "bill-2", user_id: uid, name: "Car Payment", amount_cents: 68500, due_day: 14, frequency: "monthly", category: "Transportation", merchant_hint: "auto finance", active: true },
    { id: "bill-3", user_id: uid, name: "Electric", amount_cents: 18700, due_day: 18, frequency: "monthly", category: "Utilities", merchant_hint: "electric", active: true },
    { id: "bill-4", user_id: uid, name: "Phone", amount_cents: 14200, due_day: 22, frequency: "monthly", category: "Utilities", merchant_hint: "wireless", active: true },
  ],
  paydayRules: [{
    id: "pay-1",
    user_id: uid,
    cadence: "biweekly",
    next_payday: toISODate(nextFriday),
    expected_amount_cents: 310000,
    second_monthly_day: null,
    active: true,
  }],
  entries: [
    { id: "entry-1", user_id: uid, account_id: accountId, amount_cents: -8243, description: "Kroger", transaction_date: toISODate(addDays(today, -2)), source: "manual", status: "posted", documented: true, plaid_transaction_id: "demo-plaid-1", recurring_bill_id: null, notes: null },
    { id: "entry-2", user_id: uid, account_id: accountId, amount_cents: -4612, description: "Shell", transaction_date: toISODate(addDays(today, -1)), source: "manual", status: "posted", documented: true, plaid_transaction_id: "demo-plaid-2", recurring_bill_id: null, notes: null },
  ],
  plaidTransactions: [
    { id: "ptx-1", user_id: uid, account_id: accountId, plaid_transaction_id: "demo-plaid-1", merchant_name: "Kroger", name: "KROGER #523", amount_cents: 8243, signed_amount_cents: -8243, transaction_date: toISODate(addDays(today, -2)), pending: false, removed: false, documented: true, review_status: "matched", category_primary: "FOOD_AND_DRINK" },
    { id: "ptx-2", user_id: uid, account_id: accountId, plaid_transaction_id: "demo-plaid-2", merchant_name: "Shell", name: "SHELL OIL", amount_cents: 4612, signed_amount_cents: -4612, transaction_date: toISODate(addDays(today, -1)), pending: false, removed: false, documented: true, review_status: "matched", category_primary: "TRANSPORTATION" },
    { id: "ptx-3", user_id: uid, account_id: accountId, plaid_transaction_id: "demo-plaid-3", merchant_name: "Amazon", name: "AMZN Mktp US", amount_cents: 2999, signed_amount_cents: -2999, transaction_date: toISODate(today), pending: false, removed: false, documented: false, review_status: "needs_review", category_primary: "GENERAL_MERCHANDISE" },
    { id: "ptx-4", user_id: uid, account_id: accountId, plaid_transaction_id: "demo-plaid-4", merchant_name: "Dutch Bros", name: "DUTCH BROS COFFEE", amount_cents: 687, signed_amount_cents: -687, transaction_date: toISODate(today), pending: false, removed: false, documented: false, review_status: "needs_review", category_primary: "FOOD_AND_DRINK" },
  ],
};
