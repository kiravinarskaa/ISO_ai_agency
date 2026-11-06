import test from 'node:test';
import assert from 'node:assert/strict';
import {composeCustomerNotice,composeCustomerClarification,sendCustomerNotification,validateCustomerContactPolicy} from '../reporting.mjs';
test('customer notices are fixed link-free content without reports or claims of certification',()=>{
 for(const kind of ['acknowledgment','completion']) {
 const email=composeCustomerNotice({projectId:'INTAKE-demo',kind});
 assert.doesNotMatch(email.body,/INTAKE-demo|project reference|validated deliverables/i);
 assert.doesNotMatch(email.body,/https?:|www\.|password|access_token/i);
 }
 assert.throws(()=>composeCustomerNotice({projectId:'bad\nTo: attacker',kind:'completion'}));
 assert.throws(()=>composeCustomerNotice({projectId:'INTAKE-demo',kind:'arbitrary'}));
});
test('completion cannot be sent without validating its manifest',async()=>{
 await assert.rejects(sendCustomerNotification({projectId:'INTAKE-demo',kind:'completion',manifestPath:'nonexistent-manifest.json'}));
});
test('notification policy cannot grant arbitrary actions',()=>{
 assert.throws(()=>validateCustomerContactPolicy({schemaVersion:1,enabled:true,policyId:'demo',configuredBy:'Operator',senderAddress:'agency@example.com',maxClarificationsPerProject:2,allowedAction:'reply-with-intake-clarifications',notificationActions:['send-anything']}));
});

test('existing send grant can be explicitly selected without granting arbitrary credential access',()=>{
 const policy={schemaVersion:1,enabled:true,policyId:'demo',configuredBy:'Operator',senderAddress:'agency@example.com',maxClarificationsPerProject:2,allowedAction:'reply-with-intake-clarifications',sendingGrant:'send'};
 assert.equal(validateCustomerContactPolicy(policy).sendingGrant,'send');
 assert.throws(()=>validateCustomerContactPolicy({...policy,sendingGrant:'gmail-read'}));
});

test('clarifications ask readable questions without internal identifiers',()=>{
const email=composeCustomerClarification({projectId:'INTAKE-private',subject:'Request',missingInformation:['systems in scope','operating locations']});
assert.match(email.body,/Which applications/);
assert.match(email.body,/Where does your team work/);
assert.doesNotMatch(email.body,/INTAKE-private|automated clarification|https?:/);
});
