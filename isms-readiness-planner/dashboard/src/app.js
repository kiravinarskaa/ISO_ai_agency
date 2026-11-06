(()=>{'use strict';
const data=JSON.parse(document.getElementById('data').textContent);
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let settings={member:'',team:''};
try{const saved=JSON.parse(localStorage.getItem('phishguard-gtm')||'{}');for(const k of ['member','team'])if(typeof saved[k]==='string')settings[k]=saved[k].slice(0,100);}catch{$('storage').textContent='Local settings unavailable. Export remains available.';}
const tokenise=t=>String(t).replaceAll('{{member}}',settings.member||'you').replaceAll('{{team}}',settings.team||'your team');
const notice=t=>{$('notice').textContent=t;};
function fallbackCopy(text){const box=el('textarea');box.value=text;document.body.append(box);box.select();const copied=document.execCommand('copy');box.remove();if(!copied){const manual=el('textarea');manual.value=text;manual.setAttribute('aria-label','Select and copy this text');$('notice').replaceChildren(el('p','Select and copy this text manually.'),manual);manual.select();return;}notice('Copied for review.');}
async function copy(text,rich){text=tokenise(text);try{if(rich&&navigator.clipboard&&window.ClipboardItem){const wrapper=el('div');for(const paragraph of text.split(/\n\n+/))wrapper.append(el('p',paragraph));await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([wrapper.innerHTML],{type:'text/html'})})]);}else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);}else{return fallbackCopy(text);}notice('Copied for review.');}catch{fallbackCopy(text);}}
function controls(container,text){const row=el('div',undefined,'actions');for(const [label,rich]of [['Copy text',false],['Copy rich text',true]]){const b=el('button',label);b.addEventListener('click',()=>copy(text,rich));row.append(b);}container.append(row);}
function render(){
 $('greeting').textContent=tokenise('Prepared for {{member}} and {{team}}.');
 const brief=data.brief||'No morning brief yet. The board standup owns this file.';
 const actionLines=brief.split('\n').filter(l=>/^[-*] /.test(l));
 $('needs').textContent=actionLines.length?actionLines.slice(0,5).join(' '):'Needs your attention: confirm the public prototype URL, review candidate proof, and verify the first scheduled delivery.';
 $('brief').replaceChildren(el('pre',tokenise(brief)));controls($('brief'),brief);
 $('queues').replaceChildren();
 if(!data.queue.length)$('queues').append(el('p','No contactable prospects or outreach drafts are recorded. No recipient has been invented.','muted'));
 for(const q of data.queue){const box=el('article',undefined,'panel');box.append(el('h3',q.path));const chunks=q.text.split(/(?=^## )/m);for(const chunk of chunks){const item=el('div');item.append(el('pre',tokenise(chunk)));if(/^- id:/m.test(chunk))controls(item,chunk);box.append(item);}$('queues').append(box);}
 $('digest').textContent=data.digest||'No standup digest yet.';
 $('execution').textContent=data.runs.length?'Run records present; scheduled execution unverified':'Scheduled execution unverified';
 const own=data.progress.filter(p=>p.routine==='gtm-intake-and-dashboard').sort((a,b)=>String(a.observed_at).localeCompare(String(b.observed_at))).at(-1);
 $('delivery').textContent=own?own.delivery:'Unknown: no receipt yet';
 $('runs').replaceChildren();for(const r of data.runs){$('runs').append(el('p',`${r.start} | ${r.routine} | ${r.status}`));}
 $('context').textContent=data.context;
 $('strategyfiles').replaceChildren();for(const [name,text]of Object.entries(data.strategy)){const d=el('details');d.append(el('summary',name),el('pre',tokenise(text)));controls(d,text);$('strategyfiles').append(d);}
 $('boardnote').textContent=data.boardPending?'Cards are in the inbox. The board standup assigns board ids on its next eligible run.':'Read from the current launch board.';
 $('cards').replaceChildren();for(const c of data.cards){const box=el('article',undefined,'panel');box.append(el('h3',c.title),el('p',c.definition_of_done||''),el('p',c.artifact||'','path'),el('small',`${c.done_kind||''} | ${c.status||'todo'}${c.blocker?' | '+c.blocker:''}`));$('cards').append(box);}
}
for(const k of ['member','team']){$(k).value=settings[k];$(k).addEventListener('input',()=>{settings[k]=$(k).value;try{localStorage.setItem('phishguard-gtm',JSON.stringify(settings));}catch{$('storage').textContent='Use export to preserve settings.';}render();});}
for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>{for(const x of document.querySelectorAll('[data-tab]'))x.setAttribute('aria-selected',String(x===b));for(const id of ['desk','validation','strategy'])$(id).hidden=id!==b.dataset.tab;});
$('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({schema:1,settings},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='phishguard-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('import').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>100000)throw Error('File too large');const incoming=JSON.parse(await f.text());if(incoming.schema!==1||!incoming.settings)throw Error('Unexpected format');for(const k of ['member','team']){if(typeof incoming.settings[k]!=='string'||incoming.settings[k].length>100)throw Error('Invalid settings');}settings={member:incoming.settings.member,team:incoming.settings.team};for(const k of ['member','team'])$(k).value=settings[k];try{localStorage.setItem('phishguard-gtm',JSON.stringify(settings));}catch{}render();notice('Settings imported.');}catch{notice('Import failed. Choose a settings file exported by this dashboard.');}finally{e.target.value='';}});
render();
})();
