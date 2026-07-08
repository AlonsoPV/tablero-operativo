import { describe, expect, it } from 'vitest'
import { updateUserFormSchema } from '../schemas/user.schema'
import { toCreateUserInput, toUpdateUserInput } from './userFormMappers'

describe('user form mappers', () => {
  it('toUpdateUserInput envia todos los campos editables', () => {
    expect(
      toUpdateUserInput({
        nombre: '  Ana Perez ',
        rol: 'Operaciones',
        area: 'Logistica',
        activo: false,
        manager_user_id: 'manager-1',
      })
    ).toEqual({
      nombre: 'Ana Perez',
      rol: 'Operaciones',
      area: 'Logistica',
      activo: false,
      manager_user_id: 'manager-1',
    })
  })

  it('toUpdateUserInput normaliza area vacia a null', () => {
    expect(
      toUpdateUserInput({
        nombre: 'Ana',
        rol: 'Operaciones',
        area: null,
        activo: true,
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
        activo: true,
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
        activo: true,
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

    expect(parsed).toEqual({
      email: undefined,
      nombre: 'Carlos',
      rol: 'Direccion',
      area: null,
      activo: false,
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
