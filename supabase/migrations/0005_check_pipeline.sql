-- INT-01. Backend-only coordinated limits, leases and immutable initial previews.
begin;
create table private.check_counters (
  scope text not null, bucket text not null, window_start timestamptz not null,
  used integer not null check(used>=0), expires_at timestamptz not null,
  primary key(scope,bucket,window_start)
);
create index check_counters_expiry on private.check_counters(expires_at);
create table private.check_jobs (
  scope text not null, request_key text not null check(request_key ~ '^[0-9a-f]{64}$'),
  token uuid not null, state text not null check(state in ('running','done')),
  lease_until timestamptz not null, expires_at timestamptz not null,
  report_id uuid references public.reports(id) on delete set null,
  report_version timestamptz, preview jsonb,
  primary key(scope,request_key)
);
create index check_jobs_expiry on private.check_jobs(expires_at);
alter table private.check_counters enable row level security;
alter table private.check_jobs enable row level security;
revoke all on private.check_counters,private.check_jobs from public,anon,authenticated,service_role;

-- Called only while the caller holds the scope advisory lock. Limits are
-- application ceilings, never claims about external provider/free-tier quotas.
create function private.spend_check_budget(p_scope text,p_bucket text,p_window integer,p_max integer,p_units integer)
returns boolean language plpgsql set search_path='' as $$
declare start_at timestamptz; used_now integer;
begin
  start_at:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window)*p_window);
  select used into used_now from private.check_counters where scope=p_scope and bucket=p_bucket and window_start=start_at;
  if coalesce(used_now,0)+p_units>p_max then return false; end if;
  insert into private.check_counters values(p_scope,p_bucket,start_at,p_units,start_at+make_interval(secs=>p_window*2))
    on conflict(scope,bucket,window_start) do update set used=private.check_counters.used+p_units;
  return true;
end;
$$;

create function public.reserve_check(p_scope text,p_key text,p_subject text,p_url boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.check_jobs; lease uuid; stamp timestamptz:=clock_timestamp(); active integer;
begin
  if p_scope is null or p_scope !~ '^[a-zA-Z0-9_-]{1,64}$'
    or p_key is null or p_key !~ '^[0-9a-f]{64}$'
    or p_subject is null or p_subject !~ '^[0-9a-f]{64}$' or p_url is null then
    raise exception 'Parameter pemeriksaan tidak valid.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cekfakta-check:'||p_scope,0));
  -- Bounded opportunistic cleanup; no public claims or raw IPs are stored here.
  delete from private.check_counters where ctid in (select ctid from private.check_counters where scope=p_scope and expires_at<stamp limit 100);
  delete from private.check_jobs where ctid in (select ctid from private.check_jobs where scope=p_scope and expires_at<stamp and lease_until<stamp limit 100);
  if not private.spend_check_budget(p_scope,'requests',60,120,1)
    or not private.spend_check_budget(p_scope,'subject:'||p_subject,600,5,1) then
    return jsonb_build_object('status','rate_limited','retryAfter',600);
  end if;
  select * into job from private.check_jobs where scope=p_scope and request_key=p_key for update;
  if found and job.expires_at>stamp then
    if job.state='running' and job.lease_until>stamp then return jsonb_build_object('status','processing','retryAfter',3); end if;
    if job.state='done' and exists(select 1 from public.reports where id=job.report_id and review_status='draft' and updated_at=job.report_version) then
      return jsonb_build_object('status','cached','preview',job.preview);
    end if;
  end if;
  select count(*) into active from private.check_jobs where scope=p_scope and state='running' and lease_until>stamp;
  if active>=3 then return jsonb_build_object('status','busy','retryAfter',5); end if;
  -- Reserve worst-case spend before fetching or calling any provider. Unused
  -- reservations are deliberately not refunded; failed calls can consume quota.
  if not private.spend_check_budget(p_scope,'jobs-minute',60,10,1)
    or not private.spend_check_budget(p_scope,'jobs-day',86400,20,1)
    or not private.spend_check_budget(p_scope,'gemini-minute',60,20,2)
    or not private.spend_check_budget(p_scope,'gemini-day',86400,40,2)
    or not private.spend_check_budget(p_scope,'factcheck-day',86400,20,1)
    or (p_url and not private.spend_check_budget(p_scope,'url-day',86400,20,1)) then
    return jsonb_build_object('status','budget_exhausted','retryAfter',3600);
  end if;
  lease:=gen_random_uuid();
  insert into private.check_jobs(scope,request_key,token,state,lease_until,expires_at)
    values(p_scope,p_key,lease,'running',stamp+interval '90 seconds',stamp+interval '5 minutes')
    on conflict(scope,request_key) do update set token=excluded.token,state='running',lease_until=excluded.lease_until,
      expires_at=excluded.expires_at,report_id=null,report_version=null,preview=null;
  return jsonb_build_object('status','reserved','token',lease);
