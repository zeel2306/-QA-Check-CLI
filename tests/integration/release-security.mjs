import fs from 'node:fs/promises';
import path from 'node:path';

export const SECURITY_POLICY = { id: 'lab14-v1', scope: 'production source lockfile AND external packed consumer',
  blockSeverities: ['high', 'critical'], allowlist: [], incompleteAudit: 'BLOCKED',
  moderateAndLow: 'record and review; do not suppress', runtimeReachability: 'not inferred from dependency inclusion' };

export function evaluateAudit(audit, code) {
  if (![0, 1].includes(code) || audit?.error || !audit?.metadata?.vulnerabilities || !audit.vulnerabilities || typeof audit.vulnerabilities !== 'object') {
    return { status: 'ERROR', passed: false, error: audit?.error ?? 'Missing/invalid audit evidence or unexpected npm exit', code };
  }
  const counts = audit.metadata.vulnerabilities;
  if (!['info','low','moderate','high','critical','total'].every(key => Number.isInteger(counts[key]) && counts[key] >= 0)) return {status:'ERROR',passed:false,error:'Incomplete vulnerability counts'};
  const findings = Object.entries(audit.vulnerabilities).map(([name, item]) => ({name, ...item}));
  for (const severity of ['info','low','moderate','high','critical']) {
    if (counts[severity] !== findings.filter(item=>item.severity===severity).length) return {status:'ERROR',passed:false,error:'Inconsistent severity counts'};
  }
  if (findings.some(item=>!['info','low','moderate','high','critical'].includes(item.severity)) || code === 1 && counts.total === 0) return {status:'ERROR',passed:false,error:'Unrecognized audit result'};
  const blocking = findings.filter(item => SECURITY_POLICY.blockSeverities.includes(item.severity));
  if (counts.high + counts.critical > 0 && !blocking.length || counts.total !== findings.length) return {status:'ERROR',passed:false,error:'Inconsistent audit inventory'};
  return { status: blocking.length ? 'BLOCKED' : 'PASS', passed: blocking.length === 0, counts, blockingPackages: blocking.map(item=>item.name), findings };
}

export async function auditProduction({run, npm, cwd, output, label}) {
  const audit = await run(label, [npm, 'audit', '--omit=dev', '--json'], cwd);
  let parsed;
  try { parsed=JSON.parse(audit.text); } catch { return {status:'ERROR',passed:false,error:'Audit did not return JSON',code:audit.code}; }
  await fs.writeFile(path.join(output,label+'.json'),JSON.stringify(parsed,null,2));
  const tree=await run(label+'-tree',[npm,'ls','--all','--omit=dev','--json'],cwd);
  // ls exit 1 can describe invalid/missing peers; preserve its real exit and tree.
  const evaluated=evaluateAudit(parsed,audit.code);
  return {...evaluated,treeExitCode:tree.code};
}
