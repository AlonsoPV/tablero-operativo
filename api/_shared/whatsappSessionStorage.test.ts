import {describe,it,expect} from 'vitest'
import {whatsappSessionId} from '../../supabase/functions/_shared/whatsappCommunicationGate.js'
import {createPendingOp,type CopilotActor} from './assistantPending.js'
import {buildProposalBinding,buildWhatsAppInteractiveProposalButtons,resolveWhatsAppProposalApproval,formatWhatsAppProposalPrompt} from './whatsappR2Adapter.js'
const sender='00000000-0000-4000-8000-000000000001',op='00000000-0000-4000-8000-000000000003',phone='5215500001149'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('WhatsApp pending storage and interactive approval contract',()=>{
 it('persists a UUID rather than a phone, preserving the exact approved content',async()=>{
  const inserted:Record<string,unknown>[]=[]
  const actor={usuarioId:sender,supabase:{from:(table:string)=>({insert:(row:Record<string,unknown>)=>{
    if (table === 'assistant_pending_ops') {
      expect(row.session_id).toMatch(uuid)
      inserted.push(row)
    }
    return {select:()=>({single:async()=>({data:{id:op,expires_at:'2099-01-01'},error:null})})}
  }})}} as unknown as CopilotActor
  const body='Prueba controlada de envío desde WhatsApp de Scrumban'
  const proposal=await createPendingOp(actor,{tool:'whatsapp_prepare_send',channel:'whatsapp',sessionId:phone,payload:{body},proposal:{title:'Enviar WhatsApp',summary:'Revisar',fields:[],workspace:{kind:'whatsapp',body}}})
  expect(proposal.id).toBe(op)
  expect(inserted[0]?.payload).toEqual({body})
  expect(inserted[0]?.session_id).toBe(await whatsappSessionId(sender,phone))
 })
 it('keeps MX phone variants stable and separates users and phone identities',async()=>{
  const key=await whatsappSessionId(sender,phone)
  expect(key).toBe(await whatsappSessionId(sender,'525500001149'))
  expect(key).toBe(await whatsappSessionId(sender,'5500001149'))
  expect(key).not.toBe(await whatsappSessionId(sender,'5215500001150'))
  expect(key).not.toBe(await whatsappSessionId(op,phone))
  await expect(whatsappSessionId(phone,phone)).rejects.toThrow()
 })
 it.each(['whatsapp_prepare_send','notify_user_email'])('emits version-bound Confirmar, Editar and Cancelar for %s',operation=>{
  const b=buildProposalBinding({proposalId:op,usuarioId:sender,operation,scope:operation,summary:'Mensaje',payload:{body:'Exacto'},expiresAt:'2099-01-01'})
  const buttons=buildWhatsAppInteractiveProposalButtons(b,'pilot')
  expect(buttons.map(x=>x.reply.title)).toEqual(['Confirmar','Editar','Cancelar'])
  expect(buttons[0]?.reply.id).toContain(b.version)
  expect(buttons[1]?.reply.id).toContain(b.version)
  const edited=resolveWhatsAppProposalApproval({actorUsuarioId:sender,actorActive:true,pending:[b],decision:{kind:'edit_bound',proposalId:op,version:b.version},executionMode:'pilot'})
  expect(edited.status).toBe('edit_prompt')
  expect(edited.message).toContain('Cambia el mensaje a:')
  const obsolete=resolveWhatsAppProposalApproval({actorUsuarioId:sender,actorActive:true,pending:[b],decision:{kind:'edit_bound',proposalId:op,version:'OLD'},executionMode:'pilot'})
  expect(obsolete.status).toBe('version_mismatch')
  expect(buildWhatsAppInteractiveProposalButtons(b,'disabled')).toEqual([])
  expect(formatWhatsAppProposalPrompt(b,{executionMode:'pilot'})).not.toContain('fecha=')
 })
})


it('omits redundant code instructions only for an interactive preview that fits',()=>{
 const b=buildProposalBinding({proposalId:op,usuarioId:sender,operation:'whatsapp_prepare_send',scope:'whatsapp_prepare_send',summary:'Mensaje de prueba',payload:{body:'Exacto'},expiresAt:'2099-01-01'})
 const compact=formatWhatsAppProposalPrompt(b,{executionMode:'pilot',interactiveButtons:true})
 expect(compact).toContain(`Código: ${b.version}`)
 expect(compact).not.toContain('¿Confirmas la operación?')
 expect(compact).not.toContain('Un "sí" suelto')
 const fallback=formatWhatsAppProposalPrompt(b,{executionMode:'pilot',interactiveButtons:true,interactiveMaxChars:10})
 expect(fallback).toContain(`confirmar ${b.version}`)
 expect(formatWhatsAppProposalPrompt(b,{executionMode:'pilot'})).toContain(`confirmar ${b.version}`)
})
