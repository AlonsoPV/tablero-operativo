const syntheticWhatsAppSessionId = await whatsappSessionId('00000000-0000-4000-8000-000000000001','15550001111')
import {whatsappSessionId} from '../../supabase/functions/_shared/whatsappCommunicationGate.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWhatsAppCommunicationAllowed } from '../../supabase/functions/_shared/whatsappCommunicationGate.js'
import { assertWhatsAppCommunicationApproval } from './whatsappCommunicationApproval.js'
import { createFakeSupabase, type FakeDb } from './orchestrator/testing/fakeSupabase.js'
import type { CopilotActor } from './assistantPending.js'
const sender='00000000-0000-4000-8000-000000000001',recipient='00000000-0000-4000-8000-000000000002',op='00000000-0000-4000-8000-000000000003',phone='15550001111'
const env={WHATSAPP_COMMUNICATIONS_ENABLED:'1',WHATSAPP_COMMUNICATIONS_SENDERS:sender,WHATSAPP_COMMUNICATIONS_RECIPIENTS:recipient,WHATSAPP_COMMUNICATIONS_CHANNELS:'whatsapp,email'}
function setup(role='super_admin') {
  Object.entries({...env,R2_EXECUTION_MODE:'pilot',R2_PILOT_USERS:sender,SUPABASE_URL:'https://syntheticproject.supabase.co'}).forEach(([k,v])=>vi.stubEnv(k,v))
  const db:FakeDb={tables:{usuarios:[{id:sender,user_id:'auth',rol:role,activo:true}],user_channel_identities:[{usuario_id:sender,channel:'whatsapp',external_user_id:phone,status:'active'}]},rpcs:{can_use_ai_whatsapp_for_usuario:()=>true},inserts:[],queries:[]}
  const actor={usuarioId:sender,authUserId:'auth',rol:role,whatsappId:phone,supabase:createFakeSupabase(db)} as CopilotActor
  const row={id:op,usuario_id:sender,tool:'whatsapp_prepare_send',channel:'whatsapp',session_id:syntheticWhatsAppSessionId,payload:{to_user_id:recipient,body:'Mensaje exacto'},preview:{workspace:{kind:'whatsapp',toUserId:recipient,body:'Mensaje exacto'}}}
  return {db,actor,row,approval:{waId:phone,operationId:op}}
}
afterEach(()=>vi.unstubAllEnvs())
describe('allowlist adicional de comunicaciones',()=>{
 it('está apagada sin configuración y no acepta listas vacías ni comodines',()=>{
   expect(isWhatsAppCommunicationAllowed({},sender,recipient,'email')).toBe(false)
   expect(isWhatsAppCommunicationAllowed({...env,WHATSAPP_COMMUNICATIONS_SENDERS:'*'},sender,recipient,'email')).toBe(false)
   expect(isWhatsAppCommunicationAllowed({...env,WHATSAPP_COMMUNICATIONS_RECIPIENTS:''},sender,recipient,'email')).toBe(false)
   expect(isWhatsAppCommunicationAllowed(env,sender,recipient,'email')).toBe(true)
 })
 it('no altera el piloto global ni habilita el otro canal',()=>{
   expect(isWhatsAppCommunicationAllowed({...env,WHATSAPP_COMMUNICATIONS_CHANNELS:'email'},sender,recipient,'whatsapp')).toBe(false)
 })
 it('revalida identidad y permisos antes de aprobar',async()=>{
   const f=setup();await expect(assertWhatsAppCommunicationApproval(f.actor,f.row,f.approval)).resolves.toBeUndefined()
 })
 it.each(['Direccion','Analista'])('la allowlist nunca concede privilegios al rol %s',async role=>{
   const f=setup(role);await expect(assertWhatsAppCommunicationApproval(f.actor,f.row,f.approval)).rejects.toThrow(/PERMISSION_DENIED/)
 })
 it('rechaza otra sesión, otra operación y una identidad desvinculada',async()=>{
   const f=setup()
   await expect(assertWhatsAppCommunicationApproval(f.actor,{...f.row,session_id:'other'},f.approval)).rejects.toThrow()
   await expect(assertWhatsAppCommunicationApproval(f.actor,f.row,{...f.approval,operationId:'other'})).rejects.toThrow()
   f.db.tables.user_channel_identities=[]
   await expect(assertWhatsAppCommunicationApproval(f.actor,f.row,f.approval)).rejects.toThrow(/PERMISSION_DENIED/)
 })
 it('la compuerta cerrada o un modo simulado impiden envíos',async()=>{
   const f=setup();vi.stubEnv('WHATSAPP_COMMUNICATIONS_ENABLED','0')
   await expect(assertWhatsAppCommunicationApproval(f.actor,f.row,f.approval)).rejects.toThrow(/EXECUTION_DISABLED/)
   vi.stubEnv('WHATSAPP_COMMUNICATIONS_ENABLED','1');vi.stubEnv('R2_EXECUTION_MODE','simulated')
   await expect(assertWhatsAppCommunicationApproval(f.actor,f.row,f.approval)).rejects.toThrow(/EXECUTION_DISABLED/)
 })
})

it('rechaza una vista previa que difiere del cuerpo aprobado',async()=>{
 const f=setup();f.row.preview.workspace.body='Otro contenido'
 await expect(assertWhatsAppCommunicationApproval(f.actor,f.row,f.approval)).rejects.toThrow(/vista previa/)
})
