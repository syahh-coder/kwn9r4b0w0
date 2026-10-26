import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeFactCheckResponse } from "../src/lib/evidence/google-fact-check.mjs";
import { sourcePayload } from "../src/lib/evidence/source-repository.mjs";

test("editorial RPC transactions, optimistic versions, approval and archive enforce RLS", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = "00000000-0000-0000-0000-000000000001";
  const outsider = "00000000-0000-0000-0000-000000000002";
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    insert into auth.users values ('${admin}'),('${outsider}');`);
  for (const name of ["0001_schema.sql", "0002_access_hardening.sql", "0003_source_provenance.sql", "0004_admin_reports.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  await db.query("insert into public.admin_users(user_id) values($1)", [admin]);
  async function role(name, uid = "") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await db.exec(`set role ${name}`);
  }
  const document = { claim: "Klaim fiktif untuk pengujian transaksi editorial.", category: "education", verdict: "unverified", summary: "Ringkasan fixture.", reasoning: "Alasan fixture.", adminNotes: "Rahasia fixture.", sources: [{ url: "https://example.org/fixture", title: "Sumber fixture", excerpt: "Kutipan fixture.", publishedAt: null }], candidates: [] };
  const save = async (doc, row = null) => (await db.query("select public.save_report_draft($1,$2,$3::jsonb) as r", [row?.id || null, row?.updated_at || null, JSON.stringify(doc)])).rows[0].r;
  const action = async (row, name, reviewed = false) => (await db.query("select public.admin_report_action($1,$2,$3,$4) as r", [row.id, row.updated_at, name, reviewed])).rows[0].r;
  let row;
  await t.test("anon, non-admin and worker cannot invoke editorial writes", async () => {
    for (const [name, uid] of [["anon", ""], ["authenticated", outsider], ["service_role", ""]]) {
      await role(name, uid);
      await assert.rejects(save(document), error => error.code === "42501");
    }
  });
  await t.test("creation commits report, sources, private notes and audit together", async () => {
    await role("authenticated", admin);
    await assert.rejects(save({ ...document, verdict: "valid" }), error => error.code === "22023");
    const before = (await db.query("select count(*) as n from public.reports")).rows[0].n;
    await assert.rejects(save({ ...document, sources: [{ ...document.sources[0], title: "" }] }), error => error.code === "22023");
    assert.equal((await db.query("select count(*) as n from public.reports")).rows[0].n, before);
    row = await save(document);
    assert.equal(row.review_status, "draft"); assert.equal(row.verdict, "unverified");
    assert.equal((await db.query("select admin_notes from public.report_private where report_id=$1", [row.id])).rows[0].admin_notes, "Rahasia fixture.");
    assert.equal((await db.query("select count(*) as n from public.report_audit where report_id=$1", [row.id])).rows[0].n, 3);
  });
  await t.test("edit preserves provider provenance, rolls back invalid batch and detects stale tabs", async () => {
    const candidates = sourcePayload(normalizeFactCheckResponse({ claims: [{ text: document.claim, claimReview: [{ url: "https://example.org/provider-fixture", title: "Fixture provider", publisher: { name: "Penerbit fiktif" } }] }] }, new Date().toISOString()));
    const first = row;
    row = await save({ ...document, candidates }, row);
    assert.equal((await db.query("select count(*) as n from public.report_sources where report_id=$1", [row.id])).rows[0].n, 2);
    await assert.rejects(save(document, first), error => error.code === "40001");
    await assert.rejects(save({ ...document, summary: "Perubahan harus rollback", candidates: [{ ...candidates[0], candidate_key: "invalid" }] }, row), error => error.code === "23514");
    assert.equal((await db.query("select summary from public.reports where id=$1", [row.id])).rows[0].summary, document.summary);
    row = await save({ ...document, summary: "Fixture diubah." }, row);
    assert.equal((await db.query("select count(*) as n from public.report_sources where report_id=$1 and candidate_key is not null", [row.id])).rows[0].n, 1);
  });
  await t.test("publication needs review and complete evidence; published edit is rejected", async () => {
    await assert.rejects(action(row, "publish"), error => error.code === "22023");
    const incomplete = await save({ ...document, summary: "", sources: [] });
    await assert.rejects(action(incomplete, "publish", true), error => error.code === "23514");
    row = await action(row, "publish", true);
    assert.equal(row.published_by, admin);
    await assert.rejects(save(document, row), error => error.code === "40001");
    await role("anon");
    assert.equal((await db.query("select count(*) as n from public.reports where id=$1", [row.id])).rows[0].n, 1);
    await assert.rejects(db.exec("select * from public.report_private"), error => error.code === "42501");
    await role("authenticated", admin);
  });
  await t.test("retract/archive/restore keep audit and immediately hide report from public", async () => {
    const published = row;
    row = await action(row, "retract");
    await assert.rejects(action(published, "retract"), error => error.code === "40001");
    row = await action(row, "reject");
    assert.equal(row.review_status, "rejected");
    await assert.rejects(save(document, row), error => error.code === "40001");
    await role("anon");
    assert.equal((await db.query("select count(*) as n from public.reports where id=$1", [row.id])).rows[0].n, 0);
    await role("authenticated", admin);
    row = await action(row, "restore");
    assert.equal(row.review_status, "draft"); assert.equal(row.published_by, null);
    assert.ok((await db.query("select count(*) as n from public.report_audit where report_id=$1", [row.id])).rows[0].n > 3);
  });
});
