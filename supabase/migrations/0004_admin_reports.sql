-- BE-03: user-scoped atomic editorial operations. Apply to reviewed local/dev only.
begin;

create function public.save_report_draft(p_id uuid, p_expected timestamptz, p_document jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  result public.reports;
  source jsonb;
begin
  if not exists(select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Admin diperlukan.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_document) is distinct from 'object'
    or length(p_document::text) > 100000
    or jsonb_typeof(p_document->'sources') is distinct from 'array'
    or jsonb_array_length(p_document->'sources') > 20
    or jsonb_typeof(p_document->'candidates') is distinct from 'array'
    or jsonb_array_length(p_document->'candidates') > 20
    or coalesce(p_document->>'verdict','') not in ('unverified','valid','hoax') then
    raise exception 'Dokumen tidak valid.' using errcode = '22023';
  end if;
  if p_id is null then
    if p_expected is not null or p_document->>'verdict' <> 'unverified' then
      raise exception 'Laporan baru wajib unverified.' using errcode = '22023';
    end if;
    insert into public.reports(claim,input_type,category,summary,reasoning)
      values(p_document->>'claim','text',p_document->>'category',p_document->>'summary',p_document->>'reasoning')
      returning * into result;
  else
    select * into result from public.reports where id = p_id for update;
    if not found then raise exception 'Laporan tidak ditemukan.' using errcode = 'P0002'; end if;
    if result.updated_at is distinct from p_expected or result.review_status <> 'draft' then
      raise exception 'Versi atau status berubah.' using errcode = '40001';
    end if;
    update public.reports set claim=p_document->>'claim',category=p_document->>'category',
      verdict=p_document->>'verdict',summary=p_document->>'summary',reasoning=p_document->>'reasoning'
      where id=p_id returning * into result;
    -- Preserve retrieved ClaimReview provenance; only replace editorial sources.
    delete from public.report_sources where report_id=p_id and candidate_key is null;
  end if;
  insert into public.report_private(report_id,admin_notes) values(result.id,p_document->>'adminNotes')
    on conflict(report_id) do update set admin_notes=excluded.admin_notes;
  for source in select value from jsonb_array_elements(p_document->'sources') loop
    if coalesce(source->>'url','') !~ '^https?://' or length(source->>'url') > 2000
      or coalesce(length(trim(source->>'title')),0) not between 1 and 1000
      or coalesce(length(source->>'excerpt'),0) > 2000 then
      raise exception 'Sumber tidak valid.' using errcode = '22023';
    end if;
    insert into public.report_sources(report_id,source_url,source_title,excerpt,source_published_at)
      values(result.id,source->>'url',source->>'title',source->>'excerpt',nullif(source->>'publishedAt','')::timestamptz);
  end loop;
  perform public.attach_report_candidates(result.id,p_document->'candidates');
  return to_jsonb(result);
end;
$$;

create function public.admin_report_action(p_id uuid, p_expected timestamptz, p_action text, p_reviewed boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result public.reports; target text;
begin
  if not exists(select 1 from public.admin_users where user_id=auth.uid()) then
    raise exception 'Admin diperlukan.' using errcode = '42501';
  end if;
  select * into result from public.reports where id=p_id for update;
  if not found then raise exception 'Laporan tidak ditemukan.' using errcode='P0002'; end if;
  if result.updated_at is distinct from p_expected then
    raise exception 'Versi berubah.' using errcode='40001';
  end if;
  if p_action='publish' and result.review_status='draft' and p_reviewed is true then target := 'published';
  elsif p_action='retract' and result.review_status='published' then target := 'draft';
  elsif p_action='restore' and result.review_status='rejected' then target := 'draft';
  elsif p_action='reject' and result.review_status='draft' then target := 'rejected';
  else raise exception 'Transisi atau persetujuan tidak valid.' using errcode='22023';
  end if;
  update public.reports set review_status=target where id=p_id returning * into result;
  return to_jsonb(result);
end;
$$;

revoke all on function public.save_report_draft(uuid,timestamptz,jsonb),
  public.admin_report_action(uuid,timestamptz,text,boolean) from public,anon,service_role;
grant execute on function public.save_report_draft(uuid,timestamptz,jsonb),
  public.admin_report_action(uuid,timestamptz,text,boolean) to authenticated;
commit;
