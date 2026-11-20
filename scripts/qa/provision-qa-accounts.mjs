#!/usr/bin/env node
/* global process, console */
// Aprovisiona cuentas y datos sintéticos en los proyectos QA A y B (R1/R2).
// PREPARADO, NO EJECUTADO. Por defecto sólo imprime el plan; --apply escribe en el proyecto QA.
// Usa la service role del proyecto QA sólo para crear cuentas y datos; las pruebas de permisos
// (run-jwt-suite.mjs) usan exclusivamente sesiones JWT de esas cuentas.
//
// Variables: R2_QA_PROJECT_REFS, QA_A_SUPABASE_URL, QA_A_ANON_KEY, QA_A_SERVICE_ROLE_KEY,
// QA_B_* equivalentes y QA_ACCOUNT_PASSWORD (no se guarda en disco).
// Uso: node scripts/qa/provision-qa-accounts.mjs [--target=A|B] [--apply]
import { mkdirSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { QA_ACCOUNTS, emailFor, parseArgs, requirePassword, requireQaTarget } from './qaGuard.mjs'

const args = parseArgs()
const targets = args.target === 'ALL' ? ['A', 'B'] : [args.target]

// Acciones sintéticas con id fijo (idempotente). Fechas futuras relativas al día de ejecución.
const ACTIONS = [
  { id: '00000000-0000-4000-a000-0000000000a1', titulo: 'QA R2 · acción del responsable', creator: 'lider', responsable: 'responsable' },
  { id: '00000000-0000-4000-a000-0000000000a2', titulo: 'QA R2 · acción de la creadora', creator: 'lider', responsable: 'lider' },
  { id: '00000000-0000-4000-a000-0000000000a3', titulo: 'QA R2 · bloqueo y concurrencia', creator: 'lider', responsable: 'responsable' },
]

function futureDate(days) {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

async function ensureAccount(admin, account, password) {
  const email = emailFor(account)
  let authId = null
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre: account.nombre } })
  if (created.error) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error
    authId = data.users.find((u) => u.email === email)?.id ?? null
    if (!authId) throw created.error
    await admin.auth.admin.updateUserById(authId, { password })
  } else {
    authId = created.data.user.id
  }
  const profile = { nombre: account.nombre, rol: account.rol, area: account.area, activo: account.activo }
  const { data: existing } = await admin.from('usuarios').select('id').eq('user_id', authId).maybeSingle()
  const write = existing
    ? await admin.from('usuarios').update(profile).eq('id', existing.id).select('id').single()
    : await admin.from('usuarios').insert({ ...profile, user_id: authId }).select('id').single()
  if (write.error) throw new Error(`usuarios(${account.key}): ${write.error.message}`)
  return { key: account.key, email, authUserId: authId, usuarioId: write.data.id, rol: account.rol, activo: account.activo }
}

async function ensureOkrsRole(admin, users) {
  const name = 'QA OKRS (sintético)'
  let { data: role } = await admin.from('catalog_roles').select('id').eq('nombre', name).maybeSingle()
  if (!role) {
    const inserted = await admin.from('catalog_roles').insert({ nombre: name, activo: true }).select('id').single()
    if (inserted.error) throw inserted.error
    role = inserted.data
  }
  for (const module_key of ['okrs', 'dashboard']) {
    const { error } = await admin.from('catalog_role_modules').upsert({ role_id: role.id, module_key }, { onConflict: 'role_id,module_key' })
    if (error) throw new Error(`catalog_role_modules(${module_key}): ${error.message}`)
  }
  for (const user of users) {
    const { error } = await admin.from('usuario_catalog_roles')
      .upsert({ user_id: user.usuarioId, role_id: role.id, is_primary: false }, { onConflict: 'user_id,role_id' })
    if (error) throw new Error(`usuario_catalog_roles(${user.key}): ${error.message}`)
  }
}

async function ensureActions(admin, byKey) {
  for (const [i, a] of ACTIONS.entries()) {
    const row = {
      id: a.id,
      titulo_accion: a.titulo,
      descripcion_accion: 'Registro sintético para la validación QA R1/R2.',
      evidencia_esperada: 'Evidencia sintética',
      fecha: futureDate(3 + i),
      hora_limite: '17:00',
      estado: 'Pendiente',
      prioridad: 'P2_Media',
      tipo_accion: 'operativa',
      responsable: byKey[a.responsable].usuarioId,
      created_by: byKey[a.creator].usuarioId,
    }
    const { error } = await admin.from('acciones_diarias').upsert(row, { onConflict: 'id' })
    if (error) throw new Error(`acciones_diarias(${a.id}): ${error.message}`)
  }
}

async function provision(target, password) {
  const qa = requireQaTarget(target, process.env, { needService: true })
  const accounts = QA_ACCOUNTS.filter((a) => a.target === target)
  console.log(`\nQA ${target} · proyecto ${qa.ref}`)
  for (const a of accounts) console.log(`  cuenta ${emailFor(a)} · ${a.rol}${a.okrs ? ' + módulo OKRS' : ''}${a.activo ? '' : ' · inactiva'}`)
  if (target === 'A') for (const a of ACTIONS) console.log(`  acción ${a.id} · ${a.titulo} · creadora ${a.creator} · responsable ${a.responsable}`)
  if (!args.apply) {
    console.log('  (dry-run: nada escrito; usa --apply con autorización)')
    return
  }
  const admin = createClient(qa.url, qa.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const users = []
  for (const account of accounts) users.push(await ensureAccount(admin, account, password))
  const byKey = Object.fromEntries(users.map((u) => [u.key, u]))
  if (target === 'A') {
    await ensureOkrsRole(admin, users.filter((u) => QA_ACCOUNTS.find((a) => a.key === u.key)?.okrs))
    await ensureActions(admin, byKey)
  }
  mkdirSync('.qa', { recursive: true })
  const manifest = { target, ref: qa.ref, generatedAt: new Date().toISOString(), users, actions: target === 'A' ? ACTIONS : [] }
  writeFileSync(`.qa/manifest-${target}.json`, JSON.stringify(manifest, null, 2))
  console.log(`  manifiesto: .qa/manifest-${target}.json (sin contraseñas ni claves)`)
}

const password = args.apply ? requirePassword() : ''
for (const target of targets) await provision(target, password)
