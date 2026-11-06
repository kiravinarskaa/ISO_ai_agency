import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildFinalDocx} from '../final-report-docx.mjs';
test('missing upstream artifact blocks export without creating a report',()=>{
const root=fs.mkdtempSync(path.join(os.tmpdir(),'docx-export-'));
try {fs.mkdirSync(path.join(root,'working'));assert.throws(()=>buildFinalDocx(root,{agents:[]}));assert.equal(fs.existsSync(path.join(root,'working/final-agency-report.docx')),false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
