-- DEV MIGRATION DRAFT — review with Erge before applying. Do not run blindly on production.
-- Public users can read only published reports, never draft reports or audit logs.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  claim text not null check (char_length(claim) between 20 and 10000),
  input_type text not null check (input_type in ('text','url')),
  submitted_url text,
  category text not null check (category in ('education','politics','conservation')),
  verdict text not null default 'unverified' check (verdict in ('hoax','valid','unverified')),
  review_status text not null default 'draft' check (review_status in ('draft','published','rejected')),
  summary text not null default '',
  reasoning text not null default '',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references auth.users(id),
  constraint publish_requires_reviewer check (review_status <> 'published' or (published_at is not null and published_by is not null))
);

create table if not exists public.report_sources (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  source_url text not null,
  source_title text not null,
  source_domain text,
  excerpt text,
  source_published_at timestamptz,
  collected_at timestamptz not null default now()
);

create table if not exists public.report_audit (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  actor_id uuid references auth.users(id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now()
);

create index if not exists idx_reports_published on public.reports (published_at desc) where review_status = 'published';
create index if not exists idx_reports_category_verdict on public.reports (category,verdict);
create index if not exists idx_report_sources_parent on public.report_sources(report_id);

alter table public.admin_users enable row level security;
alter table public.reports enable row level security;
alter table public.report_sources enable row level security;
alter table public.report_audit enable row level security;

-- Admin list: each authenticated user may read ONLY their own membership.
create policy "Admin can read own membership" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

-- Reports are publicly readable only after approval; admins also see drafts.
create policy "Public reads published reports" on public.reports
  for select to anon, authenticated using (review_status = 'published');
create policy "Admins read all reports" on public.reports
  for select to authenticated using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );
create policy "Admins insert report" on public.reports
  for insert to authenticated with check (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
    and review_status = 'draft'
  );
create policy "Admins modify report" on public.reports
  for update to authenticated using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );
-- Intentionally no public DELETE policy. Rejection/retraction should use UPDATE.

create policy "Public reads sources for published reports" on public.report_sources
  for select to anon, authenticated using (
    exists (select 1 from public.reports r where r.id = report_id and r.review_status = 'published')
  );
create policy "Admins read all sources" on public.report_sources
  for select to authenticated using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );
create policy "Admins add sources" on public.report_sources
  for insert to authenticated with check (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );
create policy "Admins update sources" on public.report_sources
  for update to authenticated using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );
create policy "Admins delete sources" on public.report_sources
  for delete to authenticated using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );

create policy "Admins read audits" on public.report_audit
  for select to authenticated using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );
-- Writes to audit table must originate from trusted database trigger / server-controlled service.
-- Security audit: UPDATE policies alone do not enforce truthful published_by identity.
-- Implement a SECURITY DEFINER approval function with strict permissions or trigger
-- that sets reviewer to auth.uid(), writes audit event and blocks unauthorized publish.
-- Until then DO NOT enable publishing feature in application.
