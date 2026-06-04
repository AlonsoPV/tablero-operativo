/**
 * Alta masiva: usuarios Operativo por área (correo nombre@emx.mx, contraseña emx@2026).
 *
 * Requiere en .env (raíz del repo):
 *   SUPABASE_URL o VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso (PowerShell, desde la raíz del repo):
 *   node scripts/create-analistas-emx-batch.mjs
 *
 * Solo asegurar áreas en catálogo (sin crear usuarios):
 *   node scripts/create-analistas-emx-batch.mjs --areas-only
 *
 * Modo simulación (no escribe en Supabase):
 *   node scripts/create-analistas-emx-batch.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { loadDotenv } from './_load-dotenv.mjs'

loadDotenv(import.meta.url)

const DEFAULT_PASSWORD = 'emx@2026'
const BUSINESS_ROLE = 'Operativo'
const APP_ROLE = 'viewer'

/** @type {{ area: string; nombre: string }[]} */
const ANALISTAS = [
  { area: 'Operaciones', nombre: 'Irhec' },
  { area: 'Monitoreo', nombre: 'Héctor' },
  { area: 'Calidad', nombre: 'Itzel' },
  { area: 'Mantenimiento', nombre: 'Nubia' },
  { area: 'RH', nombre: 'Damaris' },
  { area: 'Sistemas', nombre: 'Leslie' },
  { area: 'Finanzas', nombre: 'Nancy Rojo' },
  { area: 'Proyectos', nombre: 'Gerardo Puga' },
  { area: 'Cobranza', nombre: 'Nora' },
  { area: 'Atención a Clientes', nombre: 'Rebeca' },
  { area: 'Planeación', nombre: 'Erick' },
  { area: 'Direccion general', nombre: 'Jorge Gonzalez' },
]

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const areasOnly = args.has('--areas-only')

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Correo: nombre normalizado sin espacios + @emx.mx (ej. "Nancy Rojo" → nancyrojo@emx.mx). */
function emailFromNombre(nombre) {
  const local = nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (!local) {
    throw new Error(`No se pudo derivar correo para nombre: "${nombre}"`)
  }
  return `${local}@emx.mx`
}

async function ensureAreas() {
  const uniqueAreas = [...new Set(ANALISTAS.map((r) => r.area.trim()))]
  for (const nombre of uniqueAreas) {
    if (dryRun) {
      console.log(`[dry-run] área: ${nombre}`)
      continue
    }
    const { data: existing, error: selectError } = await supabase
      .from('areas')
      .select('id, nombre')
      .ilike('nombre', nombre)
      .maybeSingle()

    if (selectError) {
      throw new Error(`areas select (${nombre}): ${selectError.message}`)
    }
    if (existing) {
      console.log(`[área OK]  ${nombre}`)
      continue
    }

    const { error: insertError } = await supabase.from('areas').insert({
      nombre,
      descripcion: `Área operativa: ${nombre}`,
      activo: true,
    })

    if (insertError) {
      throw new Error(`areas insert (${nombre}): ${insertError.message}`)
    }
    console.log(`[área +]  ${nombre}`)
  }
}

/** @returns {Promise<Map<string, import('@supabase/supabase-js').User>>} */
async function loadAuthUsersByEmail() {
  const map = new Map()
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers: ${error.message}`)
    for (const user of data.users ?? []) {
      if (user.email) map.set(user.email.toLowerCase(), user)
    }
    if (!data.users?.length || data.users.length < perPage) break
    page += 1
  }
  return map
}

async function upsertAppRole(userId) {
  const { error } = await supabase.from('user_roles').upsert(
    { user_id: userId, app_role: APP_ROLE },
    { onConflict: 'user_id' }
  )
  if (error) throw new Error(`user_roles: ${error.message}`)
}

async function upsertProfile(userId, { nombre, area }) {
  const { data: existing, error: selectError } = await supabase
    .from('usuarios')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (selectError) throw new Error(`usuarios select: ${selectError.message}`)

  const row = {
    user_id: userId,
    nombre,
    rol: BUSINESS_ROLE,
    area,
    activo: true,
    onboarding_completed: true,
  }

  if (existing) {
    const { error } = await supabase.from('usuarios').update(row).eq('user_id', userId)
    if (error) throw new Error(`usuarios update: ${error.message}`)
    return 'actualizado'
  }

  const { error } = await supabase.from('usuarios').insert(row)
  if (error) throw new Error(`usuarios insert: ${error.message}`)
  return 'creado'
}

async function provisionUser({ area, nombre }, authByEmail) {
  const email = emailFromNombre(nombre)
  const metadata = {
    nombre,
    rol: BUSINESS_ROLE,
    area,
    activo: true,
    onboarding_completed: true,
  }

  if (dryRun) {
    console.log(`[dry-run] ${email} | ${nombre} | ${area} | rol ${BUSINESS_ROLE}`)
    return { email, status: 'dry-run' }
  }

  const existing = authByEmail.get(email)
  let userId = existing?.id

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error) {
      throw new Error(`createUser (${email}): ${error.message}`)
    }
    userId = data.user?.id
    if (!userId) throw new Error(`createUser sin id (${email})`)
    authByEmail.set(email, data.user)
    console.log(`[auth +]  ${email}`)
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error) throw new Error(`updateUser (${email}): ${error.message}`)
    console.log(`[auth ~]  ${email} (ya existía)`)
  }

  await upsertAppRole(userId)
  const perfil = await upsertProfile(userId, { nombre, area })
  console.log(`[perfil]  ${email} → usuarios ${perfil}, app_role ${APP_ROLE}`)

  return { email, status: existing ? 'actualizado' : 'creado', userId }
}

async function main() {
  console.log(`Tablero operativo — alta Operativos EMX`)
  console.log(`Contraseña: ${DEFAULT_PASSWORD}`)
  console.log(`Rol negocio: ${BUSINESS_ROLE} | Rol app: ${APP_ROLE}\n`)

  if (areasOnly) {
    await ensureAreas()
    console.log('\nListo (solo áreas).')
    return
  }

  await ensureAreas()

  const authByEmail = dryRun ? new Map() : await loadAuthUsersByEmail()
  const results = []

  for (const row of ANALISTAS) {
    try {
      results.push(await provisionUser(row, authByEmail))
    } catch (err) {
      const email = emailFromNombre(row.nombre)
      console.error(`[ERROR] ${email}: ${err instanceof Error ? err.message : err}`)
      results.push({ email, status: 'error' })
    }
  }

  const created = results.filter((r) => r.status === 'creado').length
  const updated = results.filter((r) => r.status === 'actualizado').length
  const errors = results.filter((r) => r.status === 'error').length

  console.log('\n--- Resumen ---')
  console.log(`Creados:     ${created}`)
  console.log(`Actualizados:${updated}`)
  console.log(`Errores:     ${errors}`)
  console.log('\nCorreos generados:')
  for (const row of ANALISTAS) {
    console.log(`  ${emailFromNombre(row.nombre).padEnd(28)} ${row.nombre} (${row.area})`)
  }

  if (errors > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
