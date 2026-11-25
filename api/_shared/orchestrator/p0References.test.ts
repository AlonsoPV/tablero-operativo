import {describe,expect,it} from 'vitest'
import {classifyAgentIntent} from './intent.js'
const pending={pendingWrite:{operation:'create_action',request:'Revisar inventario'},hasPendingCommunication:true}
describe('referencias de aceptación P0',()=>{
  it.each(['¿Cómo quedó?','Regresa al borrador anterior','Muéstrame la acción que preparamos','Regresa al mensaje para Gerardo','Ahora volvamos a la acción'])('%s recupera propuesta',text=>{
    expect(classifyAgentIntent(text,null,pending).kind).toBe('review_pending')
  })
  it('una consulta ordinaria a una acción no se convierte en recuperar borrador',()=>{
    expect(classifyAgentIntent('Muestra la acción emx_52276',null,{}).kind).not.toBe('review_pending')
  })
})
