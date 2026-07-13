-- SafeSpend Register initial schema
-- Run with Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone_e164 text,
  sms_opt_in boolean not null default false,
  sms_threshold_cents integer not null default 2500 check (sms_threshold_cents >= 0),
  sms_mode text not null default 'immediate' check (sms_mode in ('immediate','daily','critical')),
  safe_spend_floor_cents integer not null default 0 check (safe_spend_floor_cents >= 0),
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null unique,
  access_token_ciphertext text not null,
  cursor text,
  institution_name text,
  initial_sync_complete boolean not null default false,
  status text not null default 'active' check (status in ('active','error','disconnected')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_id uuid references public.plaid_items(id) on delete cascade,
  plaid_account_id text unique,
  name text not null,
  official_name text,
  mask text,
  subtype text,
  current_balance_cents bigint not null default 0,
  available_balance_cents bigint,
  baseline_balance_cents bigint not null default 0,
  baseline_at timestamptz not null default now(),
  last_synced_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount_cents integer not null check (amount_cents >= 0),
  due_day integer not null check (due_day between 1 and 28),
  frequency text not null default 'monthly' check (frequency in ('weekly','biweekly','monthly','quarterly','annual')),
  category text not null default 'Other',
  merchant_hint text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payday_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cadence text not null check (cadence in ('weekly','biweekly','semimonthly','monthly')),
  next_payday date not null,
  expected_amount_cents integer not null check (expected_amount_cents >= 0),
  second_monthly_day integer check (second_monthly_day between 1 and 28),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.register_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount_cents bigint not null,
  description text not null,
  transaction_date date not null,
  source text not null default 'manual' check (source in ('manual','recurring_bill','paycheck','plaid')),
  status text not null default 'posted' check (status in ('pending','posted')),
  documented boolean not null default true,
  plaid_transaction_id text unique,
  recurring_bill_id uuid references public.recurring_bills(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plaid_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  plaid_transaction_id text not null unique,
  merchant_name text,
  name text not null,
  amount_cents bigint not null,
  signed_amount_cents bigint not null,
  transaction_date date not null,
  authorized_date date,
  pending boolean not null default false,
  pending_transaction_id text,
  removed boolean not null default false,
  documented boolean not null default false,
  review_status text not null default 'needs_review' check (review_status in ('historical','matched','needs_review','dismissed')),
  category_primary text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.variances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  actual_balance_cents bigint not null,
  register_balance_cents bigint not null,
  variance_cents bigint not null,
  safe_to_spend_cents bigint not null,
  transaction_ids jsonb not null default '[]'::jsonb,
  fingerprint text not null unique,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variance_id uuid references public.variances(id) on delete cascade,
  channel text not null check (channel in ('sms','email','push')),
  provider_id text,
  status text not null default 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_idx on public.accounts(user_id);
create index if not exists bills_user_due_idx on public.recurring_bills(user_id, due_day);
create index if not exists register_account_date_idx on public.register_entries(account_id, transaction_date desc);
create index if not exists plaid_tx_review_idx on public.plaid_transactions(account_id, documented, pending, transaction_date desc);
create index if not exists variance_user_status_idx on public.variances(user_id, status, detected_at desc);
create index if not exists notification_provider_idx on public.notification_log(provider_id);

alter table public.profiles enable row level security;
alter table public.plaid_items enable row level security;
alter table public.accounts enable row level security;
alter table public.recurring_bills enable row level security;
alter table public.payday_rules enable row level security;
alter table public.register_entries enable row level security;
alter table public.plaid_transactions enable row level security;
alter table public.variances enable row level security;
alter table public.notification_log enable row level security;

-- plaid_items intentionally has no browser policies. Only server-side service-role code can read encrypted tokens.

create policy "profiles own row" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts own select" on public.accounts for select using (auth.uid() = user_id);
create policy "bills own rows" on public.recurring_bills for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "payday own rows" on public.payday_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "register own rows" on public.register_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plaid transactions own select" on public.plaid_transactions for select using (auth.uid() = user_id);
create policy "plaid transactions own update" on public.plaid_transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "variances own select" on public.variances for select using (auth.uid() = user_id);
create policy "notifications own select" on public.notification_log for select using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
