import test from "node:test";
import assert from "node:assert/strict";
import { createCheckService, checkHashes, requestSubject } from "../src/lib/check-service.mjs";
import { parseCheckResult } from "../src/lib/check-result.mjs";
import { readBoundedJson } from "../src/lib/bounded-json.mjs";

const input={inputType:"text",input:"Klaim fiktif untuk uji integrasi publik.",category:"education"};
const id="00000000-0000-0000-0000-000000000010";
const result=()=>({status:"no_evidence",analysisAvailable:false,sources:[],draft:{claim:input.input,category:input.category,verdict:"unverified",reviewStatus:"draft",summary:"Bukti belum cukup.",reason:"Tidak ada kandidat.",limitations:["Konteks belum dikonfirmasi."],evidenceIds:[]}});
const preview=()=>({mode:"analysis",id,claim:input.input,category:input.category,verdict:"unverified",reviewStatus:"draft",analysisAvailable:false,summary:"Bukti belum cukup.",reason:"Tidak ada kandidat.",limitations:[],sources:[],notice:"Menunggu admin."});
function service({reservation={status:"reserved",token:id},review=async()=>result(),retrieveArticle=async()=>{throw new Error("must not fetch");},complete=()=>preview(),...options}={}) {
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});if(name==="reserve_check")return{data:reservation};if(name==="complete_check")return{data:complete(args)};return{data:null};}};
  return {calls,run:createCheckService({client,review,retrieveArticle,secret:"x".repeat(32),model:"fixture-model",enabled:true,...options})};
}
test("hashes preserve category/negation/year and conceal raw text/IP; forwarded headers require explicit trust",()=>{
  const h=checkHashes(input,"127.0.0.1","x".repeat(32),"fixture");
  assert.match(h.key,/^[0-9a-f]{64}$/);assert.match(h.subject,/^[0-9a-f]{64}$/);
  assert.notEqual(h.key,checkHashes({...input,input:input.input+" tahun 2025"},"127.0.0.1","x".repeat(32),"fixture").key);
  assert.notEqual(h.key,checkHashes({...input,category:"politics"},"127.0.0.1","x".repeat(32),"fixture").key);
  const headers=new Headers({"x-forwarded-for":"8.8.8.8"});
  assert.equal(requestSubject(headers),"unknown-client");assert.equal(requestSubject(headers,"x-forwarded-for"),"8.8.8.8");
  assert.equal(requestSubject(new Headers({"x-forwarded-for":"8.8.8.8, 1.1.1.1"}),"x-forwarded-for"),"unknown-client");
});
test("invalid/disabled/URL-gated input cannot spend quota or fetch; URL policy blocks private literal",async()=>{
  const disabled=service({enabled:false});await assert.rejects(disabled.run(input,"client"),/service_unavailable/);assert.equal(disabled.calls.length,0);
  for(const payload of [{...input,verdict:"valid"},{...input,input:"short"}]){const s=service();await assert.rejects(s.run(payload,"client"),/invalid_input/);assert.equal(s.calls.length,0);}
  const s=service();await assert.rejects(s.run({...input,inputType:"url",input:"https://example.org/news"},"client"),/url_disabled/);
  const allowed=service({urlEnabled:true});await assert.rejects(allowed.run({...input,inputType:"url",input:"http://127.0.0.1/news"},"client"),/fetch_blocked/);assert.equal(allowed.calls.length,0);
});
test("cache, running job and shared budget rejection skip every provider and storage effect",async()=>{
  const deny=async()=>{throw new Error("provider must not run");};
  const cached=service({reservation:{status:"cached",preview:preview()},review:deny});assert.equal((await cached.run(input,"client")).cached,true);assert.equal(cached.calls.length,1);
  for(const status of ["processing","rate_limited","busy","budget_exhausted"]){const s=service({reservation:{status,retryAfter:3},review:deny});await assert.rejects(s.run(input,"client"),error=>error.code===status);assert.equal(s.calls.length,1);}
});
test("successful no-candidate result saves unverified draft once, never a fake factual verdict",async()=>{
  const s=service({complete:args=>{assert.equal(args.p_document.verdict,"unverified");assert.deepEqual(args.p_document.candidates,[]);return preview();}});
  const response=await s.run(input,"client");assert.equal(response.cached,false);assert.ok(parseCheckResult(response));
  assert.deepEqual(s.calls.map(call=>call.name),["reserve_check","complete_check"]);
});
test("provider/model/invalid-output failures release only own lease and never save draft",async()=>{
  for(const review of [async()=>({status:"model_rate_limited",draft:null}),async()=>{throw new Error("PRIVATE_ERROR");},async()=>({...result(),draft:{...result().draft,verdict:"valid"}})]){
    const s=service({review});await assert.rejects(s.run(input,"client"),error=>error.code==="analysis_unavailable");assert.deepEqual(s.calls.map(call=>call.name),["reserve_check","fail_check"]);
  }
  const s=service({review:async()=>({status:"no_factual_claim",draft:null})});await assert.rejects(s.run(input,"client"),error=>error.status===422&&error.code==="no_factual_claim");
});
test("authorized URL branch uses submitted-article text, records truncation and strips query secrets",async()=>{
  const s=service({urlEnabled:true,retrieveArticle:async url=>{assert.equal(url,"https://example.org/article?token=PRIVATE");return{text:input.input,sourceUrl:url,truncated:true};},review:async value=>{assert.equal(value.text,input.input);return result();},complete:args=>{assert.equal(args.p_url,"https://example.org/article");assert.equal(args.p_input_type,"url");assert.equal(args.p_document.limitations.length,2);assert.match(args.p_document.adminNotes,/dipotong/);return preview();}});
  await s.run({...input,inputType:"url",input:"https://example.org/article?token=PRIVATE"},"client");
  const failed=service({urlEnabled:true});await assert.rejects(failed.run({...input,inputType:"url",input:"https://example.org/article"},"client"),error=>error.code==="source_unavailable");
});
test("client contract rejects fake publication/verdict, invented URL schemes and excessive payload",()=>{
  const value={...preview(),cached:false};assert.ok(parseCheckResult(value));
  for(const change of [{verdict:"valid"},{reviewStatus:"published"},{id:"bad"},{sources:[{url:"javascript:alert(1)",title:"Bad",publisher:"Bad",reviewedAt:null}]},{limitations:Array(9).fill("x")}])assert.equal(parseCheckResult({...value,...change}),null);
});
test("JSON reader enforces bytes/deadline even without Content-Length and rejects malformed UTF-8",async()=>{
  assert.deepEqual(await readBoundedJson(new Request("https://example.test",{method:"POST",body:JSON.stringify(input)})),input);
  await assert.rejects(readBoundedJson(new Request("https://example.test",{method:"POST",body:"x".repeat(30)}),{maxBytes:20}),error=>error.code==="payload_too_large");
  await assert.rejects(readBoundedJson(new Request("https://example.test",{method:"POST",body:new Uint8Array([255])})),error=>error.code==="invalid_json");
  const stalled=new ReadableStream({start(){}});
  await assert.rejects(readBoundedJson({body:stalled},{timeoutMs:10}),error=>error.code==="request_timeout");
});
