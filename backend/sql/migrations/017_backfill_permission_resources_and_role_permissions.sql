-- 017_backfill_permission_resources_and_role_permissions.sql
-- Backfill missing permission resources and default permissions rows for existing roles.

-- Ensure newer resources exist in registry (safe to run multiple times)
INSERT INTO permission_resources(resource)
VALUES ('PRODUCT_BATCHES'), ('MFG_COMPANIES')
ON CONFLICT (resource) DO NOTHING;

-- For every existing role, ensure there is a permissions row for every resource in the registry.
-- Default policy: view-only (view=true, add/update/delete=false)
INSERT INTO user_role_permissions (role_id, resource, can_add, can_view, can_update, can_delete)
SELECT r.id, pr.resource, false, true, false, false
FROM user_roles r
CROSS JOIN permission_resources pr
WHERE NOT EXISTS (
  SELECT 1
  FROM user_role_permissions p
  WHERE p.role_id = r.id AND p.resource = pr.resource
);

