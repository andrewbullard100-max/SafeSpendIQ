"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  BellRing,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Landmark,
  LayoutDashboard,
  LogOut,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  WalletCards,
} from "lucide-react";
import { PlaidConnectButton } from "./PlaidConnectButton";
import {
  accountVariance,
  assignBillsToPaydays,
  clearedRegisterBalance,
  currentReservedBills,
  money,
  nextPaydays,
  safeToSpend,
  toISODate,
} from "@/lib/finance";
import type { AppData, PaydayRule, PlaidTransaction, RecurringBill, RegisterEntry } from "@/lib/types";

interface Props {
  mode: "demo" | "live";
  initialData: AppData;
  supabase?: SupabaseClient;
  accessToken?: string;
  onRefresh?: () => Promise<void>;
}

type Tab = "dashboard" | "register" | "bills" | "review" | "settings";

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "register", label: "Register", icon: BookOpenText },
  { id: "bills", label: "Bills", icon: CalendarDays },
  { id: "review", label: "Review", icon: ReceiptText },
  { id: "settings", label: "Settings", icon: Settings },
];

function parseAmount(value: string): number {
  return Math.round(Number(value.replace(/[^0-9.-]/g, "")) * 100);
}

function primaryAccount(data: AppData) {
  return data.accounts.find((account) => account.is_primary) ?? data.accounts[0];
}

