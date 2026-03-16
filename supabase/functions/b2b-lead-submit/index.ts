import { createClient } from "npm:@supabase/supabase-js@2";

type LeadPayload = {
  name?: string;
  company?: string;
  city_state?: string;
  country_region?: string;
  product?: string;
  monthly_volume?: string;
  email?: string;
  whatsapp?: string;
  message?: string;
  website?: string;
  started_at?: string;
  submitted_at?: string;
  page_title?: string;
  page_url?: string;
  language?: string;
  form_source?: string;
  user_agent?: string;
};

const MAX_LENGTH = {
  short: 120,
  medium: 180,
  long: 600,
  message: 2000,
};

const STATUS = {
  new: "new",
  spam: "spam",
};

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, corsHeaders);
  }

  let payload: LeadPayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const normalized = normalizePayload(payload);
  const email = normalized.email.toLowerCase();
  const ip = getClientIp(request);
  const userAgent = trimValue(request.headers.get("user-agent"), MAX_LENGTH.long);
  const spamSignals = getSpamSignals(normalized, request);
  const spamScore = spamSignals.length;

  if (normalized.website) {
    return jsonResponse({ ok: true }, 200, corsHeaders);
  }

  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: "Invalid email" }, 400, corsHeaders);
  }

  if (!normalized.company && !normalized.name) {
    return jsonResponse({ error: "Name or company is required" }, 400, corsHeaders);
  }

  if (!normalized.monthly_volume && !normalized.message) {
    return jsonResponse({ error: "Monthly volume or message is required" }, 400, corsHeaders);
  }

  if (spamSignals.includes("submitted_too_fast")) {
    return jsonResponse({ error: "Submission rejected" }, 429, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase environment variables" }, 500, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const rateLimitWindowMinutes = Number(Deno.env.get("B2B_RATE_LIMIT_MINUTES") || 10);
  const rateLimitThreshold = Number(Deno.env.get("B2B_RATE_LIMIT_COUNT") || 3);
  const windowStart = new Date(Date.now() - rateLimitWindowMinutes * 60_000).toISOString();
  const rateLimitFilters = [`email.eq.${escapeFilterValue(email)}`];

  if (ip) {
    rateLimitFilters.push(`ip.eq.${escapeFilterValue(ip)}`);
  }

  const { count, error: rateLimitError } = await supabase
    .from("b2b_leads")
    .select("id", { count: "exact", head: true })
    .gte("created_at", windowStart)
    .or(rateLimitFilters.join(","));

  if (rateLimitError) {
    console.error("Rate limit lookup failed", rateLimitError);
    return jsonResponse({ error: "Could not process request" }, 500, corsHeaders);
  }

  if ((count || 0) >= rateLimitThreshold) {
    return jsonResponse({ error: "Too many requests. Please try again later." }, 429, corsHeaders);
  }

  const row = {
    submitted_at: normalized.submitted_at || new Date().toISOString(),
    page_title: normalized.page_title,
    page_url: normalized.page_url,
    language: normalized.language,
    form_source: normalized.form_source,
    name: normalized.name,
    company: normalized.company,
    city_state: normalized.city_state,
    country_region: normalized.country_region,
    product: normalized.product,
    monthly_volume: normalized.monthly_volume,
    email,
    whatsapp: normalized.whatsapp,
    message: normalized.message,
    website: normalized.website,
    started_at: normalized.started_at || null,
    ip,
    user_agent: userAgent,
    spam_score: spamScore,
    status: spamScore >= 2 ? STATUS.spam : STATUS.new,
  };

  const { error: insertError } = await supabase.from("b2b_leads").insert(row);

  if (insertError) {
    console.error("Lead insert failed", insertError);
    return jsonResponse({ error: "Could not save request" }, 500, corsHeaders);
  }

  return jsonResponse({ ok: true }, 200, corsHeaders);
});

function normalizePayload(payload: LeadPayload) {
  return {
    name: trimValue(payload.name, MAX_LENGTH.short),
    company: trimValue(payload.company, MAX_LENGTH.medium),
    city_state: trimValue(payload.city_state, MAX_LENGTH.medium),
    country_region: trimValue(payload.country_region, MAX_LENGTH.medium),
    product: trimValue(payload.product, MAX_LENGTH.short),
    monthly_volume: trimValue(payload.monthly_volume, MAX_LENGTH.short),
    email: trimValue(payload.email, MAX_LENGTH.medium),
    whatsapp: trimValue(payload.whatsapp, MAX_LENGTH.medium),
    message: trimValue(payload.message, MAX_LENGTH.message),
    website: trimValue(payload.website, MAX_LENGTH.short),
    started_at: trimValue(payload.started_at, MAX_LENGTH.medium),
    submitted_at: trimValue(payload.submitted_at, MAX_LENGTH.medium),
    page_title: trimValue(payload.page_title, MAX_LENGTH.medium),
    page_url: trimValue(payload.page_url, MAX_LENGTH.long),
    language: trimValue(payload.language, MAX_LENGTH.short),
    form_source: trimValue(payload.form_source, MAX_LENGTH.short),
  };
}

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "null",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function isAllowedOrigin(origin: string | null) {
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configuredOrigins.length) {
    return true;
  }

  if (!origin) {
    return false;
  }

  return configuredOrigins.includes(origin);
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfIp = request.headers.get("cf-connecting-ip");
  const rawValue = forwardedFor?.split(",")[0] || realIp || cfIp || "";
  return trimValue(rawValue, MAX_LENGTH.short);
}

function getSpamSignals(payload: ReturnType<typeof normalizePayload>, request: Request) {
  const signals: string[] = [];
  const startedAt = payload.started_at ? new Date(payload.started_at) : null;
  const minimumSeconds = Number(Deno.env.get("B2B_MIN_SECONDS") || 3);
  const referer = request.headers.get("referer") || "";

  if (startedAt && !Number.isNaN(startedAt.getTime())) {
    const elapsedSeconds = (Date.now() - startedAt.getTime()) / 1000;
    if (elapsedSeconds < minimumSeconds) {
      signals.push("submitted_too_fast");
    }
  }

  if (!referer) {
    signals.push("missing_referer");
  }

  if (!payload.message && !payload.monthly_volume) {
    signals.push("missing_context");
  }

  return signals;
}

function trimValue(value: string | null | undefined, limit: number) {
  return String(value || "").trim().slice(0, limit);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeFilterValue(value: string) {
  return value.replaceAll(",", "\\,");
}

function jsonResponse(payload: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}
