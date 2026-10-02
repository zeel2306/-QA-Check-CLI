import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../src/app/api/v1/[...path]/route';
test('health endpoint works without provider credentials',async()=>{const res=await GET(new Request('http://localhost:3000/api/v1/health'));assert.equal(res.status,200);assert.equal((await res.json()).service,'qa-check-cloud')});
test('unconfigured auth cannot access tenant data',async()=>{if(process.env.CLERK_SECRET_KEY)return;const res=await GET(new Request('http://localhost:3000/api/v1/projects'));assert.equal(res.status,503);assert.equal((await res.json()).error.code,'AUTH_NOT_CONFIGURED')});
