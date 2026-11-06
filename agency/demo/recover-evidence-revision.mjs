/** Operator recovery for stale completed reports. Preserves original spent budget and archives every lease. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const projectId=process.argv[2];
if(!/^INTAKE-[a-z0-9]+$/i.test(projectId||''))throw new Error('Valid staged project ID required');
const root=path.resolve('agency/projects',projectId);
if(fs.lstatSync(root).isSymbolicLink())throw new Error('Unsafe project');
const roles=[['readiness-metrics-analyst','summarize-readiness-metrics'],['project-manager','coordinate-readiness-project']];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const history=path.join(root,'logs','demo-runs');
const apply=process.argv.includes('--apply');
for(const [employee,routine] of roles){
 const leasePath=path.join(root,'.employee-runtime',employee,'state','run-leases',routine+'.json');
 const lease=JSON.parse(fs.readFileSync(leasePath,'utf8'));
 if(lease.status!=='completed') {console.log(employee+': no completed lease to reopen');continue;}
 let prior;
 for(const run of fs.readdirSync(history).sort().reverse()){
  const file=path.join(history,run,'agents',employee+'.json');if(!fs.existsSync(file))continue;
  const row=JSON.parse(fs.readFileSync(file,'utf8'));
  if(['completed','reused-validated'].includes(row.status)&&row.validation?.valid&&row.outputHash){prior=row;break;}
 }
 if(!prior||!fs.existsSync(prior.outputPath)||hash(prior.outputPath)!==prior.outputHash)throw new Error(employee+': prior validated output unavailable or modified');
 const changed=(prior.inputFiles||[]).filter(x=>x.path.startsWith('working/')&&x.exists&&fs.existsSync(path.join(root,x.path))&&hash(path.join(root,x.path))!==x.hash).map(x=>x.path);
 if(!changed.length)throw new Error(employee+': no changed upstream evidence; recovery refused');
 if(lease.spent_ms>=lease.budget_ms)throw new Error(employee+': original budget exhausted');
 const auditDir=path.join(root,'logs','revision-recovery');
 const previous=fs.existsSync(auditDir)?fs.readdirSync(auditDir).filter(x=>x.startsWith(employee+'-')&&x.endsWith('.json')):[];
 if(previous.length>=2)throw new Error(employee+': recovery revision limit reached');
 console.log(JSON.stringify({employee,changedInputs:changed,remainingMs:lease.budget_ms-lease.spent_ms,apply}));
 if(!apply)continue;
 fs.mkdirSync(auditDir,{recursive:true});
 const stamp=Date.now()+'-'+crypto.randomUUID();
 fs.writeFileSync(path.join(auditDir,employee+'-'+stamp+'.json'),JSON.stringify({at:new Date().toISOString(),reason:'Operator requested completion after upstream evidence revision',changedInputs:changed,originalLease:lease},null,2),{flag:'wx'});
 const lock=leasePath+'.claim';const fd=fs.openSync(lock,'wx');
 try{
  const latest=JSON.parse(fs.readFileSync(leasePath,'utf8'));
  if(JSON.stringify(latest)!==JSON.stringify(lease))throw new Error('Lease changed; refusing recovery');
  const recovered={...lease,status:'partial',recovery:{reason:'upstream evidence changed',at:new Date().toISOString(),changedInputs:changed}};
  const tmp=leasePath+'.'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify(recovered)+'\n',{flag:'wx'});fs.renameSync(tmp,leasePath);
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
