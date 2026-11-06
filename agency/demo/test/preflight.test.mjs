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
test('preflight failure exposes safe process diagnostics without model output',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'preflight-'));fs.mkdirSync(path.join(root,'working'));
 try {await assert.rejects(restrictedPreflight({codex:{sandbox:'workspace-write',command:'codex'}},{},root,root,async()=>({ok:false,exitCode:1,timedOut:true,error:'secret data'})),e=>e.diagnostic.timedOut&&!e.message.includes('secret data'));}finally{fs.rmSync(root,{recursive:true,force:true});}
});
