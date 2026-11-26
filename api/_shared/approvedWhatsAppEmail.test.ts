const syntheticWhatsAppSessionId = await whatsappSessionId('00000000-0000-4000-8000-000000000001','15550001111')
import {whatsappSessionId} from '../../supabase/functions/_shared/whatsappCommunicationGate.js'
import { describe, expect, it } from 'vitest'
import { matchesInternalAuthorization, loadApprovedWhatsAppEmail, claimApprovedWhatsAppEmail } from '../../supabase/functions/send-notification-email/approvedWhatsAppEmail.ts'
import {createFakeSupabase,type FakeDb} from './orchestrator/testing/fakeSupabase.js'
const sender='00000000-0000-4000-8000-000000000001',recipient='00000000-0000-4000-8000-000000000002',op='00000000-0000-4000-8000-000000000003',phone='15550001111'
const env={WHATSAPP_COMMUNICATIONS_ENABLED:'1',WHATSAPP_COMMUNICATIONS_SENDERS:sender,WHATSAPP_COMMUNICATIONS_RECIPIENTS:recipient,WHATSAPP_COMMUNICATIONS_CHANNELS:'email'}
function fixture(){
 const row={id:op,usuario_id:sender,tool:'notify_user_email',channel:'whatsapp',session_id:syntheticWhatsAppSessionId,status:'executing',expires_at:'2099-01-01T00:00:00Z',payload:{usuario_id:recipient,to_email:'recipient@example.test',subject:'Asunto exacto',body:'Contenido exacto'}}
 const db:FakeDb={mutable:true,tables:{assistant_pending_ops:[row],notification_email_logs:[],usuarios:[{id:sender,user_id:'auth',activo:true}],user_channel_identities:[{channel:'whatsapp',usuario_id:sender,external_user_id:phone,status:'active'}]},rpcs:{can_use_ai_whatsapp_for_usuario:()=>true,access_capabilities_for_usuario:()=>({active:true,super_admin:true,direction:false})},inserts:[],queries:[]}
 const client=Object.assign(createFakeSupabase(db),{auth:{admin:{getUserById:async()=>({data:{user:{id:'auth',email:'sender@example.test',email_confirmed_at:'2026-01-01'}},error:null})}}})
 return {row,db,client}
}
describe('delegación acotada al mailer existente',()=>{
 it('no acepta JWT de usuario, claves ajenas ni configuración ausente',async()=>{
  expect(await matchesInternalAuthorization('Bearer ordinary-user-jwt','internal-test')).toBe(false)
  expect(await matchesInternalAuthorization('Bearer internal-test',undefined)).toBe(false)
  expect(await matchesInternalAuthorization('Bearer internal-test','internal-test')).toBe(true)
 })
 it('deriva destinatario, asunto y cuerpo solo de la operación reservada',async()=>{
  const f=fixture();const result=await loadApprovedWhatsAppEmail(f.client,op,env)
  expect(result.body).toMatchObject({usuario_id:recipient,payload:{titulo:'Asunto exacto',mensaje:'Contenido exacto'}})
 })
 it.each(['pending','confirmed','cancelled','conflict'])('rechaza operaciones %s',async status=>{
  const f=fixture();f.row.status=status;await expect(loadApprovedWhatsAppEmail(f.client,op,env)).rejects.toThrow()
 })
 it('bloquea expiración, desvinculación y destinatarios no autorizados',async()=>{
  const f=fixture();f.row.expires_at='2020-01-01';await expect(loadApprovedWhatsAppEmail(f.client,op,env)).rejects.toThrow()
  f.row.expires_at='2099-01-01';f.db.tables.user_channel_identities=[];await expect(loadApprovedWhatsAppEmail(f.client,op,env)).rejects.toThrow()
  await expect(loadApprovedWhatsAppEmail(f.client,op,{...env,WHATSAPP_COMMUNICATIONS_RECIPIENTS:''})).rejects.toThrow()
 })
 it('reserva exactamente un intento y no reenvía ante un resultado incierto',async()=>{
  const f=fixture();const snapshot=structuredClone(f.row)
  const settled=await Promise.allSettled([claimApprovedWhatsAppEmail(f.client,snapshot),claimApprovedWhatsAppEmail(f.client,snapshot)])
  expect(settled.filter(x=>x.status==='fulfilled')).toHaveLength(1)
  await expect(claimApprovedWhatsAppEmail(f.client,f.row)).rejects.toThrow(/intento/)
  expect(f.db.tables.notification_email_logs).toHaveLength(1)
  expect(f.row.payload).not.toHaveProperty('_whatsapp_email_attempt')
 })
})