export function FinanceApp({ mode, initialData, supabase, accessToken, onRefresh }: Props) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabs.some((item) => item.id === requestedTab) ? requestedTab! : "dashboard");
  const [data, setData] = useState<AppData>(initialData);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (mode !== "demo") return;
    const saved = window.localStorage.getItem("safespend-demo-v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AppData;
        queueMicrotask(() => setData(parsed));
      } catch { /* keep seed */ }
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "demo") window.localStorage.setItem("safespend-demo-v1", JSON.stringify(data));
  }, [data, mode]);

  const account = primaryAccount(data);
  const payRule = data.paydayRules.find((rule) => rule.active);
  const registerBalance = account ? clearedRegisterBalance(account, data.entries) : 0;
  const variance = account ? accountVariance(account, data.entries) : 0;
  const reserved = currentReservedBills(data.bills, payRule);
  const safe = account ? safeToSpend(account, data.bills, payRule, data.profile.safe_spend_floor_cents) : 0;
  const unresolved = data.plaidTransactions.filter((tx) => !tx.pending && !tx.removed && !tx.documented && tx.review_status === "needs_review");

  async function addBill(formData: FormData) {
    if (!account) return;
    const bill: RecurringBill = {
      id: crypto.randomUUID(),
      user_id: data.profile.user_id,
      name: String(formData.get("name") ?? "Bill"),
      amount_cents: parseAmount(String(formData.get("amount") ?? "0")),
      due_day: Number(formData.get("due_day") ?? 1),
      frequency: "monthly",
      category: String(formData.get("category") ?? "Other"),
      merchant_hint: String(formData.get("merchant_hint") ?? "") || null,
      active: true,
    };
    if (mode === "live" && supabase) {
      const { data: inserted, error } = await supabase.from("recurring_bills").insert({ ...bill, id: undefined }).select("*").single();
      if (error) return setNotice(error.message);
      setData((current) => ({ ...current, bills: [...current.bills, inserted as RecurringBill] }));
    } else setData((current) => ({ ...current, bills: [...current.bills, bill] }));
    setNotice(`${bill.name} is now reserved from the appropriate paycheck.`);
  }

  async function deleteBill(id: string) {
    if (mode === "live" && supabase) {
      const { error } = await supabase.from("recurring_bills").delete().eq("id", id);
      if (error) return setNotice(error.message);
    }
    setData((current) => ({ ...current, bills: current.bills.filter((bill) => bill.id !== id) }));
  }

  async function addEntry(formData: FormData) {
    if (!account) return;
    const type = String(formData.get("type") ?? "withdrawal");
    const raw = Math.abs(parseAmount(String(formData.get("amount") ?? "0")));
    const entry: RegisterEntry = {
      id: crypto.randomUUID(),
      user_id: data.profile.user_id,
      account_id: account.id,
      amount_cents: type === "deposit" ? raw : -raw,
      description: String(formData.get("description") ?? "Manual entry"),
      transaction_date: String(formData.get("date") ?? toISODate(new Date())),
      source: "manual",
      status: "posted",
      documented: true,
      plaid_transaction_id: null,
      recurring_bill_id: null,
      notes: null,
    };
    if (mode === "live" && supabase) {
      const { data: inserted, error } = await supabase.from("register_entries").insert({ ...entry, id: undefined }).select("*").single();
      if (error) return setNotice(error.message);
      setData((current) => ({ ...current, entries: [...current.entries, inserted as RegisterEntry] }));
    } else setData((current) => ({ ...current, entries: [...current.entries, entry] }));
    setNotice("Register updated. Plaid will match this entry when the bank posts it.");
  }

  async function documentTransaction(transaction: PlaidTransaction) {
    if (!account) return;
    setWorking(true);
    const entry: RegisterEntry = {
      id: crypto.randomUUID(),
      user_id: data.profile.user_id,
      account_id: transaction.account_id,
      amount_cents: transaction.signed_amount_cents,
      description: transaction.merchant_name ?? transaction.name,
      transaction_date: transaction.transaction_date,
      source: "plaid",
      status: transaction.pending ? "pending" : "posted",
      documented: true,
      plaid_transaction_id: transaction.plaid_transaction_id,
      recurring_bill_id: null,
      notes: "Added from Plaid review",
    };
    if (mode === "live" && supabase) {
      const { data: inserted, error } = await supabase.from("register_entries").upsert({ ...entry, id: undefined }, { onConflict: "plaid_transaction_id" }).select("*").single();
      if (error) { setWorking(false); return setNotice(error.message); }
      const { error: updateError } = await supabase.from("plaid_transactions").update({ documented: true, review_status: "matched" }).eq("id", transaction.id);
      if (updateError) { setWorking(false); return setNotice(updateError.message); }
      entry.id = (inserted as RegisterEntry).id;
    }
    setData((current) => ({
      ...current,
      entries: [...current.entries.filter((item) => item.plaid_transaction_id !== transaction.plaid_transaction_id), entry],
      plaidTransactions: current.plaidTransactions.map((tx) => tx.id === transaction.id ? { ...tx, documented: true, review_status: "matched" } : tx),
    }));
    setNotice(`${entry.description} was added to the register.`);
    setWorking(false);
  }

  async function dismissTransaction(transaction: PlaidTransaction) {
    if (mode === "live" && supabase) {
      const { error } = await supabase.from("plaid_transactions").update({ documented: true, review_status: "dismissed" }).eq("id", transaction.id);
      if (error) return setNotice(error.message);
    }
    setData((current) => ({ ...current, plaidTransactions: current.plaidTransactions.map((tx) => tx.id === transaction.id ? { ...tx, documented: true, review_status: "dismissed" } : tx) }));
  }

  async function savePayday(formData: FormData) {
    const rule: PaydayRule = {
      id: payRule?.id ?? crypto.randomUUID(),
      user_id: data.profile.user_id,
      cadence: String(formData.get("cadence") ?? "biweekly") as PaydayRule["cadence"],
      next_payday: String(formData.get("next_payday") ?? toISODate(new Date())),
      expected_amount_cents: parseAmount(String(formData.get("expected_amount") ?? "0")),
      second_monthly_day: null,
      active: true,
    };
    if (mode === "live" && supabase) {
      const newRulePayload = {
        user_id: rule.user_id, cadence: rule.cadence, next_payday: rule.next_payday,
        expected_amount_cents: rule.expected_amount_cents, second_monthly_day: rule.second_monthly_day, active: rule.active,
      };
      const payload = payRule ? rule : newRulePayload;
      const { data: saved, error } = await supabase.from("payday_rules").upsert(payload).select("*").single();
      if (error) return setNotice(error.message);
      rule.id = (saved as PaydayRule).id;
    }
    setData((current) => ({ ...current, paydayRules: [rule] }));
    setNotice("Pay schedule updated. Bills were reassigned automatically.");
  }

  async function saveAlerts(formData: FormData) {
    const updated = {
      ...data.profile,
      phone_e164: String(formData.get("phone") ?? "") || null,
      sms_opt_in: formData.get("sms_opt_in") === "on",
      sms_threshold_cents: parseAmount(String(formData.get("threshold") ?? "25")),
      sms_mode: String(formData.get("sms_mode") ?? "immediate") as typeof data.profile.sms_mode,
      safe_spend_floor_cents: parseAmount(String(formData.get("floor") ?? "0")),
    };
    if (mode === "live" && supabase) {
      const { error } = await supabase.from("profiles").upsert(updated);
      if (error) return setNotice(error.message);
    }
    setData((current) => ({ ...current, profile: updated }));
    setNotice("Alert preferences saved.");
  }

  async function sendTestSms() {
    if (mode === "demo") return setNotice("Demo alert: SafeSpend would text you about a $42.17 unexplained difference.");
    if (!accessToken || !data.profile.phone_e164) return setNotice("Add a valid phone number first.");
    setWorking(true);
    const response = await fetch("/api/sms/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ phone: data.profile.phone_e164 }),
    });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? "Test SMS sent." : result.error ?? "Test SMS failed.");
    setWorking(false);
  }

  async function manualRefresh() {
    if (mode === "demo") {
      setNotice("Demo bank data refreshed. Two undocumented transactions are waiting for review.");
      return;
    }
    await onRefresh?.();
    setNotice("Latest saved data loaded. Plaid webhooks continue checking automatically.");
  }


  async function createSandboxVariance() {
    if (!accessToken) return;
    setWorking(true);
    const response = await fetch("/api/plaid/sandbox-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ amount: 42.17, description: "SafeSpend undocumented test purchase" }),
    });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? "Plaid Sandbox purchase created. Refresh to see the automatic variance." : result.error ?? "Sandbox test failed.");
    if (response.ok) await onRefresh?.();
    setWorking(false);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="app-frame">
      <header className="app-header">
        <div className="brand-row"><div className="brand-mark small">S</div><div><strong>SafeSpend</strong><span>Smart checkbook register</span></div></div>
        <div className="header-actions">
          {mode === "demo" && <span className="demo-pill">Demo</span>}
          <button className="icon-button" onClick={manualRefresh} aria-label="Refresh"><RefreshCw size={18} /></button>
        </div>
      </header>

      {notice && <button className="toast" onClick={() => setNotice(null)}><Check size={17} />{notice}</button>}

      <div className="app-content">
        {tab === "dashboard" && <Dashboard data={data} account={account} payRule={payRule} registerBalance={registerBalance} variance={variance} reserved={reserved} safe={safe} unresolved={unresolved.length} setTab={setTab} />}
        {tab === "register" && <RegisterView data={data} accountId={account?.id} registerBalance={registerBalance} addEntry={addEntry} />}
        {tab === "bills" && <BillsView bills={data.bills} payRule={payRule} addBill={addBill} deleteBill={deleteBill} savePayday={savePayday} />}
        {tab === "review" && <ReviewView transactions={unresolved} working={working} documentTransaction={documentTransaction} dismissTransaction={dismissTransaction} />}
        {tab === "settings" && <SettingsView data={data} mode={mode} accessToken={accessToken} onConnected={onRefresh} saveAlerts={saveAlerts} sendTestSms={sendTestSms} createSandboxVariance={createSandboxVariance} working={working} signOut={signOut} />}
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {tabs.map((item) => {
          const Icon = item.icon;
          const badge = item.id === "review" && unresolved.length > 0 ? unresolved.length : null;
          return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span className="nav-icon"><Icon size={20} />{badge && <b>{badge}</b>}</span><span>{item.label}</span></button>;
        })}
      </nav>
    </main>
  );
}

