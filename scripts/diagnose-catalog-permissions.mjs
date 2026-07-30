/**
 * Diagnostica por qué un usuario no puede escribir en catálogos (p. ej. desactivar estatus).
 *
 * Revisa, para un auth.users.id dado:
 *   - Fila en usuarios (activo, rol) y cómo la normaliza la BD.
 *   - app_role en user_roles.
 *   - Roles de catálogo asignados (usuario_catalog_roles + catalog_roles).
 *   - Si las funciones de permisos existen en la BD (migraciones aplicadas).
 *
 * Requiere en .env: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   node scripts/diagnose-catalog-permissions.mjs <auth_user_id>
 */

import { loadDotenv } from './_load-dotenv.mjs'
import { configureNodeTls } from './_configure-node-tls.mjs'

loadDotenv(import.meta.url)

const argv = process.argv.slice(2)
configureNodeTls(argv)

const { createClient } = await import('@supabase/supabase-js')

const authUserId = argv.find((a) => !a.startsWith('--'))
if (!authUserId) {
  console.error('Falta el auth.users.id. Uso: node scripts/diagnose-catalog-permissions.mjs <auth_user_id>')
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

console.log(`Proyecto: ${url}`)
console.log(`auth.users.id: ${authUserId}\n`)

const { data: usuario, error: usuarioError } = await supabase
  .from('usuarios')
  .select('id,user_id,nombre,rol,activo')
  .eq('user_id', authUserId)
  .maybeSingle()

if (usuarioError) console.error('Error leyendo usuarios:', usuarioError.message)
console.log('usuarios:', usuario ?? '(sin fila para ese user_id)')

if (usuario) {
  const { data: normalized, error: normError } = await supabase.rpc('normalize_business_role', {
    p_role: usuario.rol,
  })
  if (normError) {
    console.log(`normalize_business_role: NO DISPONIBLE (${normError.message})`)
  } else {
    console.log(`normalize_business_role('${usuario.rol}') = '${normalized}'  → super_admin? ${normalized === 'super_admin'}`)
  }
}

const { data: appRoles, error: appRoleError } = await supabase
  .from('user_roles')
  .select('app_role')
  .eq('user_id', authUserId)

if (appRoleError) console.error('Error leyendo user_roles:', appRoleError.message)
console.log('user_roles.app_role:', appRoles?.map((r) => r.app_role) ?? [])

if (usuario) {
  const { data: catalogRoles, error: catalogRolesError } = await supabase
    .from('usuario_catalog_roles')
    .select('is_primary, catalog_roles(nombre, system_key, activo)')
    .eq('user_id', usuario.id)

  if (catalogRolesError) console.error('Error leyendo usuario_catalog_roles:', catalogRolesError.message)
  console.log('roles de catálogo:', JSON.stringify(catalogRoles ?? [], null, 2))
}

console.log('\nFunciones de permisos en la BD:')
for (const fn of ['is_current_user_super_admin', 'can_manage_catalogs', 'is_super_admin', 'is_app_admin']) {
  const { error } = await supabase.rpc(fn)
  // Con service_role auth.uid() es null: false es la respuesta esperada.
  // Solo interesa distinguir "existe" de "no existe" (PGRST202).
  if (error && (error.code === 'PGRST202' || /could not find/i.test(error.message))) {
    console.log(`  ${fn}: NO EXISTE  → falta aplicar la migración`)
  } else if (error) {
    console.log(`  ${fn}: error (${error.code ?? '?'}) ${error.message}`)
  } else {
    console.log(`  ${fn}: existe`)
  }
}
