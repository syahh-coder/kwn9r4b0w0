-- Additive local/dev migration; review separately before any cloud application.
begin;
alter table public.report_sources
  add column candidate_key text,
  add column provider text,
  add column publisher text,
  add column matched_claim text,
  add column claimant text,
  add column claim_date timestamptz,
  add column review_date timestamptz,
  add column original_rating text,
  add column language_code text,
  add column evidence_kind text;

-- Existing editorial sources remain valid without generated provenance fields.
alter table public.report_sources add constraint candidate_provenance_shape check (
  (candidate_key is null and provider is null and evidence_kind is null)
  or (
    candidate_key is not null and candidate_key ~ '^[0-9a-f]{64}$'
    and provider is not null and provider = 'google_fact_check'
    and evidence_kind is not null and evidence_kind = 'claim_review_metadata'
    and publisher is not null and char_length(publisher) between 1 and 300
    and matched_claim is not null and char_length(matched_claim) between 1 and 5000
    and char_length(source_url) between 1 and 2000 and source_url ~ '^https?://'
    and char_length(source_title) between 1 and 1000
    and (claimant is null or char_length(claimant) <= 300)
    and (original_rating is null or char_length(original_rating) <= 300)
    and (language_code is null or char_length(language_code) <= 35)
  )
);
create unique index idx_report_source_candidate on public.report_sources(report_id, candidate_key)
  where candidate_key is not null;

-- INVOKER: existing grants and RLS still apply. This is not an auth bypass.
-- Each INSERT runs the existing source guard (locks draft parent) and audit trigger.
create function public.attach_report_candidates(p_report_id uuid, p_candidates jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare item jsonb; affected integer; inserted integer := 0;
begin
  if jsonb_typeof(p_candidates) is distinct from 'array' then
    raise exception 'Kandidat sumber harus berupa array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_candidates) > 20 then
    raise exception 'Maksimum 20 kandidat sumber.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.reports where id = p_report_id and review_status = 'draft') then
    raise exception 'Laporan draft tidak tersedia untuk akun ini.' using errcode = '42501';
  end if;
  for item in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(item) is distinct from 'object'
      or item->>'provider' is distinct from 'google_fact_check'
      or item->>'evidence_kind' is distinct from 'claim_review_metadata'
      or item->>'candidate_key' is null or item->>'publisher' is null
      or item->>'matched_claim' is null or item->>'source_url' is null
      or item->>'source_title' is null or item->>'collected_at' is null then
      raise exception 'Provenance kandidat tidak lengkap.' using errcode = '22023';
    end if;
    insert into public.report_sources (
      report_id, candidate_key, provider, source_url, source_title, source_domain,
      publisher, matched_claim, claimant, claim_date, review_date, collected_at,
      original_rating, language_code, evidence_kind
    ) values (
      p_report_id, item->>'candidate_key', item->>'provider', item->>'source_url',
      item->>'source_title', item->>'source_domain', item->>'publisher',
      item->>'matched_claim', item->>'claimant', (item->>'claim_date')::timestamptz,
      (item->>'review_date')::timestamptz, (item->>'collected_at')::timestamptz,
      item->>'original_rating', item->>'language_code', item->>'evidence_kind'
    ) on conflict (report_id, candidate_key) where candidate_key is not null do nothing;
    get diagnostics affected = row_count;
    inserted := inserted + affected;
  end loop;
  return inserted;
end;
$$;
revoke all on function public.attach_report_candidates(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.attach_report_candidates(uuid, jsonb) to authenticated, service_role;
commit;
