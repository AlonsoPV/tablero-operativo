#!/usr/bin/env node
/**
 * SCRUMBAN — Dataset Sintético de Demostración Comercial (<= 15 min, $0 USD).
 *
 * Empresa ficticia: "Logística Norte Demo S.A. de C.V."
 * Prefijo aislado:  `[DEMO-CORP]` (separado de fixtures QA `tc-qa-*` / `p2*`).
 * Seguridad:        Sólo opera contra Supabase Local (`127.0.0.1` / `localhost`).
 *                   Bloquea fail-closed cualquier URL remota (DEV/PROD/TOOL SCRUMBAN).
 *
 * Uso:
 *   node scripts/qa/demo-commercial-seed.mjs --seed
 *   node scripts/qa/demo-commercial-seed.mjs --verify
 *   node scripts/qa/demo-commercial-seed.mjs --clean
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DEMO_PREFIX = '[DEMO-CORP]'

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function loadLocalEnv() {
  const envFile = '.qa/text-complete-local.env'
  if (!fs.existsSync(envFile)) {
    throw new Error(`Falta ${envFile}. Ejecuta desde el worktree local QA.`)
  }
  const out = {}
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

function assertLoopbackSupabase(urlStr) {
  const u = new URL(urlStr)
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
    throw new Error(`ABORTADO FAIL-CLOSED: ${urlStr} no es Supabase Local (127.0.0.1).`)
  }
}

function addDays(baseIso, days) {
  const d = new Date(`${baseIso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const mode = process.argv.includes('--clean')
    ? 'clean'
    : process.argv.includes('--verify')
      ? 'verify'
      : 'seed'

  const env = loadLocalEnv()
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  assertLoopbackSupabase(supabaseUrl)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  if (mode === 'clean') {
    const { data: delAct } = await admin
      .from('acciones_diarias')
      .delete()
      .ilike('titulo_accion', `${DEMO_PREFIX}%`)
      .select('id')
    const { data: delDoc } = await admin
      .from('agent_documents')
      .delete()
      .ilike('title', `${DEMO_PREFIX}%`)
      .select('id')
    console.log(
      JSON.stringify({
        mode: 'clean',
        prefix: DEMO_PREFIX,
        deletedActions: delAct?.length ?? 0,
        deletedDocuments: delDoc?.length ?? 0,
      })
    )
    return
  }

  if (mode === 'seed') {
    // Limpiar versión previa del dataset demo para idempotencia exacta
    await admin.from('acciones_diarias').delete().ilike('titulo_accion', `${DEMO_PREFIX}%`)
    await admin.from('agent_documents').delete().ilike('title', `${DEMO_PREFIX}%`)

    const { data: users, error: uErr } = await admin
      .from('usuarios')
      .select('id,nombre,rol,area,activo')
      .eq('activo', true)
    if (uErr || !users?.length) throw new Error(`No hay usuarios sintéticos activos: ${uErr?.message}`)

    const findRole = (re) => users.find((u) => re.test(`${u.nombre} ${u.rol}`)) ?? users[0]
    const dir = findRole(/direcci[oó]n|super/i)
    const lider = findRole(/l[ií]der/i)
    const operativo = findRole(/operativo/i)
    const analista = findRole(/analista/i)

    const today = new Date().toISOString().slice(0, 10)

    const demoActions = [
      {
        titulo_accion: `${DEMO_PREFIX} Liberar validación fiscal de embarque cliente Monterrey`,
        descripcion_accion:
          'Pedido estratégico de $420k MXN detenido 36h por complemento Carta Porte pendiente de validación en Finanzas.',
        estado: 'Bloqueado',
        prioridad: 'P1_Alta',
        fecha: addDays(today, -1),
        hora_limite: '14:00:00',
        responsable: lider.id,
        area: 'Operaciones',
        evidencia_esperada: 'CFDI con Carta Porte timbrada y confirmación de salida en patio.',
        notas_escalamiento: 'Escalado a Dirección y Finanzas por exceder SLA de 24 horas.',
      },
      {
        titulo_accion: `${DEMO_PREFIX} Cerrar conciliación de entregas semanales ruta Bajío`,
        descripcion_accion:
          '14 guías pendientes de cierre de evidencia fotográfica que retrasan la facturación semanal.',
        estado: 'Retraso',
        prioridad: 'P1_Alta',
        fecha: addDays(today, -2),
        hora_limite: '17:00:00',
        responsable: operativo.id,
        area: 'Operaciones',
        evidencia_esperada: 'Reporte de 14 guías conciliadas en sistema sin diferencias.',
      },
      {
        titulo_accion: `${DEMO_PREFIX} Confirmar capacidad de flotilla para cierre de mes`,
        descripcion_accion:
          'Asegurar 3 unidades dedicadas adicionales para cubrir incremento de 22% en volumen de última semana.',
        estado: 'En_Ejecucion',
        prioridad: 'P1_Alta',
        fecha: addDays(today, 1),
        hora_limite: '16:00:00',
        responsable: lider.id,
        area: 'Operaciones',
        evidencia_esperada: 'Confirmación escrita de transportista aliado con placas y tarifa.',
      },
      {
        titulo_accion: `${DEMO_PREFIX} Estandarizar checklist de despacho nocturno`,
        descripcion_accion:
          'Reducir errores de carga en turno nocturno mediante verificación obligatoria antes de sellar unidad.',
        estado: 'En_Ejecucion',
        prioridad: 'P2_Media',
        fecha: addDays(today, 2),
        hora_limite: '18:00:00',
        responsable: operativo.id,
        area: 'Operaciones',
        evidencia_esperada: 'Checklist piloto firmado en 5 salidas consecutivas sin incidencias.',
      },
      {
        titulo_accion: `${DEMO_PREFIX} Auditar indicador OTIF y entregas fuera de ventana`,
        descripcion_accion:
          'Identificar las 3 principales causas de retraso por ruta para la junta directiva del viernes.',
        estado: 'Pendiente',
        prioridad: 'P2_Media',
        fecha: addDays(today, 3),
        hora_limite: '13:00:00',
        responsable: analista.id,
        area: 'OKRS',
        evidencia_esperada: 'Resumen ejecutivo con pareto de incidencias y propuesta correctiva.',
      },
      {
        titulo_accion: `${DEMO_PREFIX} Actualizar matriz de escalamiento operativo Q4`,
        descripcion_accion:
          'Definir responsables de respaldo y tiempos máximos de respuesta para bloqueos críticos.',
        estado: 'Hecho',
        prioridad: 'P2_Media',
        fecha: today,
        hora_limite: '12:00:00',
        responsable: lider.id,
        area: 'Operaciones',
        evidencia_esperada: 'Matriz publicada y validada por Dirección General.',
      },
    ]

    const { data: insertedActions, error: actErr } = await admin
      .from('acciones_diarias')
      .insert(demoActions)
      .select('id,titulo_accion,estado,prioridad')
    if (actErr) throw new Error(`Error insertando acciones demo: ${actErr.message}`)

    const doc1Body =
      'Empresa sintética Logística Norte Demo: Todo bloqueo operativo o fiscal con más de 24 horas sin resolución debe escalarse a Dirección General y Finanzas antes de las 14:00 del mismo día, asignando un responsable único y fecha compromiso verificable en SCRUMBAN.'
    const doc2Body =
      'Acuerdos confirmados (datos sintéticos): 1) Mantener OTIF arriba de 95 por ciento en rutas clave Monterrey y Bajío. 2) Cero embarques retenidos más de 24 horas por documentación fiscal. 3) Revisar semanalmente compromisos pendientes en sesión ejecutiva de 15 minutos.'

    const demoDocs = [
      {
        logical_id: 'demo-corp-politica-escalamiento',
        title: `${DEMO_PREFIX} Política oficial de escalamiento de bloqueos operativos`,
        body: doc1Body,
        version: 1,
        status: 'published',
        access_level: 'project_read',
        content_hash: sha256Hex(doc1Body),
        source_label: 'Política Operativa Demo (Sintética)',
        published_at: new Date().toISOString(),
      },
      {
        logical_id: 'demo-corp-acuerdos-junta-q4',
        title: `${DEMO_PREFIX} Acuerdos de junta directiva semanal — Prioridades Q4`,
        body: doc2Body,
        version: 1,
        status: 'published',
        access_level: 'project_read',
        content_hash: sha256Hex(doc2Body),
        source_label: 'Minuta Directiva Demo (Sintética)',
        published_at: new Date().toISOString(),
      },
    ]

    const { data: insertedDocs, error: docErr } = await admin
      .from('agent_documents')
      .insert(demoDocs)
      .select('id,logical_id,title')
    if (docErr) throw new Error(`Error insertando documentos demo: ${docErr.message}`)

    console.log(
      JSON.stringify(
        {
          mode: 'seed',
          company: 'Logística Norte Demo S.A. de C.V. (100% sintético)',
          prefix: DEMO_PREFIX,
          seededActions: insertedActions.length,
          seededDocuments: insertedDocs.length,
          actions: insertedActions.map((a) => ({ titulo: a.titulo_accion, estado: a.estado, prioridad: a.prioridad })),
        },
        null,
        2
      )
    )
    return
  }

  // mode === 'verify'
  const { data: demoActs } = await admin
    .from('acciones_diarias')
    .select('id,titulo_accion,estado,prioridad')
    .ilike('titulo_accion', `${DEMO_PREFIX}%`)
  const { data: demoDocs } = await admin
    .from('agent_documents')
    .select('id,title')
    .ilike('title', `${DEMO_PREFIX}%`)
  const { data: qaResidual } = await admin
    .from('acciones_diarias')
    .select('id')
    .or('titulo_accion.ilike.tc-qa-%,titulo_accion.ilike.p2%')

  console.log(
    JSON.stringify(
      {
        mode: 'verify',
        prefix: DEMO_PREFIX,
        demoActionsCount: demoActs?.length ?? 0,
        demoDocumentsCount: demoDocs?.length ?? 0,
        qaResidualActionsCount: qaResidual?.length ?? 0,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
