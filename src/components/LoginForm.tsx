"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setMessage("Supabase is not configured yet. Use the demo or add environment variables.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    setLoading(false);
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
  }

  return (
    <main className="auth-page">
      <Link className="back-link" href="/"><ArrowLeft size={17} /> Home</Link>
      <section className="auth-card">
        <div className="brand-mark small">S</div>
        <p className="eyebrow">Secure access</p>
        <h1>Sign in to SafeSpend</h1>
        <p className="muted">We will email you a password-free sign-in link.</p>
        <form className="stack" onSubmit={submit}>
          <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <button className="button primary" disabled={loading}><Mail size={18} />{loading ? "Sending…" : "Email my sign-in link"}</button>
        </form>
        {message && <div className="notice">{message}</div>}
        <p className="fine-print">Financial data is accessed through Plaid only after you explicitly connect an account.</p>
      </section>
    </main>
  );
}
