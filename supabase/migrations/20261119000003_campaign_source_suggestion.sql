-- Öneri motoru (Faz 3): motorun önerisinden oluşturulan kampanyalar işaretlenir; sonuçları ölçülür.
alter table public.campaigns add column if not exists source_suggestion text;
create index if not exists campaigns_source_suggestion_idx on public.campaigns (business_id, source_suggestion) where source_suggestion is not null;
