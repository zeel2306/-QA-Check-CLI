import {PrismaClient} from '@prisma/client';
const globalDb=globalThis as unknown as {qaDb?:PrismaClient};
export const db=globalDb.qaDb??new PrismaClient();
if(process.env.NODE_ENV!=='production')globalDb.qaDb=db;
