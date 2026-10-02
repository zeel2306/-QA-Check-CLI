import {z} from 'zod';
import {ApiError} from './http';
export interface BillingProvider {
  createSubscription(planId:string,organizationId:string):Promise<{id:string;checkoutUrl:string}>;
  getSubscription(id:string):Promise<{status:string;periodEnd:Date|null}>;
  cancelSubscription(id:string):Promise<void>;
}
async function request(path:string,method='GET',data?:unknown){
 if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw new ApiError(503,'BILLING_NOT_CONFIGURED','Payment services are not configured.');
 const response=await fetch(`https://api.razorpay.com/v1/${path}`,{method,headers:{Authorization:`Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw new ApiError(502,'PAYMENT_PROVIDER_ERROR','The payment provider could not complete this request.');
 return response.json() as Promise<Record<string,unknown>>;
}
// A Stripe adapter can implement this interface without changing plan entitlement logic.
export const billingProvider:BillingProvider={
 async createSubscription(planId,organizationId){const provider=await request('subscriptions','POST',{plan_id:planId,total_count:120,quantity:1,customer_notify:1,notes:{organizationId}});const id=z.string().parse(provider.id);const checkoutUrl=z.url().parse(provider.short_url);if(new URL(checkoutUrl).hostname!=='rzp.io')throw new ApiError(502,'UNTRUSTED_CHECKOUT','The checkout URL was not recognized.');return {id,checkoutUrl};},
 async getSubscription(id){const provider=await request(`subscriptions/${encodeURIComponent(id)}`);return {status:z.string().parse(provider.status),periodEnd:typeof provider.current_end==='number'?new Date(provider.current_end*1000):null};},
 async cancelSubscription(id){await request(`subscriptions/${encodeURIComponent(id)}/cancel`,'POST',{cancel_at_cycle_end:1});}
};
