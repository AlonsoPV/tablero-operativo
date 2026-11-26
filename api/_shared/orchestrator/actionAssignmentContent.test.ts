import {describe,expect,it} from 'vitest'
import {extractActionPatch} from './structuredActionDraft.js'
describe('atributos de asignación separados del trabajo',()=>{
 it('retira la cláusula de responsable del título y la descripción',()=>{
  const patch=extractActionPatch('Crea una acción para revisar inventario, para Carlos, en Kanban corporativo, para el viernes','2026-11-25',false)
  expect(patch.titulo).toBe('Revisar inventario')
  expect(patch.descripcion).toBe('Revisar inventario')
  expect(patch.responsableHint).toBe('Carlos')
  expect(patch.fecha).toBe('2026-11-27')
 })
 it('conserva un nombre que forma parte del trabajo, sin cláusula separada',()=>{
  const patch=extractActionPatch('Crea una acción para preparar presentación para Carlos','2026-11-25',false)
  expect(patch.titulo).toContain('presentación para Carlos')
 })
})
