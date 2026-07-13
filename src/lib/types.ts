export type BillFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
export type PayCadence = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type EntrySource = "manual" | "recurring_bill" | "paycheck" | "plaid";

export interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  sms_opt_in: boolean;
  sms_threshold_cents: number;
  sms_mode: "immediate" | "daily" | "critical";
  safe_spend_floor_cents: number;
  timezone: string;
}

export interface BankAccount {
  id: string;
  user_id: string;
  plaid_item_id: string | null;
  plaid_account_id: string | null;
  name: string;
  official_name: string | null;
  mask: string | null;
  subtype: string | null;
  current_balance_cents: number;
  available_balance_cents: number | null;
  baseline_balance_cents: number;
  baseline_at: string;
  last_synced_at: string | null;
  is_primary: boolean;
}

export interface RecurringBill {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  due_day: number;
  frequency: BillFrequency;
  category: string;
  merchant_hint: string | null;
  active: boolean;
}

export interface PaydayRule {
  id: string;
  user_id: string;
  cadence: PayCadence;
  next_payday: string;
  expected_amount_cents: number;
  second_monthly_day: number | null;
  active: boolean;
}

export interface RegisterEntry {
  id: string;
  user_id: string;
  account_id: string;
  amount_cents: number;
  description: string;
  transaction_date: string;
  source: EntrySource;
  status: "pending" | "posted";
  documented: boolean;
  plaid_transaction_id: string | null;
  recurring_bill_id: string | null;
  notes: string | null;
}

export interface PlaidTransaction {
  id: string;
  user_id: string;
  account_id: string;
  plaid_transaction_id: string;
  merchant_name: string | null;
  name: string;
  amount_cents: number;
  signed_amount_cents: number;
  transaction_date: string;
  pending: boolean;
  removed: boolean;
  documented: boolean;
  review_status: "historical" | "matched" | "needs_review" | "dismissed";
  category_primary: string | null;
}

export interface AppData {
  profile: Profile;
  accounts: BankAccount[];
  bills: RecurringBill[];
  paydayRules: PaydayRule[];
  entries: RegisterEntry[];
  plaidTransactions: PlaidTransaction[];
}
