import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { buildAnalysisDocument } from "../src/lib/reports/analysis-draft.mjs";
import { normalizeFactCheckResponse } from "../src/lib/evidence/google-fact-check.mjs";
import { normalizeWebResults, webSourcePayload } from "../src/lib/evidence/tavily-search.mjs";

test("check RPCs enforce backend-only limits, leases, atomic draft save and cache invalidation", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const name of ["0001_schema.sql","0002_access_hardening.sql","0003_source_provenance.sql","0004_admin_reports.sql","0005_check_pipeline.sql","0006_web_evidence.sql","0007_web_credit_budget.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  const key = "a".repeat(64), subject = "b".repeat(64);
  const sources = normalizeFactCheckResponse({ claims: [{ text: "Klaim fiktif untuk uji pipeline publik.", claimReview: [{ url: "https://example.org/pipeline-fixture", title: "Fixture pipeline", publisher: { name: "Penerbit fixture" } }] }] }, new Date().toISOString());
  const analysis = { status: "draft_ready", sources, draft: { claim: "Klaim fiktif untuk uji pipeline publik.", category: "education", verdict: "unverified", reviewStatus: "draft", summary: "Bukti fixture belum cukup.", reason: "Bukan pemeriksaan fakta nyata.", limitations: ["Fixture pengujian."], evidenceIds: [sources[0].id] } };
  const document = { ...buildAnalysisDocument(analysis), limitations: analysis.draft.limitations };
  const reserve = async (scope, hash = key, identity = subject) => (await db.query("select public.reserve_check($1,$2,$3,false) as r", [scope,hash,identity])).rows[0].r;
  const complete = async (scope, token, doc = document) => (await db.query("select public.complete_check($1,$2,$3,$4::jsonb,'text',null,true) as r", [scope,key,token,JSON.stringify(doc)])).rows[0].r;
  async function role(name) { await db.exec(`reset role;set role ${name}`); }

  await t.test("anon/authenticated cannot reserve, complete, release or read private cache", async () => {
    for (const name of ["anon","authenticated"]) {
      await role(name);
      await assert.rejects(reserve("denied"), error => error.code === "42501");
      await assert.rejects(complete("denied", "00000000-0000-0000-0000-000000000001"), error => error.code === "42501");
      await assert.rejects(db.exec("select * from private.check_jobs"), error => error.code === "42501");
      await assert.rejects(db.exec("select public.fail_check('denied','x',gen_random_uuid())"), error => error.code === "42501");
    }
    await role("service_role");
    await assert.rejects(db.exec("select * from private.check_jobs"), error => error.code === "42501");
  });
  await t.test("duplicate work is processing, completion atomically creates unverified draft, notes and provenance", async () => {
    const reserved = await reserve("complete"); assert.equal(reserved.status,"reserved");
    assert.equal((await reserve("complete")).status,"processing");
    const preview = await complete("complete",reserved.token);
    assert.equal(preview.verdict,"unverified"); assert.equal(preview.reviewStatus,"draft");
    assert.equal(preview.sources[0].url,sources[0].url); assert.equal(preview.sources[0].publishedAt,null);
    assert.doesNotMatch(JSON.stringify(preview), /adminNotes|candidate_key|token|report_private/);
    const hit = await reserve("complete"); assert.equal(hit.status,"cached"); assert.deepEqual(hit.preview,preview);
    await assert.rejects(complete("complete",reserved.token), error => error.code === "40001");
    await role("anon"); assert.equal((await db.query("select count(*) as n from public.reports where id=$1",[preview.id])).rows[0].n,0);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*) as n from public.report_private where report_id=$1",[preview.id])).rows[0].n,1);
    // Trusted operator deletion invalidates a cached report reference.
    await db.query("delete from public.reports where id=$1",[preview.id]);
    await role("service_role"); assert.equal((await reserve("complete")).status,"reserved");
  });
  await t.test("invalid candidate batch rolls back report/private notes, forged verdict is rejected", async () => {
    const reserved=await reserve("rollback");
    await assert.rejects(complete("rollback",reserved.token,{...document,verdict:"valid"}),error=>error.code==="22023");
    await db.exec("reset role");const before=(await db.query("select count(*) as n from public.reports")).rows[0].n;
    await role("service_role");
    await assert.rejects(complete("rollback",reserved.token,{...document,candidates:[{...document.candidates[0],candidate_key:"invalid"}]}),error=>error.code==="23514");
    await db.exec("reset role");assert.equal((await db.query("select count(*) as n from public.reports")).rows[0].n,before);
    await role("service_role");await complete("rollback",reserved.token);
  });
  await t.test("per-subject limit counts cache/processing attempts and concurrent work is capped", async () => {
    for(let i=0;i<5;i++) await reserve("limited");
    assert.equal((await reserve("limited")).status,"rate_limited");
    for(let i=0;i<3;i++) assert.equal((await reserve("busy",String(i).repeat(64),String(i).repeat(64))).status,"reserved");
    assert.equal((await reserve("busy","f".repeat(64),"f".repeat(64))).status,"busy");
  });
  await t.test("stale lease cannot finish or release newer work; daily budget is shared", async () => {
    const first=await reserve("lease");
    await db.exec("reset role"); await db.exec("update private.check_jobs set lease_until=now()-interval '1 second' where scope='lease'");
    await role("service_role");const second=await reserve("lease");assert.notEqual(first.token,second.token);
    await assert.rejects(complete("lease",first.token),error=>error.code==="40001");
    await db.query("select public.fail_check($1,$2,$3)",["lease",key,first.token]);
    assert.equal((await reserve("lease")).status,"processing");
    await complete("lease",second.token);
    await db.exec("reset role");
    const start=(await db.query("select to_timestamp(floor(extract(epoch from now())/86400)*86400) as t")).rows[0].t;
    await db.query("insert into private.check_counters values('budget','jobs-day',$1,20,now()+interval '2 days')",[start]);
    await role("service_role");assert.equal((await reserve("budget")).status,"budget_exhausted");
  });
  await t.test("web search reservation is worker-only, one per lease, bounded daily and renews with a new token", async () => {
    const job = await reserve("web-lease");
    const spend = async token => (await db.query("select public.reserve_web_search($1,$2,$3) as r", ["web-lease",key,token])).rows[0].r;
    for (const name of ["anon","authenticated"]) { await role(name); await assert.rejects(spend(job.token), error=>error.code==="42501"); }
    await role("service_role");
    await assert.rejects(db.query("select private.complete_check_v1($1,$2,$3,$4::jsonb,'text',null,true)",["web-lease",key,job.token,JSON.stringify(document)]),error=>error.code==="42501");
    assert.equal(await spend(job.token),true); assert.equal(await spend(job.token),false);
    await db.exec("reset role"); await db.exec("update private.check_jobs set lease_until=now()-interval '1 second' where scope='web-lease'");
    await role("service_role"); const renewed=await reserve("web-lease");
    assert.equal(await spend(job.token),false); assert.equal(await spend(renewed.token),true);
    await db.exec("reset role"); await db.exec("update private.check_jobs set lease_until=now()-interval '1 second' where scope='web-lease'");
    await db.exec("update private.check_counters set used=20 where scope='web-lease' and bucket='web-search-day'");
    await role("service_role"); const limited=await reserve("web-lease"); assert.equal(await spend(limited.token),false);
  });
  await t.test("web excerpt/hash/span persist atomically, remain private and survive cache replay", async () => {
    const text="Sumber fiktif ini tidak membuktikan klaim berita nyata.";
    const web=normalizeWebResults({results:[{url:"https://example.org/web-fixture",title:"Fixture web fiktif",raw_content:text}]},analysis.draft.claim,new Date().toISOString())[0];
    const row=webSourcePayload({...web,excerpt:text,quoteSpan:{start:0,end:text.length}});
    const job=await reserve("web-save"); const doc={...document,candidates:[row]};
    const response=await complete("web-save",job.token,doc);
    assert.equal(response.sources[0].kind,"web_source_content"); assert.equal(response.sources[0].excerpt,text); assert.equal(response.sources[0].publishedAt,null);
    assert.deepEqual((await reserve("web-save")).preview,response);
    await db.exec("reset role");const stored=(await db.query("select content_hash,quote_start,quote_end,provider,excerpt from public.report_sources where report_id=$1",[response.id])).rows[0];
    assert.equal(stored.content_hash,row.content_hash); assert.equal(stored.quote_end,text.length); assert.equal(stored.provider,"tavily");
    await role("anon");assert.equal((await db.query("select count(*) as n from public.report_sources where report_id=$1",[response.id])).rows[0].n,0);
    await role("service_role"); const bad=await reserve("web-bad");
    await assert.rejects(complete("web-bad",bad.token,{...doc,candidates:[{...row,provider:null}]}), error=>["22023","23514"].includes(error.code));
    await assert.rejects(complete("web-bad",bad.token,{...doc,candidates:[{...row,quote_end:0}]}), error=>error.code==="23514");
  });
});
