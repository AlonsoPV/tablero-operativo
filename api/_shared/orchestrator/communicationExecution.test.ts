import {afterEach, describe, expect, it, vi} from 'vitest'
import {prepareContextualExecution, revokeContextualExecution} from './communicationExecution.js'
import {createR1Db, r1Actor, R1_USERS} from './testing/r1Fixture.js'
import type {PendingCommunicationProposal} from './communicationComposer.js'
import type {ToolDispatcher} from '../query/index.js'

function fixture() {
  const actor = r1Actor(createR1Db(), R1_USERS.superAdmin, 'web', 'contextual-test')
  actor.copilot.accessToken = 'synthetic-session'
  const pending: PendingCommunicationProposal = {
    proposalId: 'context-1', idempotencyKey: 'key-1', version: 2, status: 'pending', channel: 'whatsapp',
    recipientMode: 'single', purpose: 'pending_actions', canSendDirect: true, channelLimitation: null,
    createdAt: '2026-11-25T12:00:00Z', recipients: [{recipientId:'recipient-1', recipientName:'Persona QA',
      channel:'whatsapp', canSendDirect:true, channelLimitation:null, subject:null, messageBody:'Mensaje autorizado', itemCount:1}],
  }
  const proposal = {id:'op-1', tool:'whatsapp_prepare_send', title:'Enviar WhatsApp', summary:'Revisar', fields:[],
    expiresAt:'2099-01-01T00:00:00Z', workspace:{kind:'whatsapp' as const, toUserId:'recipient-1', body:'Mensaje autorizado'}}
  const dispatch = vi.fn<ToolDispatcher>(async (_actor, name) => name === 'cancel_pending_op'
    ? {ok:true,tool:name,kind:'read',data:{status:'cancelled'}}
    : name === 'get_whatsapp_operation_status' ? {ok:true,tool:name,kind:'read',data:{operation_status:'pending',attempt:null,proposal}}
    : {ok:true,tool:name,kind:'proposal',proposal})
  return {actor,pending,proposal,dispatch}
}
afterEach(() => vi.unstubAllEnvs())
describe('puente contextual a pending ops existente', () => {
  it('solo prepara una aprobación real y la reutiliza; nunca ejecuta el proveedor', async () => {
    vi.stubEnv('R2_EXECUTION_MODE','disabled')
    const f=fixture()
    const first=await prepareContextualExecution(f.actor,f.pending,f.dispatch)
    const second=await prepareContextualExecution(f.actor,f.pending,f.dispatch)
    expect(first.proposal?.id).toBe('op-1')
    expect(second.proposal?.id).toBe('op-1')
    expect(f.dispatch.mock.calls.filter(c=>c[1] === 'whatsapp_prepare_send')).toHaveLength(1)
    expect(f.dispatch.mock.calls[0]![1]).toBe('whatsapp_prepare_send')
    expect(f.dispatch.mock.calls[0]![2]).toMatchObject({recipient_id:'recipient-1',body:'Mensaje autorizado'})
    expect(f.dispatch.mock.calls[0]![0].requestId).toBe('contextual:context-1:v2')
    expect(f.pending.status).toBe('pending')
  })
  it('distingue aceptación y entrega consultando el intento ya registrado', async () => {
    vi.stubEnv('R2_EXECUTION_MODE','disabled')
    const f=fixture(); await prepareContextualExecution(f.actor,f.pending,f.dispatch)
    f.dispatch.mockResolvedValueOnce({ok:true,tool:'get_whatsapp_operation_status',kind:'read',data:{operation_status:'confirmed',attempt:{delivery_status:'accepted'},proposal:f.proposal}})
    const result=await prepareContextualExecution(f.actor,f.pending,f.dispatch)
    expect(result.message).toContain('la entrega todavía no está confirmada')
    expect(result.proposal).toBeUndefined()
  })
  it('edición invalida la aprobación antigua y falla cerrado si no puede cancelarla', async () => {
    vi.stubEnv('R2_EXECUTION_MODE','disabled')
    const f=fixture()
    await prepareContextualExecution(f.actor,f.pending,f.dispatch)
    f.dispatch.mockResolvedValueOnce({ok:false,tool:'cancel_pending_op',kind:'error',error:'conflict'})
    await expect(revokeContextualExecution(f.actor,f.pending,f.dispatch)).rejects.toThrow('invalidar')
    expect(f.pending.execution?.version).toBe(2)
    await revokeContextualExecution(f.actor,f.pending,f.dispatch)
    expect(f.pending.execution).toBeUndefined()
  })
  it('no ofrece ejecución a piloto aunque tenga JWT y contacto', async () => {
    const f=fixture()
    vi.stubEnv('R2_EXECUTION_MODE','pilot')
    vi.stubEnv('R2_PILOT_USERS',f.actor.usuarioId)
    vi.stubEnv('SUPABASE_URL','https://syntheticpilotproject.supabase.co')
    const result=await prepareContextualExecution(f.actor,f.pending,f.dispatch)
    expect(result.proposal).toBeUndefined()
    expect(result.message).toContain('deshabilitados')
    expect(f.dispatch).not.toHaveBeenCalled()
  })
  it('no ejecuta por correo o por un canal sin sesión web', async () => {
    vi.stubEnv('R2_EXECUTION_MODE','disabled')
    const f=fixture()
    f.pending.channel='email'
    expect((await prepareContextualExecution(f.actor,f.pending,f.dispatch)).proposal).toBeUndefined()
    f.pending.channel='whatsapp';f.actor.channel='whatsapp'
    expect((await prepareContextualExecution(f.actor,f.pending,f.dispatch)).message).toContain('sesión web')
    expect(f.dispatch).not.toHaveBeenCalled()
  })
  it('cancela una propuesta cuyo destinatario o contenido no coincide', async () => {
    vi.stubEnv('R2_EXECUTION_MODE','disabled')
    const f=fixture();f.proposal.workspace.body='Mensaje diferente'
    const result=await prepareContextualExecution(f.actor,f.pending,f.dispatch)
    expect(result.proposal).toBeUndefined()
    expect(f.pending.execution).toBeUndefined()
    expect(f.dispatch.mock.calls.map(c=>c[1])).toEqual(['whatsapp_prepare_send','cancel_pending_op'])
  })
})


