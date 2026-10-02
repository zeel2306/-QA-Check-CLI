import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
async function seed(){await db.plan.upsert({where:{key:'free'},update:{},create:{key:'free',name:'Free',amountMinor:0,currency:'INR',projectLimit:1,monthlyRunLimit:5}});await db.plan.upsert({where:{key:'pro'},update:{providerPlanId:process.env.RAZORPAY_PRO_PLAN_ID||null},create:{key:'pro',name:'Pro',amountMinor:79900,currency:'INR',projectLimit:10,monthlyRunLimit:1000,providerPlanId:process.env.RAZORPAY_PRO_PLAN_ID||null}})}
seed().finally(()=>db.$disconnect());
