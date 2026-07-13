import { describe, expect, it } from "vitest";
import { accountVariance, assignBillsToPaydays, clearedRegisterBalance, nextPaydays, safeToSpend } from "./finance";
import type { BankAccount, PaydayRule, RecurringBill, RegisterEntry } from "./types";

const rule: PaydayRule = { id: "p", user_id: "u", cadence: "biweekly", next_payday: "2099-01-02", expected_amount_cents: 300000, second_monthly_day: null, active: true };
const account: BankAccount = { id: "a", user_id: "u", plaid_item_id: null, plaid_account_id: null, name: "Checking", official_name: null, mask: null, subtype: "checking", current_balance_cents: 90000, available_balance_cents: 85000, baseline_balance_cents: 100000, baseline_at: "2099-01-01T00:00:00Z", last_synced_at: null, is_primary: true };
const entries: RegisterEntry[] = [{ id: "e", user_id: "u", account_id: "a", amount_cents: -5000, description: "Known", transaction_date: "2099-01-02", source: "manual", status: "posted", documented: true, plaid_transaction_id: null, recurring_bill_id: null, notes: null }];
const bill: RecurringBill = { id: "b", user_id: "u", name: "Phone", amount_cents: 15000, due_day: 10, frequency: "monthly", category: "Utilities", merchant_hint: null, active: true };

describe("finance calculations", () => {
  it("calculates documented register balance and unexplained variance", () => {
    expect(clearedRegisterBalance(account, entries)).toBe(95000);
    expect(accountVariance(account, entries)).toBe(-5000);
  });

  it("subtracts reserved bills from available balance", () => {
    expect(safeToSpend(account, [bill], rule, 10000)).toBeLessThanOrEqual(75000);
  });

  it("generates paydays and assigns bills", () => {
    expect(nextPaydays(rule, 3)).toHaveLength(3);
    expect([...assignBillsToPaydays([bill], rule).values()].flat()).toContainEqual(bill);
  });
});
