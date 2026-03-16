# Supabase B2B Setup

This project now sends B2B leads to a Supabase Edge Function instead of inserting directly from the browser into the table.

## 1. Create or update the table

Run the SQL from:

`/supabase/sql/b2b_leads.sql`

This does four important things:

- creates the `public.b2b_leads` table with lead status and spam fields
- adds indexes for `created_at`, `email` and `status`
- keeps RLS enabled
- removes the old public insert policy

If you had already created the previous public policy, this SQL removes it:

```sql
drop policy if exists "allow anon insert b2b leads"
on public.b2b_leads;
```

## 2. Keep the table private

After the SQL above:

- `anon` cannot insert directly into `public.b2b_leads`
- the browser talks only to the Edge Function
- the function writes with the service role on the server side

## 3. Create the Edge Function

Function source:

`/supabase/functions/b2b-lead-submit/index.ts`

Deploy it with the Supabase CLI:

```bash
supabase functions deploy b2b-lead-submit --no-verify-jwt
```

`--no-verify-jwt` keeps invocation simple for this static site. Safety now comes from:

- origin allowlist
- honeypot field
- minimum submit time
- server-side validation
- basic rate limiting by email/IP
- private table writes with the service role

## 4. Set function secrets

In Supabase, set these secrets for the Edge Function:

```bash
supabase secrets set SUPABASE_URL=https://YOUR-PROJECT.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
supabase secrets set B2B_MIN_SECONDS=3
supabase secrets set B2B_RATE_LIMIT_MINUTES=10
supabase secrets set B2B_RATE_LIMIT_COUNT=3
```

If you use preview/staging domains, include them in `ALLOWED_ORIGINS`.

## 5. Configure the website

Open:

`/assets/js/form-config.js`

Fill:

```javascript
window.FVS_SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.FVS_SUPABASE_ANON_KEY = "YOUR_PUBLISHABLE_ANON_KEY";
window.FVS_SUPABASE_FUNCTION = "b2b-lead-submit";
window.FVS_B2B_MIN_SECONDS = 3;
```

## 6. What the front-end sends

The browser sends:

`submitted_at | page_title | page_url | language | form_source | name | company | city_state | country_region | product | monthly_volume | email | whatsapp | message | website | started_at | user_agent`

Notes:

- `website` is the honeypot field and should stay empty
- `started_at` is used to reject submissions that happen too fast
- the function also records `ip`, `status` and `spam_score`

## 7. Test after deploy

Test these pages:

- `/pt/`
- `/en/`
- `/pt/cafe/`
- `/en/coffee/`
- `/pt/b2b/`
- `/en/b2b/`

Expected result:

- successful requests create rows in `public.b2b_leads`
- direct browser insert into the table should no longer work
- spammy submissions should be blocked or flagged

## 8. Next hardening ideas

If you want even more control later, the next upgrades are:

- Cloudflare Turnstile or hCaptcha
- email notification on new lead
- admin dashboard for status updates
- separate `lead_events` table for follow-up history
