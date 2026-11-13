import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {restrictedPreflight} from '../run-demo.mjs';
test('preflight accepts Windows UTF8 marker and newline but requires exact canary content',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'preflight-'));fs.mkdirSync(path.join(root,'working'));
 try {
 for(const content of ['\uFEFFPREFLIGHT_OK\r\n','wrong content']) {
 const executor=async (s,t,{invocation})=>{const target=invocation.prompt.match(/Write exactly PREFLIGHT_OK to (.*), read it back/)[1];fs.writeFileSync(target,content);return {ok:true,spawnSucceeded:true,exitCode:0};};
 const action=()=>restrictedPreflight({codex:{sandbox:'workspace-write',command:'codex'}},{},root,root,executor);
 if(content.startsWith('\uFEFF'))assert.equal((await action()).ok,true);else await assert.rejects(action(),e=>e.code==='PREFLIGHT_FAILED'&&e.diagnostic.readback===false);
 }
 assert.deepEqual(fs.readdirSync(path.join(root,'working')),[]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('preflight failure exposes safe provider diagnostics without raw stderr',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'preflight-'));fs.mkdirSync(path.join(root,'working'));
 try {
  await assert.rejects(restrictedPreflight({codex:{sandbox:'workspace-write',command:'codex'}},{},root,root,async()=>({ok:false,code:'CODEX_EXIT',exitCode:1,timedOut:false,stderrBytes:768,stderrSummary:'The configured model provider rejected the API credential.',error:'secret data'})),e=>e.code==='PREFLIGHT_FAILED'&&e.diagnostic.failureCode==='CODEX_EXIT'&&e.diagnostic.stderrBytes===768&&e.diagnostic.stderrSummary==='The configured model provider rejected the API credential.'&&!e.message.includes('secret data'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