it('la aprobación se relee del servidor, nunca de una vista previa rehidratada o alterada',async()=>{
  vi.stubEnv('R2_EXECUTION_MODE','disabled')
  const f=fixture();await prepareContextualExecution(f.actor,f.pending,f.dispatch)
  f.pending.execution!.proposal={...f.proposal,title:'vista manipulada'}
  const next=await prepareContextualExecution(f.actor,f.pending,f.dispatch)
  expect(next.proposal?.title).toBe('Enviar WhatsApp')
  f.dispatch.mockResolvedValueOnce({ok:true,tool:'get_whatsapp_operation_status',kind:'read',data:{operation_status:'pending',attempt:null,proposal:{...f.proposal,workspace:{...f.proposal.workspace,body:'otro contenido'}}}})
  const mismatch=await prepareContextualExecution(f.actor,f.pending,f.dispatch)
  expect(mismatch.proposal).toBeUndefined()
  expect(mismatch.message).toContain('no coincide')
})

it.each(['email','whatsapp'] as const)('permite preparar %s solo dentro del piloto y no ejecuta el envío',async channel=>{
 const f=fixture(),sender='00000000-0000-4000-8000-000000000001',recipient='00000000-0000-4000-8000-000000000002'
 Object.entries({R2_EXECUTION_MODE:'pilot',R2_PILOT_USERS:sender,SUPABASE_URL:'https://synthetic.supabase.co',WHATSAPP_COMMUNICATIONS_ENABLED:'1',WHATSAPP_COMMUNICATIONS_SENDERS:sender,WHATSAPP_COMMUNICATIONS_RECIPIENTS:recipient,WHATSAPP_COMMUNICATIONS_CHANNELS:channel}).forEach(([k,v])=>vi.stubEnv(k,v))
 f.actor.channel='whatsapp';f.actor.usuarioId=sender;f.actor.copilot.usuarioId=sender;f.actor.copilot.whatsappId='15550001111';delete f.actor.copilot.accessToken
 f.pending.channel=channel;f.pending.recipients[0]!.recipientId=recipient;f.pending.recipients[0]!.subject=channel==='email'?'Asunto aprobado':null
 const proposal={...f.proposal,tool:channel==='email'?'notify_user_email':'whatsapp_prepare_send',workspace:{kind:channel,toUserId:recipient,body:'Mensaje autorizado',...(channel==='email'?{subject:'Asunto aprobado',to:['recipient@example.test']}:{})}}
 f.dispatch.mockResolvedValue({ok:true,tool:proposal.tool as never,kind:'proposal',proposal})
 const result=await prepareContextualExecution(f.actor,f.pending,f.dispatch)
 expect(result.proposal?.id).toBe(proposal.id)
 expect(f.dispatch).toHaveBeenCalledTimes(1)
 expect(f.dispatch.mock.calls[0]![1]).toBe(proposal.tool)
 expect(f.dispatch.mock.calls.map(call=>call[1])).not.toContain('confirm_pending_op')
})
