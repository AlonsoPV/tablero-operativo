-- Kanban por Equipos: el subarbol que inicia en un rol Lider puede asignarse
-- en cualquier direccion dentro del mismo grupo.

INSERT INTO public.catalog_role_modules (role_id, module_key)
SELECT role.id, 'team_kanban'
FROM public.catalog_roles role
WHERE role.activo = true
  AND public.normalize_business_role(role.nombre) = public.normalize_business_role('Lider')
  AND EXISTS (
    SELECT 1
    FROM public.app_modules module
    WHERE module.key = 'team_kanban'
      AND module.activo = true
  )
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.team_kanban_can_enter()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.team_kanban_is_super_admin()
    OR public.team_kanban_current_user_has_module('team_kanban')
    OR EXISTS (
      WITH RECURSIVE lineage AS (
        SELECT user_profile.id, user_profile.manager_user_id, user_profile.rol
        FROM public.usuarios user_profile
        WHERE user_profile.user_id = (SELECT auth.uid())
          AND user_profile.activo = true

        UNION

        SELECT manager.id, manager.manager_user_id, manager.rol
        FROM lineage member
        JOIN public.usuarios manager ON manager.id = member.manager_user_id
        WHERE manager.activo = true
      )
      SELECT 1
      FROM lineage member
      WHERE public.normalize_business_role(member.rol::text) IN (
        public.normalize_business_role('Analista'),
        public.normalize_business_role('Lider')
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_assignable_users(
  p_actor_id uuid,
  p_area_id uuid
)
RETURNS TABLE (usuario_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE scoped_users AS MATERIALIZED (
    SELECT
      user_profile.id,
      user_profile.manager_user_id,
      user_profile.rol
    FROM public.team_kanban_area_scope_users(p_area_id) scoped
    JOIN public.usuarios user_profile ON user_profile.id = scoped.usuario_id
    WHERE user_profile.activo = true
      AND NOT public.team_kanban_user_is_super_admin(user_profile.id)
  ),
  leader_candidates AS (
    SELECT scoped.id
    FROM scoped_users scoped
    WHERE public.normalize_business_role(scoped.rol::text) =
      public.normalize_business_role('Lider')
  ),
  leader_tree AS (
    SELECT leader.id AS root_id, leader.id AS member_id
    FROM leader_candidates leader

    UNION

    SELECT tree.root_id, report.id
    FROM leader_tree tree
    JOIN public.usuarios report ON report.manager_user_id = tree.member_id
    WHERE report.activo = true
  ),
  root_leaders AS (
    SELECT leader.id
    FROM leader_candidates leader
    WHERE NOT EXISTS (
      SELECT 1
      FROM leader_candidates possible_ancestor
      JOIN leader_tree ancestor_tree
        ON ancestor_tree.root_id = possible_ancestor.id
       AND ancestor_tree.member_id = leader.id
      WHERE possible_ancestor.id <> leader.id
    )
  ),
  group_members AS (
    SELECT tree.root_id, tree.member_id
    FROM leader_tree tree
    JOIN root_leaders root ON root.id = tree.root_id
    JOIN scoped_users scoped ON scoped.id = tree.member_id
  ),
  actor_groups AS (
    SELECT member.root_id
    FROM group_members member
    WHERE member.member_id = p_actor_id
  ),
  permissions AS (
    SELECT
      public.team_kanban_user_is_super_admin(p_actor_id) AS is_global_admin,
      EXISTS (
        SELECT 1
        FROM public.area_lideres area_leader
        WHERE area_leader.area_id = p_area_id
          AND area_leader.user_id = p_actor_id
      ) AS is_area_leader
  )
  SELECT scoped.id
  FROM scoped_users scoped
  CROSS JOIN permissions permission
  WHERE permission.is_global_admin
    OR permission.is_area_leader
    OR EXISTS (
      SELECT 1
      FROM actor_groups actor_group
      JOIN group_members member ON member.root_id = actor_group.root_id
      WHERE member.member_id = scoped.id
    );
$$;

REVOKE ALL ON FUNCTION public.team_kanban_can_enter()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_assignable_users(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.team_kanban_assignable_users(uuid, uuid) IS
  'Subarbol con raiz Lider: todos sus integrantes pueden asignarse hacia arriba, abajo y horizontalmente dentro del grupo.';

NOTIFY pgrst, 'reload schema';