function Dashboard({ data, account, payRule, registerBalance, variance, reserved, safe, unresolved, setTab }: {
  data: AppData; account: ReturnType<typeof primaryAccount>; payRule?: PaydayRule; registerBalance: number; variance: number; reserved: number; safe: number; unresolved: number; setTab: (tab: Tab) => void;
}) {
  const paydays = payRule ? nextPaydays(payRule, 3) : [];
  const assignments = payRule ? assignBillsToPaydays(data.bills, payRule) : new Map<string, RecurringBill[]>();
  return <div className="page-stack">
    <section className={`hero-balance ${safe < 0 ? "danger" : ""}`}>
      <div><p className="eyebrow">Safe to spend</p><h1>{money(safe)}</h1><p>After reserved bills and your {money(data.profile.safe_spend_floor_cents)} safety floor.</p></div>
      <ShieldCheck size={44} />
    </section>
    <section className="metric-grid">
      <article><span>Bank balance</span><strong>{money(account?.current_balance_cents ?? 0)}</strong><small>Actual from Plaid</small></article>
      <article><span>Register balance</span><strong>{money(registerBalance)}</strong><small>Documented activity</small></article>
      <article><span>Reserved bills</span><strong>{money(reserved)}</strong><small>Next pay cycle</small></article>
      <article className={Math.abs(variance) >= 100 ? "warning" : ""}><span>Unexplained variance</span><strong>{money(variance)}</strong><small>{unresolved} item{unresolved === 1 ? "" : "s"} to review</small></article>
    </section>
    {unresolved > 0 && <button className="variance-banner" onClick={() => setTab("review")}><AlertTriangle size={22} /><span><strong>{unresolved} undocumented transaction{unresolved === 1 ? "" : "s"}</strong><small>Review them to bring the register back in line.</small></span><ChevronRight size={20} /></button>}
    <section className="panel">
      <div className="section-heading"><div><p className="eyebrow">Payday plan</p><h2>Money already spoken for</h2></div><CalendarDays size={22} /></div>
      {paydays.length === 0 ? <EmptyState text="Add a payday schedule to assign bills automatically." /> : <div className="payday-list">{paydays.map((date) => {
        const bills = assignments.get(toISODate(date)) ?? [];
        const total = bills.reduce((sum, bill) => sum + bill.amount_cents, 0);
        return <article key={date.toISOString()}><div className="payday-date"><span>{date.toLocaleDateString("en-US", { month: "short" })}</span><strong>{date.getDate()}</strong></div><div className="grow"><strong>{money(payRule?.expected_amount_cents ?? 0)} paycheck</strong><small>{bills.length ? bills.map((bill) => bill.name).join(" • ") : "No bills assigned yet"}</small></div><div className="right"><strong>{money(total)}</strong><small>reserved</small></div></article>;
      })}</div>}
    </section>
  </div>;
}

