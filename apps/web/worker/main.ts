import {processOne} from './import';
import {db} from '../src/server/db';
let running=true;process.on('SIGINT',()=>{running=false});process.on('SIGTERM',()=>{running=false});
async function main(){while(running){try{await processOne();await db.rateBucket.deleteMany({where:{expiresAt:{lt:new Date()}}});}catch{console.error('Worker services are unavailable. Retrying.');}await new Promise(resolve=>setTimeout(resolve,2000));}await db.$disconnect();}
void main();
