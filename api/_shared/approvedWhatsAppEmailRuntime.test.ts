const syntheticWhatsAppSessionId = await whatsappSessionId('00000000-0000-4000-8000-000000000001','15550001111')
import {whatsappSessionId} from '../../supabase/functions/_shared/whatsappCommunicationGate.js'
import { confirmPendingOp } from './assistantOpsRuntime.js'
import { computeProposalVersion } from './whatsappR2Adapter.js'
import type { CopilotActor } from './assistantPending.js'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {matchesInternalAuthorization,loadApprovedWhatsAppEmail,claimApprovedWhatsAppEmail,recordApprovedWhatsAppEmail} from '../../supabase/functions/send-notification-email/approvedWhatsAppEmail.ts'
import {createFakeSupabase,type FakeDb} from './orchestrator/testing/fakeSupabase.js'
const sender='00000000-0000-4000-8000-000000000001',recipient='00000000-0000-4000-8000-000000000002',op='00000000-0000-4000-8000-000000000003'
const source=readFileSync('supabase/functions/send-notification-email/index.ts','utf8').replace(/^import .*\r?\n/gm,'')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
function fixture(){
 const env:Record<string,string>={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'internal-synthetic',WHATSAPP_COMMUNICATIONS_ENABLED:'1',WHATSAPP_COMMUNICATIONS_SENDERS:sender,WHATSAPP_COMMUNICATIONS_RECIPIENTS:recipient,WHATSAPP_COMMUNICATIONS_CHANNELS:'email',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',GOOGLE_REFRESH_TOKEN:'test',GOOGLE_GMAIL_FROM:'notifications@example.test'}
 const db:FakeDb={mutable:true,tables:{usuarios:[{id:sender,user_id:'auth-sender',rol:'super_admin',activo:true},{id:recipient,user_id:'auth-recipient',nombre:'Persona QA',activo:true}],user_channel_identities:[{channel:'whatsapp',usuario_id:sender,external_user_id:'15550001111',status:'active'}],assistant_pending_ops:[{id:op,usuario_id:sender,tool:'notify_user_email',status:'executing',channel:'whatsapp',session_id:syntheticWhatsAppSessionId,expires_at:'2099-01-01',expected_updated_at:null,result:null,preview:{workspace:{kind:'email',toUserId:recipient,to:['recipient@example.test'],subject:'Asunto exacto',body:'Contenido exacto sin instrucciones adicionales.'}},payload:{usuario_id:recipient,to_email:'recipient@example.test',subject:'Asunto exacto',body:'Contenido exacto sin instrucciones adicionales.'}}],notification_email_logs:[]},rpcs:{can_use_ai_whatsapp_for_usuario:()=>true,access_capabilities_for_usuario:()=>({active:true,super_admin:true})},inserts:[],queries:[]}
 const client=Object.assign(createFakeSupabase(db),{auth:{admin:{getUserById:async(id:string)=>({data:{user:{id,email:id==='auth-sender'?'sender@example.test':'recipient@example.test',email_confirmed_at:'2026-01-01'}},error:null})}}})
 let handler!:(req:Request)=>Promise<Response>
 new Function('Deno','createClient','matchesInternalAuthorization','loadApprovedWhatsAppEmail','claimApprovedWhatsAppEmail','recordApprovedWhatsAppEmail',js)(
 {env:{get:(k:string)=>env[k],toObject:()=>env},serve:(fn:typeof handler)=>{handler=fn}},()=>client,matchesInternalAuthorization,loadApprovedWhatsAppEmail,claimApprovedWhatsAppEmail,recordApprovedWhatsAppEmail)
 const send=(token='internal-synthetic',extra={})=>handler(new Request('https://test/send-notification-email',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({assistant_pending_op_id:op,...extra})}))
 return {env,db,send,client,handler}
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('real existing mailer with providers replaced',()=>{
 it('uses the registered recipient, exact content and caller Reply-To, records acceptance and refuses replay',async()=>{
  const f=fixture(),fetchMock=vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('oauth2')?{access_token:'test-oauth'}:{id:'gmail-test-accepted'}),{status:200}))
  vi.stubGlobal('fetch',fetchMock)
  const response=await f.send('internal-synthetic',{usuario_id:sender,payload:{mensaje:'UNTRUSTED OVERRIDE'}})
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({email_id:'gmail-test-accepted'})
  const call=fetchMock.mock.calls.find(([url])=>url.includes('messages/send'))!
  const init=(fetchMock.mock.calls as unknown as Array<[string,RequestInit]>).find(([url])=>url.includes('messages/send'))![1]
  expect(call).toBeTruthy()
  const raw=Buffer.from(JSON.parse(String(init.body)).raw,'base64url').toString('utf8')
  expect(raw).toContain('To: recipient@example.test')
  expect(raw).toContain('Reply-To: sender@example.test')
  expect(raw).toContain('Contenido exacto sin instrucciones adicionales.')
  expect(raw).not.toContain('UNTRUSTED OVERRIDE')
  expect(f.db.tables.notification_email_logs!.find(log=>log.id===op)).toMatchObject({status:'sent',email_id:'gmail-test-accepted',reason:'provider_accepted_not_delivered'})
  expect((await f.send()).status).toBeGreaterThanOrEqual(400)
  expect(fetchMock.mock.calls.filter(([url])=>url.includes('messages/send'))).toHaveLength(1)
 })
 it('rejects caller credentials and a closed gate before invoking Google',async()=>{
  const f=fixture(),network=vi.fn();vi.stubGlobal('fetch',network)
  expect((await f.send('ordinary-user-jwt')).status).toBe(401)
  f.env.WHATSAPP_COMMUNICATIONS_ENABLED='0'
  expect((await f.send()).status).toBe(403)
  expect(network).not.toHaveBeenCalled()
 })
 it('records an uncertain provider outcome and never retries it automatically',async()=>{
  const f=fixture(),network=vi.fn(async()=>{throw new Error('synthetic timeout')});vi.stubGlobal('fetch',network)
  expect((await f.send()).status).toBeGreaterThanOrEqual(400)
  expect(f.db.tables.notification_email_logs!.find(log=>log.id===op)?.status).toBe('unknown')
  await f.send()
  expect(network).toHaveBeenCalledTimes(1)
 })
})

