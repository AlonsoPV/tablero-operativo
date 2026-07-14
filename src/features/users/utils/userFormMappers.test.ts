import { describe, expect, it } from 'vitest'
import { updateUserFormSchema } from '../schemas/user.schema'
import { toCreateUserInput, toUpdateUserInput } from './userFormMappers'

describe('user form mappers', () => {
  it('toUpdateUserInput envia todos los campos editables', () => {
    expect(
      toUpdateUserInput(
        {
          nombre: '  Ana Perez ',
          rol: 'Operaciones',
          area: 'Logistica',
          additional_area_ids: [],
          activo: false,
          manager_user_id: '11111111-1111-1111-1111-111111111111',
          direct_report_ids: [],
        },
        [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', nombre: 'Logistica' }]
      )
    ).toEqual({
      nombre: 'Ana Perez',
      rol: 'Operaciones',
      area: 'Logistica',
      primary_area_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      area_ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
      activo: false,
      manager_user_id: '11111111-1111-1111-1111-111111111111',
    })
  })

  it('toUpdateUserInput normaliza area vacia a null', () => {
    expect(
      toUpdateUserInput({
        nombre: 'Ana',
        rol: 'Operaciones',
        area: null,
        additional_area_ids: [],
        activo: true,
        direct_report_ids: [],
      }).area
    ).toBeNull()
  })

  it('toCreateUserInput envia todos los campos de alta', () => {
    expect(
      toCreateUserInput({
        email: ' Ana@Empresa.COM ',
        nombre: 'Ana',
        rol: 'Operaciones',
        area: 'RH',
        additional_area_ids: [],
        activo: true,
        direct_report_ids: [],
      })
    ).toEqual({
      email: 'ana@empresa.com',
      nombre: 'Ana',
      rol: 'Operaciones',
      area: 'RH',
      activo: true,
    })
  })

  it('toCreateUserInput exige correo', () => {
    expect(() =>
      toCreateUserInput({
        nombre: 'Ana',
        rol: 'Operaciones',
        area: null,
        additional_area_ids: [],
        activo: true,
        direct_report_ids: [],
      })
    ).toThrow(/correo/i)
  })
})

describe('updateUserFormSchema', () => {
  it('acepta nombre, rol, area y activo en false', () => {
    const parsed = updateUserFormSchema.parse({
      nombre: 'Carlos',
      rol: 'Direccion',
      area: null,
      activo: false,
    })

    expect(parsed).toMatchObject({
      nombre: 'Carlos',
      rol: 'Direccion',
      area: null,
      activo: false,
      additional_area_ids: [],
      direct_report_ids: [],
    })
  })

  it('recorta nombre y area', () => {
    const parsed = updateUserFormSchema.parse({
      nombre: '  Maria  ',
      rol: 'Operaciones',
      area: '  Finanzas ',
      activo: true,
    })

    expect(parsed.nombre).toBe('Maria')
    expect(parsed.area).toBe('Finanzas')
  })
})
