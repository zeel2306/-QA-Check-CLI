import {auth} from '@clerk/nextjs/server';
import {redirect} from 'next/navigation';
import {db} from './db';
import {ApiError} from './http';
import type {CloudData,Issue,Run} from '@/lib/models';
export async function requireWorkspace(api=false){
 if(!process.env.CLERK_SECRET_KEY||!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)throw new ApiError(503,'AUTH_NOT_CONFIGURED','Account services are not configured.');
 const {userId}=await auth();if(!userId){if(!api)redirect('/login');throw new ApiError(401,'UNAUTHENTICATED','Sign in to continue.');}
 if(!process.env.DATABASE_URL)throw new ApiError(503,'DATABASE_NOT_CONFIGURED','Database services are not configured.');
 const user=await db.user.upsert({where:{clerkId:userId},update:{},create:{clerkId:userId}});
 // Lock the identity row so concurrent first requests create only one workspace.
 const member=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;const existing=await tx.organizationMember.findFirst({where:{userId:user.id},orderBy:{createdAt:'asc'}});if(existing)return existing;const org=await tx.organization.create({data:{name:'My workspace',members:{create:{userId:user.id,role:'OWNER'}}}});return tx.organizationMember.findUniqueOrThrow({where:{organizationId_userId:{organizationId:org.id,userId:user.id}}});});
 return {...member,actor:userId};
}
export function allowRole(role:string,allowed:string[]){if(!allowed.includes(role))throw new ApiError(403,'FORBIDDEN','Your role cannot perform this action.');}
export async function getWorkspaceData(organizationId:string):Promise<CloudData>{
 const projects=await db.project.findMany({where:{organizationId,archivedAt:null},take:100,orderBy:{createdAt:'desc'},include:{runs:{where:{processingStatus:'COMPLETE',deletedAt:null},orderBy:{completedAt:'desc'},take:2}}});
 const runs=await db.testRun.findMany({where:{project:{organizationId,archivedAt:null},processingStatus:'COMPLETE',deletedAt:null},take:100,orderBy:{completedAt:'desc'},include:{project:true}});
 const issues=await db.issue.findMany({where:{project:{organizationId,archivedAt:null}},take:200,orderBy:{lastSeenAt:'desc'},include:{project:true,observations:{orderBy:{createdAt:'desc'},take:1}}});
 const date=(d:Date)=>d.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric',timeZone:'Asia/Kolkata'});
 return {projects:projects.map(p=>({id:p.id,name:p.name,description:p.description,url:p.websiteUrl,repository:p.repository,framework:p.framework,environment:p.environment,branch:p.defaultBranch,score:p.runs[0]?.overallScore??null,previous:p.runs[1]?.overallScore??null,errors:Number((p.runs[0]?.counts as Record<string,number>|undefined)?.errors??0),warnings:Number((p.runs[0]?.counts as Record<string,number>|undefined)?.warnings??0),lastRun:p.runs[0]?date(p.runs[0].completedAt):'No runs yet',color:'#7565e7'})),runs:runs.map((r,i)=>({id:r.id,number:runs.length-i,projectId:r.projectId,project:r.project.name,branch:r.branch,commit:r.commit,environment:r.environment,score:r.overallScore,previous:r.scoreDelta===null?null:r.overallScore-r.scoreDelta,status:(r.outcome==='PASS'?'Passed':r.outcome==='WARNING'?'Warning':'Failed') as Run['status'],duration:`${Math.floor(r.durationMs/60000)}m ${Math.round(r.durationMs%60000/1000)}s`,date:date(r.completedAt),passed:Number((r.counts as Record<string,number>).passed??0),warnings:Number((r.counts as Record<string,number>).warnings??0),errors:Number((r.counts as Record<string,number>).errors??0),categories:r.categories as Record<string,number>})),issues:issues.map(i=>({id:i.id,title:i.title,projectId:i.projectId,project:i.project.name,category:i.category,severity:(i.severity==='error'?'Error':i.severity==='critical'?'Critical':i.severity==='warning'?'Warning':'Info') as Issue['severity'],route:i.route,selector:i.selector,status:({OPEN:'Open',RESOLVED:'Resolved',IGNORED:'Ignored',ACCEPTED:'Accepted'} as const)[i.status],change:(i.observations[0]?.change??'New') as Issue['change'],expected:i.expected,actual:i.actual,fix:i.suggestion,firstSeen:date(i.firstSeenAt),lastSeen:date(i.lastSeenAt)}))};
}
