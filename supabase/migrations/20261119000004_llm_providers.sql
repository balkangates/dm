-- =============================================================================
-- YAPAY ZEKÂ SAĞLAYICILARI (19.11.2026): Gemini · Claude · ChatGPT (OpenAI) · OpenRouter
-- Admin panelinden API anahtarı + model + aktif/pasif. Anahtar veritabanında UYGULAMA TARAFINDA
-- ŞİFRELİ (AES-256-GCM, sunucu sırrı LLM_KEY_SECRET) saklanır; tarayıcıya asla gönderilmez.
-- Tekrar çalıştırılabilir (idempotent).
-- =============================================================================
create table if not exists public.llm_providers (
  provider    text primary key check (provider in ('gemini','claude','openai','openrouter')),
  enabled     boolean not null default false,
  api_key_enc text,
  key_last4   text,
  model       text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.llm_providers enable row level security;

drop policy if exists llm_providers_admin on public.llm_providers;
create policy llm_providers_admin on public.llm_providers for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.llm_providers to authenticated;

-- İşletme personeli için YALNIZCA aktif sağlayıcıların ŞİFRELİ anahtarı (şifre çözme sunucu sırrıyla; tarayıcıda işe yaramaz).
create or replace function public.dv_llm_active()
returns table (provider text, api_key_enc text, model text)
language sql security definer set search_path = public stable as $$
  select p.provider, p.api_key_enc, p.model
    from public.llm_providers p
   where p.enabled and p.api_key_enc is not null
     and (public.is_admin() or exists (select 1 from public.business_staff s where s.user_id = auth.uid() and s.active))
$$;
revoke execute on function public.dv_llm_active() from public, anon;
grant execute on function public.dv_llm_active() to authenticated;

insert into public.llm_providers (provider, model) values
  ('gemini', 'gemini-3.8-flash'), ('claude', 'claude-sonnet-5-5'), ('openai', 'gpt-4o-mini'), ('openrouter', 'anthropic/claude-sonnet-4.5')
on conflict (provider) do nothing;

-- Daha önce 2.5-flash ile kaydedilmiş satır varsa güncelle (Google: 2.5-flash yeni kullanıcılara kapalı).
update public.llm_providers set model = 'gemini-3.8-flash' where provider = 'gemini' and model = 'gemini-2.5-flash';
