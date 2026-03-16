create table if not exists public.b2b_leads (
  id bigserial primary key,
  created_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz not null default timezone('utc', now()),
  status text not null default 'new' check (status in ('new', 'review', 'contacted', 'qualified', 'spam', 'archived')),
  spam_score integer not null default 0 check (spam_score >= 0),
  page_title text,
  page_url text,
  language text,
  form_source text,
  name text,
  company text,
  city_state text,
  country_region text,
  product text,
  monthly_volume text,
  email text not null,
  whatsapp text,
  message text,
  website text,
  started_at timestamptz,
  ip text,
  user_agent text,
  notes text
);

create index if not exists b2b_leads_created_at_idx
on public.b2b_leads (created_at desc);

create index if not exists b2b_leads_email_idx
on public.b2b_leads (lower(email));

create index if not exists b2b_leads_status_idx
on public.b2b_leads (status);

alter table public.b2b_leads enable row level security;

drop policy if exists "allow anon insert b2b leads"
on public.b2b_leads;

revoke all on public.b2b_leads from anon, authenticated;
