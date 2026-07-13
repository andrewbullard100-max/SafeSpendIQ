import type { BankAccount, PaydayRule, RecurringBill, RegisterEntry } from "./types";

const DAY_MS = 86_400_000;

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function nextPaydays(rule: PaydayRule, count = 8): Date[] {
  const result: Date[] = [];
  let cursor = parseLocalDate(rule.next_payday);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (cursor < today) {
    if (rule.cadence === "weekly") cursor = addDays(cursor, 7);
    else if (rule.cadence === "biweekly") cursor = addDays(cursor, 14);
    else if (rule.cadence === "monthly") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate(), 12);
    else {
      const firstDay = cursor.getDate();
      const secondDay = rule.second_monthly_day ?? 30;
      if (firstDay < secondDay) cursor = new Date(cursor.getFullYear(), cursor.getMonth(), secondDay, 12);
      else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, Math.min(firstDay, 28), 12);
    }
  }

  for (let i = 0; i < count; i += 1) {
    result.push(new Date(cursor));
    if (rule.cadence === "weekly") cursor = addDays(cursor, 7);
    else if (rule.cadence === "biweekly") cursor = addDays(cursor, 14);
    else if (rule.cadence === "monthly") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate(), 12);
    else {
      const firstDay = parseLocalDate(rule.next_payday).getDate();
      const secondDay = rule.second_monthly_day ?? 30;
      cursor = cursor.getDate() === firstDay
        ? new Date(cursor.getFullYear(), cursor.getMonth(), secondDay, 12)
        : new Date(cursor.getFullYear(), cursor.getMonth() + 1, firstDay, 12);
    }
  }
  return result;
}

export function nextBillDueDate(bill: RecurringBill, from = new Date()): Date {
  const safeDay = Math.min(Math.max(bill.due_day, 1), 28);
  let due = new Date(from.getFullYear(), from.getMonth(), safeDay, 12);
  if (due < new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0)) {
    if (bill.frequency === "weekly") due = addDays(due, 7);
    else if (bill.frequency === "biweekly") due = addDays(due, 14);
    else if (bill.frequency === "quarterly") due = new Date(due.getFullYear(), due.getMonth() + 3, safeDay, 12);
    else if (bill.frequency === "annual") due = new Date(due.getFullYear() + 1, due.getMonth(), safeDay, 12);
    else due = new Date(due.getFullYear(), due.getMonth() + 1, safeDay, 12);
  }
  return due;
}

export function assignBillsToPaydays(bills: RecurringBill[], rule?: PaydayRule): Map<string, RecurringBill[]> {
  const assignments = new Map<string, RecurringBill[]>();
  if (!rule) return assignments;
  const paydays = nextPaydays(rule, 10);

  for (const bill of bills.filter((item) => item.active)) {
    const due = nextBillDueDate(bill);
    const eligible = paydays.filter((payday) => payday <= due);
    const assigned = eligible.at(-1) ?? paydays[0];
    const key = toISODate(assigned);
    assignments.set(key, [...(assignments.get(key) ?? []), bill]);
  }
  return assignments;
}

export function clearedRegisterBalance(account: BankAccount, entries: RegisterEntry[]): number {
  const baselineDay = account.baseline_at.slice(0, 10);
  return account.baseline_balance_cents + entries
    .filter((entry) => entry.account_id === account.id && entry.documented && entry.transaction_date >= baselineDay)
    .reduce((sum, entry) => sum + entry.amount_cents, 0);
}

export function accountVariance(account: BankAccount, entries: RegisterEntry[]): number {
  return account.current_balance_cents - clearedRegisterBalance(account, entries);
}

export function currentReservedBills(bills: RecurringBill[], rule?: PaydayRule): number {
  if (!rule) return 0;
  const assignments = assignBillsToPaydays(bills, rule);
  const firstPayday = nextPaydays(rule, 1)[0];
  return (assignments.get(toISODate(firstPayday)) ?? []).reduce((sum, bill) => sum + bill.amount_cents, 0);
}

export function safeToSpend(account: BankAccount, bills: RecurringBill[], rule: PaydayRule | undefined, floorCents = 0): number {
  const spendableBalance = account.available_balance_cents ?? account.current_balance_cents;
  return spendableBalance - currentReservedBills(bills, rule) - floorCents;
}

export function dateDistanceDays(a: string, b: string): number {
  return Math.abs(parseLocalDate(a).getTime() - parseLocalDate(b).getTime()) / DAY_MS;
}
