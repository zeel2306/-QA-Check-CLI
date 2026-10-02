import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {ApiError} from './http';
function client(){if(!process.env.S3_BUCKET||!process.env.S3_ACCESS_KEY_ID||!process.env.S3_SECRET_ACCESS_KEY)throw new ApiError(503,'STORAGE_NOT_CONFIGURED','Private report storage is not configured.');return new S3Client({endpoint:process.env.S3_ENDPOINT||undefined,region:process.env.S3_REGION||'us-east-1',forcePathStyle:Boolean(process.env.S3_ENDPOINT),credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}})}
export async function storeReport(key:string,report:unknown){await client().send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:JSON.stringify(report),ContentType:'application/json'}))}
export async function removeReport(key:string){await client().send(new DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:key}))}
export async function downloadReport(key:string){return getSignedUrl(client(),new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,ResponseContentDisposition:'attachment; filename="report.json"'}),{expiresIn:60})}
