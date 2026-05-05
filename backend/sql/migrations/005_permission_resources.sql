-- 005_permission_resources.sql
-- Permission resources registry (avoid CHECK constraint rewrites)

CREATE TABLE IF NOT EXISTS permission_resources (
  resource text PRIMARY KEY
);

-- Seed core resources
INSERT INTO permission_resources(resource)
VALUES ('USERS'), ('ROLES'), ('VENDORS')
ON CONFLICT (resource) DO NOTHING;

-- Enforce FK from permissions table
ALTER TABLE user_role_permissions
  DROP CONSTRAINT IF EXISTS user_role_permissions_resource_check;

ALTER TABLE user_role_permissions
  DROP CONSTRAINT IF EXISTS user_role_permissions_resource_fk;

ALTER TABLE user_role_permissions
  ADD CONSTRAINT user_role_permissions_resource_fk
  FOREIGN KEY (resource) REFERENCES permission_resources(resource);

