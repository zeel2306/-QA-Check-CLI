import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAudit} from './release-security.mjs';
const audit=(severity)=>({metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:severity?1:0,...(severity?{[severity]:1}:{})}},vulnerabilities:severity?{example:{severity,via:[],nodes:['node_modules/example'],fixAvailable:false}}:{}});
test('release policy blocks high/critical; retains moderate/low inventory',()=>{
  for(const severity of ['high','critical']) assert.equal(evaluateAudit(audit(severity),1).status,'BLOCKED');
  for(const severity of ['low','moderate']) {const result=evaluateAudit(audit(severity),1);assert.equal(result.status,'PASS');assert.equal(result.findings.length,1);}
  assert.equal(evaluateAudit(audit(),0).status,'PASS');
});
test('release policy fails closed on missing, failed and inconsistent audits',()=>{
  for(const [data,code] of [[{},0],[audit(),2],[{error:{message:'registry unavailable'}},1]])assert.equal(evaluateAudit(data,code).status,'ERROR');
  const incomplete=audit('high');incomplete.vulnerabilities={};assert.equal(evaluateAudit(incomplete,1).status,'ERROR');
  const unknown=audit('moderate');unknown.vulnerabilities.example.severity='unknown';assert.equal(evaluateAudit(unknown,1).status,'ERROR');
});
