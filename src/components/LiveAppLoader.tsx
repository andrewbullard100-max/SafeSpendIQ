"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Settings2 } from "lucide-react";
import { FinanceApp } from "./FinanceApp";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { AppData, Profile } from "@/lib/types";

export function LiveAppLoader() {
  const supabase = getSupabaseBrowser();
  const [data, setData] = useState<AppData | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading your register…");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setAccessToken(null);
      setMessage("Sign in to connect a bank and save your register.");
      return;
    }
    setAccessToken(session.access_token);
    const userId = session.user.id;
    const defaultProfile: Profile = {
      user_id: userId,
      full_name: session.user.user_metadata?.full_name ?? null,
      email: session.user.email ?? null,
      phone_e164: null,
      sms_opt_in: false,
      sms_threshold_cents: 2500,
      sms_mode: "immediate",
      safe_spend_floor_cents: 0,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
    };

    await supabase.from("profiles").upsert(defaultProfile, { onConflict: "user_id", ignoreDuplicates: true });
    const [profile, accounts, bills, paydays, entries, plaidTransactions] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("accounts").select("*").eq("user_id", userId).order("is_primary", { ascending: false }),
      supabase.from("recurring_bills").select("*").eq("user_id", userId).order("due_day"),
      supabase.from("payday_rules").select("*").eq("user_id", userId).eq("active", true),
      supabase.from("register_entries").select("*").eq("user_id", userId).order("transaction_date", { ascending: false }),
      supabase.from("plaid_transactions").select("*").eq("user_id", userId).order("transaction_date", { ascending: false }).limit(250),
    ]);
    const firstError = [profile.error, accounts.error, bills.error, paydays.error, entries.error, plaidTransactions.error].find(Boolean);
    if (firstError) {
      setMessage(firstError.message);
      return;
    }
    setData({
      profile: profile.data as Profile,
      accounts: accounts.data ?? [],
      bills: bills.data ?? [],
      paydayRules: paydays.data ?? [],
      entries: entries.data ?? [],
      plaidTransactions: plaidTransactions.data ?? [],
    } as AppData);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!supabase) return <SetupRequired />;
  if (!accessToken) return <main className="center-page"><div className="setup-card"><div className="brand-mark">S</div><h1>SafeSpend Register</h1><p>{message}</p><Link className="button primary" href="/login">Sign in</Link><Link className="button secondary" href="/demo">Use demo instead</Link></div></main>;
  if (!data) return <main className="center-page"><LoaderCircle className="spin" size={34} /><p>{message}</p></main>;
  return <FinanceApp mode="live" initialData={data} supabase={supabase} accessToken={accessToken} onRefresh={load} />;
}

function SetupRequired() {
  return <main className="center-page"><div className="setup-card"><Settings2 size={38} /><h1>Backend setup required</h1><p>The project is running, but Supabase environment variables have not been added. You can use the complete local demo immediately.</p><Link className="button primary" href="/demo">Open working demo</Link><Link className="button secondary" href="/">Back to overview</Link></div></main>;
}