it('reserva desde confirmPendingOp y reutiliza el mailer sin un segundo envío',async()=>{
 const f=fixture();const row=f.db.tables.assistant_pending_ops![0]!;row.status='pending'
 Object.entries({...f.env,R2_EXECUTION_MODE:'pilot',R2_PILOT_USERS:sender}).forEach(([k,v])=>vi.stubEnv(k,v))
 const actor={usuarioId:sender,authUserId:'auth-sender',rol:'super_admin',whatsappId:'15550001111',supabase:f.client} as CopilotActor
 const version=()=>computeProposalVersion({proposalId:op,usuarioId:sender,operation:'notify_user_email',scope:'notify_user_email',payload:row.payload as Record<string,unknown>,expectedUpdatedAt:null})
 const prepare=vi.fn(async()=>{})
 const options={expectedProposalVersion:version(),whatsappApproval:{waId:'15550001111',operationId:op},r2:{mode:'pilot' as const,executor:{kind:'pilot' as const,prepare} as never}}
 f.db.rpcs!.assistant_person_email=()=> 'recipient@example.test'
 const fetchMock=vi.fn(async(url:string,init?:RequestInit)=>url.includes('/functions/v1/send-notification-email')
   ? f.handler(new Request(url,init)) : new Response(JSON.stringify(url.includes('oauth2')?{access_token:'test-oauth'}:{id:'gmail-shared-flow'}),{status:200}))
 vi.stubGlobal('fetch',fetchMock)
 await expect(confirmPendingOp(actor,op,{...options,fromTool:true})).rejects.toThrow()
 await expect(confirmPendingOp(actor,op,{...options,r2:{...options.r2,mode:'qa'}})).rejects.toThrow(/compuerta del piloto/)
 await expect(confirmPendingOp(actor,op,{...options,expectedProposalVersion:'OBSOLETE'})).rejects.toThrow(/versión/)
 expect(fetchMock).not.toHaveBeenCalled()
 const result=await confirmPendingOp(actor,op,options)
 expect(result).toMatchObject({status:'confirmed',result:{email_id:'gmail-shared-flow',delivery_status:'accepted'}})
 expect(prepare).toHaveBeenCalled()
 await confirmPendingOp(actor,op,options)
 expect(fetchMock.mock.calls.filter(([url])=>url.includes('messages/send'))).toHaveLength(1)
})
