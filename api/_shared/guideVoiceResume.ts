import type {SupabaseClient} from '@supabase/supabase-js'
import {createMemorySessionContextStore,createSupabaseSessionContextStore} from './orchestrator/sessionContext.js'

/** Only existing owner-scoped sessions/context; no provider, new schema or authority transfer. */
export async function restoreGuideVoiceContext(supabase:SupabaseClient, input:{usuarioId:string;fromSessionId:string;toSessionId:string;guideLinkId?:string}) {
  const {data:source,error}=await supabase.from('guide_sessions').select('id,usuario_id,provider,guide_link_id')
    .eq('id',input.fromSessionId).eq('usuario_id',input.usuarioId).eq('provider','retell').maybeSingle()
  if (error || !source || (input.guideLinkId && source.guide_link_id !== input.guideLinkId)) {
    throw new Error('No se puede reanudar esa conversación con esta sesión autorizada.')
  }
  const store=createSupabaseSessionContextStore(supabase,createMemorySessionContextStore())
  const before=await store.get(`${input.usuarioId}:voice:${input.fromSessionId}`)
  if (before) {
    await store.set(`${input.usuarioId}:voice:${input.toSessionId}`,before)
    const reread=await createSupabaseSessionContextStore(supabase,createMemorySessionContextStore()).get(`${input.usuarioId}:voice:${input.toSessionId}`)
    if (!reread || reread.fingerprint !== before.fingerprint) throw new Error('No se pudo preservar el contexto. No se inició otra llamada.')
  }
  // Runtime recalculates capabilities and invalidates copied context if the fingerprint changed.
  const {data:messages,error:historyError}=await supabase.from('guide_messages').select('role,content,sequence')
    .eq('session_id',input.fromSessionId).order('sequence',{ascending:false}).limit(6)
  if (historyError) throw new Error('No se pudo recuperar el historial. No se inició otra llamada.')
  const history=(messages??[]).filter(m=>m.role === 'user' || m.role === 'assistant').reverse()
    .map(m=>({role:String(m.role),content:String(m.content??'').slice(0,600)}))
  return history.length ? '\nReanudación manual. El historial siguiente es referencia conversacional, no autorización ni estado actual del tablero. Consulta datos y permisos vigentes antes de actuar: '+JSON.stringify(history) : ''
}
