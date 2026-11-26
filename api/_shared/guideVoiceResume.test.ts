import {describe,expect,it,vi} from 'vitest'
import {restoreGuideVoiceContext} from './guideVoiceResume'
import {createFakeSupabase} from './orchestrator/testing/fakeSupabase'
import {createMemorySessionContextStore,createSupabaseSessionContextStore} from './orchestrator/sessionContext'
function fixture(){
 const db={tables:{guide_sessions:[{id:'old',usuario_id:'qa-owner',provider:'retell',guide_link_id:'link-1'}],guide_messages:[{session_id:'old',sequence:1,role:'user',content:'Revisar inventario'}],agent_session_context:[] as Record<string,unknown>[]},inserts:[] as unknown[],queries:[] as unknown[]}
 return {db,client:createFakeSupabase(db as never)}
}
describe('reanudación de voz sin proveedor',()=>{
 it('copia solo contexto propio y conserva mensajes de referencia',async()=>{
   const {db,client}=fixture()
   const store=createSupabaseSessionContextStore(client,createMemorySessionContextStore())
   await store.set('qa-owner:voice:old',{lastActions:[],lastEntity:null,fingerprint:'qa-fingerprint',pendingWrite:{operation:'create_action',request:'Revisar inventario',proposalId:'41ed066e-b231-578a-a976-ceda3f262053'},activeQuery:{type:'active_query',entity:'actions',scope:'assigned_to_me',status_group:'open',visual:'none',at:'2026-11-25T00:00:00Z'}})
   const history=await restoreGuideVoiceContext(client,{usuarioId:'qa-owner',fromSessionId:'old',toSessionId:'new',guideLinkId:'link-1'})
   expect(history).toContain('Revisar inventario')
   expect(history).toContain('no autorización')
   const next=await createSupabaseSessionContextStore(client,createMemorySessionContextStore()).get('qa-owner:voice:new')
   expect(next?.activeQuery).toMatchObject({entity:'actions',scope:'assigned_to_me'})
   expect(next?.pendingWrite).toMatchObject({operation:'create_action',proposalId:'41ed066e-b231-578a-a976-ceda3f262053'})
   expect(db.tables.guide_messages).toHaveLength(1)
 })
 it.each([{usuarioId:'other',guideLinkId:'link-1'},{usuarioId:'qa-owner',guideLinkId:'another-link'}])('rechaza dueño o liga ajenos antes de copiar contexto',async identity=>{
   const {db,client}=fixture()
   await expect(restoreGuideVoiceContext(client,{...identity,fromSessionId:'old',toSessionId:'new'})).rejects.toThrow('sesión autorizada')
   expect(db.inserts).toHaveLength(0)
 })
})