end;
$$;

create function public.fail_check(p_scope text,p_key text,p_token uuid)
returns void language sql security definer set search_path='' as $$
  delete from private.check_jobs where scope=p_scope and request_key=p_key and token=p_token and state='running';
$$;

create function public.complete_check(p_scope text,p_key text,p_token uuid,p_document jsonb,p_input_type text,p_url text,p_analysis boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.check_jobs; saved public.reports; response jsonb; refs jsonb;
begin
  select * into job from private.check_jobs where scope=p_scope and request_key=p_key for update;
  if not found or job.token is distinct from p_token or job.state<>'running' or job.lease_until<clock_timestamp() then
    raise exception 'Lease sudah tidak berlaku.' using errcode='40001';
  end if;
  if jsonb_typeof(p_document) is distinct from 'object' or length(p_document::text)>100000
    or p_document->>'verdict' is distinct from 'unverified'
    or p_input_type is null or p_input_type not in ('text','url') or p_analysis is null
    or (p_input_type='text' and p_url is not null)
    or (p_input_type='url' and (p_url is null or p_url !~ '^https?://' or length(p_url)>2000))
    or coalesce(length(p_document->>'summary'),0) not between 1 and 3000
    or coalesce(length(p_document->>'reasoning'),0) not between 1 and 8000
    or coalesce(length(p_document->>'adminNotes'),0)>5000
    or jsonb_typeof(p_document->'limitations') is distinct from 'array'
    or jsonb_array_length(p_document->'limitations')>8
    or jsonb_typeof(p_document->'candidates') is distinct from 'array'
    or jsonb_array_length(p_document->'candidates')>10 then
    raise exception 'Draft tidak valid.' using errcode='22023';
  end if;
  insert into public.reports(claim,input_type,submitted_url,category,verdict,summary,reasoning)
    values(p_document->>'claim',p_input_type,p_url,p_document->>'category','unverified',p_document->>'summary',p_document->>'reasoning')
    returning * into saved;
  insert into public.report_private(report_id,admin_notes) values(saved.id,p_document->>'adminNotes');
  perform public.attach_report_candidates(saved.id,p_document->'candidates');
  select coalesce(jsonb_agg(jsonb_build_object('url',item->>'source_url','title',item->>'source_title',
    'publisher',item->>'publisher','publishedAt',null,'reviewedAt',item->>'review_date')), '[]'::jsonb)
    into refs from jsonb_array_elements(p_document->'candidates') item;
  response:=jsonb_build_object('mode','analysis','id',saved.id,'claim',saved.claim,'category',saved.category,
    'verdict','unverified','reviewStatus','draft','summary',saved.summary,'reason',saved.reasoning,
    'analysisAvailable',p_analysis,'limitations',p_document->'limitations','sources',refs,
    'notice','Hasil awal belum ditinjau admin. Laporan tidak dipublikasikan otomatis.');
  update private.check_jobs set state='done',report_id=saved.id,report_version=saved.updated_at,preview=response,
    expires_at=clock_timestamp()+interval '5 minutes' where scope=p_scope and request_key=p_key;
  return response;
end;
$$;

revoke all on function private.spend_check_budget(text,text,integer,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.reserve_check(text,text,text,boolean),public.fail_check(text,text,uuid),
  public.complete_check(text,text,uuid,jsonb,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.reserve_check(text,text,text,boolean),public.fail_check(text,text,uuid),
  public.complete_check(text,text,uuid,jsonb,text,text,boolean) to service_role;
commit;