function RegisterView({ data, accountId, registerBalance, addEntry }: { data: AppData; accountId?: string; registerBalance: number; addEntry: (data: FormData) => Promise<void> }) {
  const entries = useMemo(() => data.entries.filter((entry) => entry.account_id === accountId).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)), [data.entries, accountId]);
  const rows = useMemo(() => entries.reduce<{ rows: { entry: RegisterEntry; balance: number }[]; balance: number }>(
    (accumulator, entry) => ({
      rows: [...accumulator.rows, { entry, balance: accumulator.balance }],
      balance: accumulator.balance - entry.amount_cents,
    }),
    { rows: [], balance: registerBalance },
  ).rows, [entries, registerBalance]);
  return <div className="page-stack">
    <div className="title-row"><div><p className="eyebrow">Old-school clarity</p><h1>Checkbook register</h1></div><span className="balance-chip">{money(registerBalance)}</span></div>
    <details className="panel add-panel"><summary><Plus size={18} /> Add an entry</summary><form action={addEntry} className="form-grid"><label>Description<input name="description" required placeholder="Groceries, check #104…" /></label><label>Amount<input name="amount" inputMode="decimal" required placeholder="0.00" /></label><label>Type<select name="type"><option value="withdrawal">Withdrawal</option><option value="deposit">Deposit</option></select></label><label>Date<input name="date" type="date" defaultValue={toISODate(new Date())} /></label><button className="button primary full" type="submit"><Plus size={17} /> Add to register</button></form></details>
    <section className="ledger panel"><div className="ledger-head"><span>Date</span><span>Description</span><span>Amount</span><span>Balance</span></div>{rows.map(({ entry, balance }) => <div className="ledger-row" key={entry.id}><span>{new Date(`${entry.transaction_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><span><strong>{entry.description}</strong><small>{entry.source.replace("_", " ")}{entry.plaid_transaction_id ? " • cleared" : ""}</small></span><span className={entry.amount_cents >= 0 ? "positive" : "negative"}>{entry.amount_cents >= 0 ? "+" : ""}{money(entry.amount_cents)}</span><span>{money(balance)}</span></div>)}{entries.length === 0 && <EmptyState text="Your documented deposits and withdrawals will appear here." />}</section>
  </div>;
}

function BillsView({ bills, payRule, addBill, deleteBill, savePayday }: { bills: RecurringBill[]; payRule?: PaydayRule; addBill: (data: FormData) => Promise<void>; deleteBill: (id: string) => Promise<void>; savePayday: (data: FormData) => Promise<void> }) {
  const assignments = payRule ? assignBillsToPaydays(bills, payRule) : new Map<string, RecurringBill[]>();
  return <div className="page-stack">
    <div className="title-row"><div><p className="eyebrow">Automatic reservations</p><h1>Bills and paydays</h1></div><WalletCards size={30} /></div>
    <section className="panel"><div className="section-heading"><div><h2>Pay schedule</h2><p>We assign every bill to the latest payday before it is due.</p></div></div><form action={savePayday} className="form-grid"><label>Pay frequency<select name="cadence" defaultValue={payRule?.cadence ?? "biweekly"}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="semimonthly">Twice monthly</option><option value="monthly">Monthly</option></select></label><label>Next payday<input name="next_payday" type="date" defaultValue={payRule?.next_payday ?? toISODate(new Date())} required /></label><label>Expected take-home pay<input name="expected_amount" defaultValue={((payRule?.expected_amount_cents ?? 0) / 100).toFixed(2)} inputMode="decimal" required /></label><button className="button secondary align-end">Save payday</button></form></section>
    <details className="panel add-panel"><summary><Plus size={18} /> Add recurring bill</summary><form action={addBill} className="form-grid"><label>Bill name<input name="name" required placeholder="Mortgage" /></label><label>Usual amount<input name="amount" required inputMode="decimal" placeholder="2145.00" /></label><label>Due day<input name="due_day" required type="number" min="1" max="28" defaultValue="1" /></label><label>Category<select name="category"><option>Housing</option><option>Transportation</option><option>Insurance</option><option>Utilities</option><option>Debt</option><option>Subscriptions</option><option>Other</option></select></label><label className="full">Merchant hint <input name="merchant_hint" placeholder="Words Plaid may show, such as electric or auto finance" /></label><button className="button primary full"><Plus size={17} /> Add recurring bill</button></form></details>
    <section className="bill-list">{bills.map((bill) => { const assigned = [...assignments.entries()].find(([, list]) => list.some((item) => item.id === bill.id))?.[0]; return <article className="panel" key={bill.id}><div className="bill-icon"><ReceiptText size={20} /></div><div className="grow"><strong>{bill.name}</strong><small>{bill.category} • due day {bill.due_day}{assigned ? ` • reserved from ${new Date(`${assigned}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</small></div><strong>{money(bill.amount_cents)}</strong><button className="icon-button danger-button" onClick={() => deleteBill(bill.id)} aria-label={`Delete ${bill.name}`}><Trash2 size={17} /></button></article>; })}{bills.length === 0 && <EmptyState text="Add mortgage, rent, utilities, insurance, subscriptions, and other recurring withdrawals." />}</section>
  </div>;
}

function ReviewView({ transactions, working, documentTransaction, dismissTransaction }: { transactions: PlaidTransaction[]; working: boolean; documentTransaction: (tx: PlaidTransaction) => Promise<void>; dismissTransaction: (tx: PlaidTransaction) => Promise<void> }) {
  const total = transactions.reduce((sum, tx) => sum + tx.signed_amount_cents, 0);
  return <div className="page-stack"><div className="title-row"><div><p className="eyebrow">Plaid variance detection</p><h1>Needs review</h1></div><span className="balance-chip warning-chip">{money(total)}</span></div><p className="page-intro">These posted bank transactions were not found in the documented register or matched to a recurring bill.</p>{transactions.length === 0 ? <section className="panel success-empty"><ShieldCheck size={42} /><h2>You are reconciled</h2><p>No unexplained posted activity is waiting for review.</p></section> : <section className="review-list">{transactions.map((tx) => <article className="panel" key={tx.id}><div className="transaction-logo">{(tx.merchant_name ?? tx.name).slice(0, 1).toUpperCase()}</div><div className="grow"><strong>{tx.merchant_name ?? tx.name}</strong><small>{new Date(`${tx.transaction_date}T12:00:00`).toLocaleDateString()} • {(tx.category_primary ?? "Uncategorized").replaceAll("_", " ").toLowerCase()}</small></div><strong className={tx.signed_amount_cents >= 0 ? "positive" : "negative"}>{money(tx.signed_amount_cents)}</strong><div className="review-actions"><button className="button small primary" disabled={working} onClick={() => documentTransaction(tx)}>Add</button><button className="button small ghost" disabled={working} onClick={() => dismissTransaction(tx)}>Ignore</button></div></article>)}</section>}</div>;
}

function SettingsView({ data, mode, accessToken, onConnected, saveAlerts, sendTestSms, createSandboxVariance, working, signOut }: { data: AppData; mode: "demo" | "live"; accessToken?: string; onConnected?: () => Promise<void>; saveAlerts: (data: FormData) => Promise<void>; sendTestSms: () => Promise<void>; createSandboxVariance: () => Promise<void>; working: boolean; signOut: () => Promise<void> }) {
  return <div className="page-stack"><div className="title-row"><div><p className="eyebrow">Connections and alerts</p><h1>Settings</h1></div><Settings size={28} /></div><section className="panel"><div className="section-heading"><div><h2>Bank connection</h2><p>Plaid provides balances and transactions. Bank credentials never pass through SafeSpend.</p></div><Landmark size={22} /></div>{mode === "live" && accessToken ? <><PlaidConnectButton accessToken={accessToken} onConnected={onConnected ?? (() => undefined)} />{process.env.NEXT_PUBLIC_PLAID_ENV === "sandbox" && <button className="button secondary" type="button" disabled={working} onClick={createSandboxVariance}><AlertTriangle size={17} /> Create $42.17 Sandbox variance</button>}</> : <div className="notice"><Landmark size={18} /> Demo mode uses realistic sample bank activity.</div>}</section><section className="panel"><div className="section-heading"><div><h2>Text-message alerts</h2><p>Get notified without remembering to open the app.</p></div><Smartphone size={22} /></div><form action={saveAlerts} className="form-grid"><label>Mobile number<input name="phone" defaultValue={data.profile.phone_e164 ?? ""} placeholder="+16155551212" /></label><label>Alert when variance reaches<input name="threshold" defaultValue={(data.profile.sms_threshold_cents / 100).toFixed(2)} inputMode="decimal" /></label><label>Alert timing<select name="sms_mode" defaultValue={data.profile.sms_mode}><option value="immediate">Immediately</option><option value="daily">One daily summary</option><option value="critical">Only critical</option></select></label><label>Keep as safety floor<input name="floor" defaultValue={(data.profile.safe_spend_floor_cents / 100).toFixed(2)} inputMode="decimal" /></label><label className="checkbox full"><input name="sms_opt_in" type="checkbox" defaultChecked={data.profile.sms_opt_in} /><span>I agree to receive transactional account variance and safe-to-spend alerts by SMS. Frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.</span></label><button className="button primary"><BellRing size={17} /> Save alert settings</button><button className="button secondary" type="button" disabled={working} onClick={sendTestSms}>Send test alert</button></form></section><section className="panel security-note"><ShieldCheck size={24} /><div><strong>Security model</strong><p>Plaid access tokens are encrypted with AES-256-GCM on the server. Supabase Row Level Security isolates each user’s records.</p></div></section>{mode === "live" && <button className="button ghost" onClick={signOut}><LogOut size={17} /> Sign out</button>}</div>;
}

function EmptyState({ text }: { text: string }) { return <div className="empty-state"><CircleDollarSign size={30} /><p>{text}</p></div>; }
