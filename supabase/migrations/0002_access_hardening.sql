-- Apply after 0001 on a reviewed DEV database. No cloud migration is automatic.
begin;

-- RLS protects rows, not individual fields. Keep editorial notes out of public rows.
create table public.report_private (
  report_id uuid primary key references public.reports(id) on delete cascade,
  admin_notes text
);
insert into public.report_private (report_id, admin_notes)
  select id, admin_notes from public.reports where admin_notes is not null;
alter table public.reports drop column admin_notes;
alter table public.report_private enable row level security;
create policy "Admins manage private notes" on public.report_private
  for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- Explicit least-privilege grants, independent of Supabase default privileges.
revoke all on public.admin_users, public.reports, public.report_sources,
  public.report_private, public.report_audit from anon, authenticated;
grant select on public.reports, public.report_sources to anon, authenticated;
grant select on public.admin_users, public.report_audit to authenticated;
grant insert, update on public.reports to authenticated;
grant insert, update, delete on public.report_sources to authenticated;
grant select, insert, update, delete on public.report_private to authenticated;
-- Background analysis may insert drafts, but cannot approve or modify reports.
revoke all on public.admin_users, public.reports, public.report_sources,
  public.report_private, public.report_audit from service_role;
grant select, insert on public.reports, public.report_sources to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create function private.guard_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reviewer uuid := auth.uid();
  is_admin boolean;
begin
  select exists(select 1 from public.admin_users where user_id = reviewer) into is_admin;
  if TG_OP = 'INSERT' then
    if new.review_status <> 'draft' or new.published_by is not null or new.published_at is not null then
      raise exception 'Laporan baru wajib draft tanpa identitas penerbit.' using errcode = '42501';
    end if;
  else
    if not is_admin then
      raise exception 'Perubahan laporan memerlukan admin.' using errcode = '42501';
    end if;
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'Identitas laporan tidak dapat diubah.' using errcode = '42501';
    end if;
    if old.review_status = 'published' and new.review_status = 'published' then
      raise exception 'Tarik laporan ke draft sebelum mengedit.' using errcode = '42501';
    end if;
  end if;
  if new.review_status = 'published' then
    if not is_admin then
      raise exception 'Publikasi memerlukan admin.' using errcode = '42501';
    end if;
    if length(trim(new.summary)) = 0 or length(trim(new.reasoning)) = 0
      or not exists(select 1 from public.report_sources where report_id = new.id) then
      raise exception 'Lengkapi ringkasan, alasan, dan sumber sebelum publikasi.' using errcode = '23514';
    end if;
    -- Never trust client-supplied reviewer or publication time.
    new.published_by := reviewer;
    new.published_at := now();
  else
    new.published_by := null;
    new.published_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_report before insert or update on public.reports
  for each row execute function private.guard_report();

create function private.guard_source() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent_id uuid;
begin
  if TG_OP = 'UPDATE' and (new.id is distinct from old.id or new.report_id is distinct from old.report_id) then
    raise exception 'Identitas dan induk sumber tidak dapat diubah.' using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then parent_id := old.report_id; else parent_id := new.report_id; end if;
  -- Parent deletion by a trusted operator can cascade; app roles have no report DELETE grant.
  if TG_OP = 'DELETE' and not exists(select 1 from public.reports where id = parent_id) then
    return old;
  end if;
  -- Lock parent so publication and evidence edits cannot race.
  perform 1 from public.reports where id = parent_id and review_status = 'draft' for update;
  if not found then
    raise exception 'Sumber hanya dapat diubah pada laporan draft.' using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_source before insert or update or delete on public.report_sources
  for each row execute function private.guard_source();

create function private.audit_report_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent_id uuid; metadata jsonb := '{}'::jsonb;
begin
  if TG_TABLE_NAME = 'reports' then
    parent_id := new.id;
    metadata := jsonb_build_object('review_status', new.review_status);
  elsif TG_OP = 'DELETE' then
    parent_id := old.report_id;
  else
    parent_id := new.report_id;
  end if;
  -- Cascading deletes run after the parent is gone. Preserve its ID as metadata,
  -- without attempting to reference a missing parent through the foreign key.
  if not exists(select 1 from public.reports where id = parent_id) then
    metadata := metadata || jsonb_build_object('deleted_report_id', parent_id);
    parent_id := null;
  end if;
  insert into public.report_audit (report_id, actor_id, action, detail)
  values (parent_id, auth.uid(), TG_TABLE_NAME || ':' || lower(TG_OP),
    metadata);
  return null;
end;
$$;
create trigger audit_report after insert or update on public.reports
  for each row execute function private.audit_report_change();
create trigger audit_source after insert or update or delete on public.report_sources
  for each row execute function private.audit_report_change();
create trigger audit_private_notes after insert or update or delete on public.report_private
  for each row execute function private.audit_report_change();

revoke all on function private.guard_report(), private.guard_source(),
  private.audit_report_change() from public, anon, authenticated, service_role;
commit;
