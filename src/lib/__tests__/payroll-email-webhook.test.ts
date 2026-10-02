import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const m=vi.hoisted(()=>({verify:vi.fn(),from:vi.fn()}));
vi.mock("../resend",()=>({getResendClient:()=>({webhooks:{verify:m.verify}})}));
vi.mock("../supabase-admin",()=>({getSupabaseAdmin:()=>({from:m.from})}));
import {POST} from "../../app/api/webhooks/resend/route";
let update: Record<string,unknown>|null;let prior: string;let updateError:boolean;
beforeEach(()=>{
 vi.clearAllMocks(); process.env.RESEND_WEBHOOK_SECRET="secret"; update=null; prior="2026-10-02T20:00:00Z";updateError=false;
 m.from.mockImplementation((table:string)=>{
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>update ? {data:updateError ? null : {id:"audit"},error:updateError ? {message:"fail"} : null} : ({data:table==='payroll_email_notifications'?{id:'audit',status_at:prior}:null,error:null}),insert:async()=>({error:null}),update:(data:Record<string,unknown>)=>{update=data;return q;},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({error:updateError?{message:'fail'}:null}).then(resolve)};return q;
 });
});
const request=()=>({headers:new Headers({'webhook-id':'event1','webhook-timestamp':'123','webhook-signature':'sig'}),text:async()=>"{}"}) as NextRequest;
it.each(['delivered','bounced','failed'])("records verified %s delivery event in shared payroll history",async(status)=>{
 m.verify.mockReturnValue({type:`email.${status}`,created_at:'2026-10-02T20:01:00Z',data:{email_id:'re1'}});
 expect((await POST(request())).status).toBe(200);
 expect(update).toMatchObject({status});
});
it('ignores older events',async()=>{
 prior='2026-10-02T20:02:00Z';m.verify.mockReturnValue({type:'email.sent',created_at:'2026-10-02T20:01:00Z',data:{email_id:'re1'}});
 expect((await POST(request())).status).toBe(200);expect(update).toBeNull();
});
it('returns retryable failure when delivery logging fails',async()=>{
 updateError=true;m.verify.mockReturnValue({type:'email.delivered',created_at:'2026-10-02T20:01:00Z',data:{email_id:'re1'}});
 expect((await POST(request())).status).toBe(500);
});
it('rejects unsigned events before touching audit records',async()=>{
 const r=request();r.headers.delete('webhook-signature');expect((await POST(r)).status).toBe(400);expect(m.from).not.toHaveBeenCalled();
});

it('matches the central claim tag when delivery arrives before send response is logged',async()=>{
 m.verify.mockReturnValue({type:'email.delivered',created_at:'2026-10-02T20:01:00Z',data:{email_id:'re1',tags:{winsalot_payroll_notification:'audit'}}});
 expect((await POST(request())).status).toBe(200);
 expect(update).toMatchObject({status:'delivered',resend_email_id:'re1'});
});
