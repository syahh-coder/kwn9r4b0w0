-- DATA-04: additive local/dev migration. Cloud requires separate review/approval.
begin;
alter table public.report_sources
  add column content_hash text,
  add column quote_start integer,
  add column quote_end integer;
alter table public.report_sources drop constraint candidate_provenance_shape;
alter table public.report_sources add constraint candidate_provenance_shape check (
  (candidate_key is null and provider is null and evidence_kind is null and content_hash is null and quote_start is null and quote_end is null)
  or (
    candidate_key is not null and candidate_key ~ '^[0-9a-f]{64}$' and provider is not null and evidence_kind is not null
    and publisher is not null and char_length(publisher) between 1 and 300
    and matched_claim is not null and char_length(matched_claim) between 1 and 5000
    and char_length(source_url) between 1 and 2000 and source_url ~ '^https?://'
    and char_length(source_title) between 1 and 1000
    and (claimant is null or char_length(claimant)<=300)
    and (original_rating is null or char_length(original_rating)<=300)
    and (language_code is null or char_length(language_code)<=35)
    and (
      (provider='google_fact_check' and evidence_kind='claim_review_metadata' and content_hash is null and quote_start is null and quote_end is null)
      or (provider='tavily' and original_rating is null and review_date is null
        and ((evidence_kind='web_search_metadata' and content_hash is null and excerpt is null and quote_start is null and quote_end is null)
          or (evidence_kind='web_source_content' and content_hash is not null and content_hash ~ '^[0-9a-f]{64}$'
            and ((excerpt is null and quote_start is null and quote_end is null)
              or (excerpt is not null and char_length(excerpt) between 20 and 1000
                and quote_start is not null and quote_end is not null and quote_start>=0 and quote_end>quote_start and quote_end<=12000)))))
    )
  )
);

create or replace function public.attach_report_candidates(p_report_id uuid,p_candidates jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; affected integer; inserted integer:=0;
begin
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>20 then
    raise exception 'Kandidat sumber tidak valid.' using errcode='22023';
  end if;
  if not exists(select 1 from public.reports where id=p_report_id and review_status='draft') then
    raise exception 'Laporan draft tidak tersedia untuk akun ini.' using errcode='42501';
  end if;
  for item in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(item) is distinct from 'object' or item->>'provider' is null or item->>'provider' not in ('google_fact_check','tavily')
      or item->>'evidence_kind' is null or item->>'candidate_key' is null or item->>'publisher' is null
      or item->>'matched_claim' is null or item->>'source_url' is null or item->>'source_title' is null or item->>'collected_at' is null then
      raise exception 'Provenance kandidat tidak lengkap.' using errcode='22023';
    end if;
    insert into public.report_sources(report_id,candidate_key,provider,source_url,source_title,source_domain,
      publisher,matched_claim,claimant,claim_date,review_date,collected_at,original_rating,language_code,evidence_kind,
      source_published_at,excerpt,content_hash,quote_start,quote_end)
    values(p_report_id,item->>'candidate_key',item->>'provider',item->>'source_url',item->>'source_title',item->>'source_domain',
      item->>'publisher',item->>'matched_claim',item->>'claimant',(item->>'claim_date')::timestamptz,(item->>'review_date')::timestamptz,
      (item->>'collected_at')::timestamptz,item->>'original_rating',item->>'language_code',item->>'evidence_kind',
      (item->>'source_published_at')::timestamptz,item->>'excerpt',item->>'content_hash',(item->>'quote_start')::integer,(item->>'quote_end')::integer)
    on conflict(report_id,candidate_key) where candidate_key is not null do nothing;
    get diagnostics affected=row_count; inserted:=inserted+affected;
  end loop;
  return inserted;
end;
$$;

alter table private.check_jobs add column web_search_token uuid;
create function public.reserve_web_search(p_scope text,p_key text,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare job private.check_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended('cekfakta-check:'||p_scope,0));
  select * into job from private.check_jobs where scope=p_scope and request_key=p_key for update;
  if not found or job.state<>'running' or job.token is distinct from p_token or job.lease_until<clock_timestamp()
    or job.web_search_token is not distinct from p_token then return false; end if;
  -- One fixed-cost basic search per active job, no retry/advanced/auto mode.
  if not private.spend_check_budget(p_scope,'web-search-day',86400,20,1) then return false; end if;
  update private.check_jobs set web_search_token=p_token where scope=p_scope and request_key=p_key;
  return true;
end;
$$;
revoke all on function public.reserve_web_search(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_web_search(text,text,uuid) to service_role;

-- Reuse the audited atomic save/lease guard; the internal function is no longer
-- exposed through PostgREST and cannot be executed by application roles.
alter function public.complete_check(text,text,uuid,jsonb,text,text,boolean) set schema private;
alter function private.complete_check(text,text,uuid,jsonb,text,text,boolean) rename to complete_check_v1;
revoke all on function private.complete_check_v1(text,text,uuid,jsonb,text,text,boolean) from public,anon,authenticated,service_role;
create function public.complete_check(p_scope text,p_key text,p_token uuid,p_document jsonb,p_input_type text,p_url text,p_analysis boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare response jsonb; refs jsonb;
begin
  response:=private.complete_check_v1(p_scope,p_key,p_token,p_document,p_input_type,p_url,p_analysis);
  select coalesce(jsonb_agg(jsonb_build_object('url',item->>'source_url','title',item->>'source_title',
    'publisher',item->>'publisher','publishedAt',item->>'source_published_at','reviewedAt',item->>'review_date',
    'excerpt',item->>'excerpt','kind',item->>'evidence_kind')),'[]'::jsonb)
    into refs from jsonb_array_elements(p_document->'candidates') item;
  response:=jsonb_set(response,'{sources}',refs);
  update private.check_jobs set preview=response where scope=p_scope and request_key=p_key and token=p_token;
  return response;
end;
$$;
revoke all on function public.complete_check(text,text,uuid,jsonb,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.complete_check(text,text,uuid,jsonb,text,text,boolean) to service_role;
commit;
