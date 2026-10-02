import {createHash,randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export function newToken(){const token=`qac_${randomBytes(32).toString('base64url')}`;return {token,hash:hashToken(token),prefix:token.slice(0,11)}}
export function verifySignature(body:string,signature:string,secret:string){if(!/^[a-f0-9]{64}$/i.test(signature))return false;const expected=createHmac('sha256',secret).update(body).digest();return timingSafeEqual(expected,Buffer.from(signature,'hex'))}
export function redactText(input:string){return input.slice(0,2000).replace(/(?:Bearer\s+|(?:password|secret|api[_-]?key|token)\s*[:=]\s*)[^\s,;"']+/gi,'[REDACTED]').replace(/(?:sk_live_|sk_test_|ghp_|qac_)[A-Za-z0-9_-]+/g,'[REDACTED]');}
export function safeLocation(value:string){try{const url=new URL(value);return url.pathname;}catch{return value.split(/[?#]/)[0].replace(/^[A-Za-z]:[\\/].*/, '[local-path]').slice(0,500)}}
