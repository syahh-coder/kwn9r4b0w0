import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeFactCheckResponse } from "../src/lib/evidence/google-fact-check.mjs";
import { sourcePayload } from "../src/lib/evidence/source-repository.mjs";

// Real PostgreSQL SQL/RLS execution, with a minimal TEST-ONLY Supabase auth schema.
// Does not test GoTrue, PostgREST, JWT validation, or production Supabase grants.
test("migrations enforce public, non-admin, admin and background-worker boundaries", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = "00000000-0000-0000-0000-000000000001";
  const outsider = "00000000-0000-0000-0000-000000000002";
  const report = "00000000-0000-0000-0000-000000000010";
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    insert into auth.users values ('${admin}'), ('${outsider}');
  `);
  for (const name of ["0001_schema.sql", "0002_access_hardening.sql", "0003_source_provenance.sql"]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    if (name === "0001_schema.sql") {
      await db.exec(`insert into public.reports (claim,input_type,category,admin_notes)
        values ('Klaim legacy fiktif untuk uji migrasi.', 'text','education','Catatan sebelum migrasi.');`);
    }
  }
  await t.test("hardening migration preserves existing private notes", async () => {
    const notes = (await db.query("select admin_notes from public.report_private")).rows;
    assert.deepEqual(notes, [{ admin_notes: "Catatan sebelum migrasi." }]);
    const columns = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='reports'")).rows;
    assert.equal(columns.some(row => row.column_name === "admin_notes"), false);
    // Remove only this in-memory migration fixture as test database owner.
    await db.exec("delete from public.reports");
  });
  await db.query("insert into public.admin_users (user_id) values ($1)", [admin]);
  async function role(name, uid = "") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    // name is a fixed test role, never supplied by app users.
    await db.exec(`set role ${name}`);
  }
  const count = async table => Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);
  const denied = async sql => assert.rejects(db.exec(sql), error => error.code === "42501");
  const createDraft = `insert into public.reports (id, claim, input_type, category, summary, reasoning)
    values ('${report}', 'Klaim fiktif khusus pengujian database.', 'text', 'education', 'Ringkasan fixture.', 'Alasan fixture.')`;

  await t.test("guest cannot create reports or read private tables", async () => {
    await role("anon");
    assert.equal(await count("reports"), 0);
    await denied(createDraft);
    await denied("select * from public.admin_users");
    await denied("select * from public.report_private");
    await denied("select * from public.report_audit");
    await denied("select private.guard_report()");
    await denied(`select public.attach_report_candidates('${report}', '[]'::jsonb)`);
  });
  await t.test("authenticated non-admin cannot grant themselves membership or create drafts", async () => {
    await role("authenticated", outsider);
    assert.equal(await count("admin_users"), 0);
    await denied(`insert into public.admin_users (user_id) values ('${outsider}')`);
    await denied(createDraft);
  });
  await t.test("background worker can only create draft, with audit", async () => {
    await role("service_role");
    await denied(`insert into public.reports (claim,input_type,category,review_status,published_by,published_at)
      values ('Klaim fiktif terlarang untuk pengujian.', 'text','education','published','${admin}',now())`);
    await db.exec(createDraft);
    await denied(`update public.reports set review_status='published' where id='${report}'`);
    await denied("insert into public.report_audit (action) values ('forged')");
  });
  await t.test("draft and its sources are hidden from guests and non-admins", async () => {
    await role("authenticated", admin);
    assert.equal(await count("reports"), 1);
    await db.exec(`insert into public.report_sources (report_id,source_url,source_title)
      values ('${report}','https://example.org/test-fixture','Sumber fiktif pengujian');
      insert into public.report_private values ('${report}', 'Catatan rahasia fixture.');`);
    for (const [name, uid] of [["anon", ""], ["authenticated", outsider]]) {
      await role(name, uid);
      assert.equal(await count("reports"), 0);
      assert.equal(await count("report_sources"), 0);
    }
    assert.equal(await count("report_private"), 0);
    assert.equal(await count("report_audit"), 0);
    await denied(`insert into public.report_sources (report_id,source_url,source_title) values ('${report}','https://example.org','forged')`);
    const updated = await db.query(`update public.reports set summary='forged' where id='${report}' returning id`);
    assert.equal(updated.rows.length, 0);
  });
  await t.test("candidate batch preserves provenance, deduplicates, rolls back and respects RLS", async () => {
    const candidates = normalizeFactCheckResponse({ claims: [{ text: "Klaim fiktif untuk uji provenance.", claimant: "Entitas fiktif", claimDate: "2025-01-01T00:00:00Z", claimReview: [{ url: "https://example.org/provenance", title: "Fixture sumber", publisher: { name: "Penerbit fiktif" }, reviewDate: "2025-01-02T00:00:00Z", textualRating: "Rating fiktif" }] }] }, "2026-10-24T00:00:00Z");
    const payload = sourcePayload(candidates);
    const attach = items => db.query("select public.attach_report_candidates($1, $2::jsonb) as n", [report, JSON.stringify(items)]);
    await role("authenticated", outsider);
    await assert.rejects(attach(payload), error => error.code === "42501");
    await role("service_role");
    assert.equal((await attach(payload)).rows[0].n, 1);
    assert.equal((await attach(payload)).rows[0].n, 0);
    await role("authenticated", admin);
    const stored = (await db.query("select * from public.report_sources where candidate_key is not null")).rows;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].publisher, "Penerbit fiktif");
    assert.equal(stored[0].matched_claim, candidates[0].claimText);
    assert.equal(stored[0].source_published_at, null);
    assert.equal(new Date(stored[0].claim_date).toISOString(), "2025-01-01T00:00:00.000Z");
    assert.equal(new Date(stored[0].review_date).toISOString(), "2025-01-02T00:00:00.000Z");
    assert.equal(new Date(stored[0].collected_at).toISOString(), "2026-10-24T00:00:00.000Z");
    await assert.rejects(attach([{ ...payload[0], candidate_key: "b".repeat(64) }, { ...payload[0], candidate_key: "invalid" }]), error => error.code === "23514");
    assert.equal((await db.query("select count(*) as n from public.report_sources where candidate_key is not null")).rows[0].n, 1);
    await assert.rejects(attach([{}]), error => error.code === "22023");
    await assert.rejects(attach(Array(21).fill(payload[0])), error => error.code === "22023");
    await db.exec("delete from public.report_sources where candidate_key is not null");
  });
  await t.test("only admin publishes; reviewer is assigned by database; audit is immutable", async () => {
    await role("authenticated", admin);
    await db.exec(`update public.reports set review_status='published', published_by='${outsider}', published_at='2000-01-01' where id='${report}'`);
    const row = (await db.query("select * from public.reports")).rows[0];
    assert.equal(row.published_by, admin);
    assert.ok(new Date(row.published_at).getUTCFullYear() > 2000);
    assert.equal("admin_notes" in row, false);
    assert.ok(await count("report_audit") >= 4);
    await denied("insert into public.report_audit (action) values ('forged')");
    await denied("delete from public.report_audit");
    await denied(`delete from public.reports where id='${report}'`);
    await denied(`update public.reports set summary='Silent edit' where id='${report}'`);
    await denied(`delete from public.report_sources where report_id='${report}'`);
    const auditRows = (await db.query("select detail from public.report_audit")).rows;
    assert.equal(JSON.stringify(auditRows).includes("Catatan rahasia"), false);
    await denied(`select public.attach_report_candidates('${report}', '[]'::jsonb)`);
  });
  await t.test("published report and sources public; notes and audit stay private", async () => {
    for (const [name, uid] of [["anon", ""], ["authenticated", outsider]]) {
      await role(name, uid);
      assert.equal(await count("reports"), 1);
      assert.equal(await count("report_sources"), 1);
    }
    assert.equal(await count("report_private"), 0);
    assert.equal(await count("report_audit"), 0);
    const updated = await db.query(`update public.reports set review_status='draft' where id='${report}' returning id`);
    assert.equal(updated.rows.length, 0);
  });
  await t.test("retraction hides report and sources; publication needs evidence", async () => {
    await role("authenticated", admin);
    await db.exec(`update public.reports set review_status='draft' where id='${report}'`);
    const row = (await db.query("select * from public.reports")).rows[0];
    assert.equal(row.published_by, null);
    assert.equal(row.published_at, null);
    await db.exec(`delete from public.report_sources where report_id='${report}'`);
    await assert.rejects(db.exec(`update public.reports set review_status='published' where id='${report}'`), error => error.code === "23514");
    await role("anon");
    assert.equal(await count("reports"), 0);
    assert.equal(await count("report_sources"), 0);
  });
});
