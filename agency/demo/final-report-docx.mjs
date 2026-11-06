/** Local DOCX packaging for the Project Manager. Node built-ins only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const sources = [
 ['Client Manager','client-brief.json'],
 ['ISMS Readiness Planner','isms-readiness-plan.md'],
 ['Evidence Specialist','evidence-register.md'],
 ['Technical Controls Specialist','technical-controls-assessment.md'],
 ['Security Awareness Specialist','awareness-training-plan.md'],
 ['Corrective Actions Specialist','corrective-action-register.md'],
 ['Metrics Specialist','readiness-dashboard.md'],
 ['Project Manager','final-agency-report.md'],
];
const xml = s => String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function paragraph(s,style='Normal') {
 return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${xml(s)}</w:t></w:r></w:p>`;
}
function table(rows) {
 const count=Math.max(...rows.map(row=>row.length));
 const width=Math.floor(10080/count);
 return '<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(x=>`<w:${x} w:val="single" w:sz="4" w:color="D9D9D9"/>`).join('')+'</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+Array.from({length:count},()=>`<w:gridCol w:w="${width}"/>`).join('')+'</w:tblGrid>'+rows.map((row,i)=>'<w:tr><w:trPr>'+(!i?'<w:tblHeader/>':'')+'</w:trPr>'+row.map(cell=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${!i?'<w:shd w:fill="E7EDF2"/>':''}</w:tcPr>${paragraph(cell.replace(/\*\*|`/g,''))}</w:tc>`).join('')+'</w:tr>').join('')+'</w:tbl>';
}
function crc(data) { let c=0xffffffff; for(const b of data) {c ^= b;for(let i=0;i<8;i++) c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; }
// Standard uncompressed ZIP keeps this small export independent of paid services and packages.
function zip(entries) {
 const local=[],central=[];let offset=0;
 for(const [name,text] of entries) {
 const n=Buffer.from(name),d=Buffer.from(text),sum=crc(d);
 const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(sum,14);h.writeUInt32LE(d.length,18);h.writeUInt32LE(d.length,22);h.writeUInt16LE(n.length,26);
 local.push(h,n,d);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(sum,16);c.writeUInt32LE(d.length,20);c.writeUInt32LE(d.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);central.push(c,n);offset+=h.length+n.length+d.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,cd,end]);
}
export function buildFinalDocx(projectRoot,manifest) {
 const working=path.join(projectRoot,'working');
 if(fs.lstatSync(working).isSymbolicLink()) throw new Error('DOCX_UNSAFE_PATH');
 const inputs=sources.map(([role,name])=>{
 const file=path.join(working,name);
 if(fs.lstatSync(file).isSymbolicLink()) throw new Error('DOCX_UNSAFE_SOURCE');
 const text=fs.readFileSync(file,'utf8');
 if(!text.trim() || Buffer.byteLength(text)>1000000) throw new Error('DOCX_SOURCE_INVALID');
 return {role,name,text,sha256:crypto.createHash('sha256').update(text).digest('hex')};
 });
 let body=paragraph('ISO IEC 27001 2022 readiness preparation report','Title');
 body+=paragraph('Project '+manifest.projectId)+paragraph('Run '+manifest.runId);
 body+=paragraph('This report contains unverified client supplied information and proposed recommendations. It is readiness preparation only, not an audit, certification or compliance claim. Where inputs describe fictional or synthetic test evidence, all resulting assessment statements remain fictional test material.');
 body+=paragraph('Workflow results','Heading1');
 for(const row of manifest.agents) body+=paragraph(`${row.employeeId}: ${row.status}; artifact validation: ${row.validation?.valid === true ? 'passed' : 'not passed'}`);
 body+=paragraph('Consolidated conclusions and recommendations','Heading1');
 const report = inputs[7].text;
 const lines = report.split(/\r?\n/);
 for(let i=0;i<lines.length;i++) {
   const line=lines[i]; if(!line.trim()) continue;
   if(line.startsWith('|')) {
     const rows=[];
     while(i<lines.length && lines[i].startsWith('|')) {
       const cells=lines[i].split('|').slice(1,-1).map(x=>x.trim());
       if(!cells.every(x=>/^:?-+:?$/.test(x))) rows.push(cells);
       i++;
     } i--;
     body+=table(rows); continue;
   }
   const heading=/^(#{1,6})\s+(.*)/.exec(line);
   body+=paragraph((heading?heading[2]:line).replace(/\*\*|`/g,''),heading?(heading[1].length<=2?'Heading1':'Heading2'):'Normal');
 }
 body+=paragraph('Employee contributions and source records','Heading1');
 for(const input of inputs) body+=paragraph(input.role+' ? working/'+input.name);
 const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`;
 const styles=`<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140"/></w:pPr></w:pPrDefault></w:docDefaults>${[['Normal',22],['Title',32],['Heading1',28],['Heading2',24]].map(([name,size])=>`<w:style w:type="paragraph" w:styleId="${name}"><w:name w:val="${name}"/><w:pPr>${name!=='Normal'?'<w:keepNext/>':''}</w:pPr><w:rPr><w:sz w:val="${size}"/><w:color w:val="000000"/></w:rPr></w:style>`).join('')}</w:styles>`;
 const data=zip([
 ['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
 ['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
 ['word/_rels/document.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['word/document.xml',document],['word/styles.xml',styles]]);
 const out=path.join(working,'final-agency-report.docx');
 if(fs.existsSync(out)&&fs.lstatSync(out).isSymbolicLink())throw new Error('DOCX_UNSAFE_OUTPUT');
 const temp=out+'.'+crypto.randomUUID()+'.tmp';
 try {fs.writeFileSync(temp,data,{flag:'wx'});fs.renameSync(temp,out);} finally {if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return {path:out,sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes:data.length,sources:inputs.map(({name,sha256})=>({name,sha256})),validation:'generated OOXML package; visual review required',visualReview:'pending'};
}
