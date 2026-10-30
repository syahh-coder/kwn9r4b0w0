-- Reserve worst-case 1 Tavily basic search + 1 batch basic extraction (<=3 URLs).
-- No automatic paid activation. Keep the existing bucket; do not reset usage.
begin;
create or replace function public.reserve_web_search(p_scope text,p_key text,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare job private.check_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended('cekfakta-check:'||p_scope,0));
  select * into job from private.check_jobs where scope=p_scope and request_key=p_key for update;
  if not found or job.state<>'running' or job.token is distinct from p_token or job.lease_until<clock_timestamp()
    or job.web_search_token is not distinct from p_token then return false; end if;
  if not private.spend_check_budget(p_scope,'web-search-day',86400,20,2) then return false; end if;
  update private.check_jobs set web_search_token=p_token where scope=p_scope and request_key=p_key;
  return true;
end;
$$;
commit;
