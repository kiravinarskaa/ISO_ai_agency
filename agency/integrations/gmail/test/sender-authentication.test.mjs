import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedAuthenticatedSender} from '../intake-poller.mjs';
const check=value=>trustedAuthenticatedSender({senderEmail:'person@example.com',headers:[{name:'Authentication-Results',value}]});
test('accepts aligned DKIM identity header.i as well as header.d',()=>{
 for(const identity of ['header.i=@example.com','header.i=person@example.com','header.d=example.com'])
 assert.equal(check('mx.google.com; dkim=pass '+identity+'; spf=pass smtp.mailfrom=person@example.com; dmarc=pass header.from=example.com'),true);
});
test('failed or unaligned signatures and untrusted authentication server fail closed',()=>{
 for(const value of [
 'mx.google.com; dkim=fail header.i=@example.com; spf=pass smtp.mailfrom=person@example.com; dmarc=pass header.from=example.com',
 'mx.google.com; dkim=pass header.i=@attacker.com; spf=pass smtp.mailfrom=person@example.com; dmarc=pass header.from=example.com',
 'mx.google.com; dkim=pass header.d=attacker.com; dkim=fail header.i=@example.com; spf=pass smtp.mailfrom=person@example.com; dmarc=pass header.from=example.com',
 'attacker.com; dkim=pass header.i=@example.com; spf=pass smtp.mailfrom=person@example.com; dmarc=pass header.from=example.com',
 'mx.google.com; dkim=pass header.i=@example.com; spf=pass smtp.mailfrom=other@example.com; dmarc=pass header.from=example.com'
 ]) assert.equal(check(value),false,value);
});
