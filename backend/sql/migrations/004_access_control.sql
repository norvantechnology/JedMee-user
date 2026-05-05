-- 004_access_control.sql
-- User-defined roles + permissions + membership (account scoped)

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique role name within an account (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_account_name_key ON user_roles (account_id, lower(name));

CREATE TABLE IF NOT EXISTS user_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES user_roles(id) ON DELETE CASCADE,
  resource text NOT NULL,
  can_add boolean NOT NULL DEFAULT false,
  can_view boolean NOT NULL DEFAULT true,
  can_update boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_role_permissions_role_resource_key ON user_role_permissions (role_id, resource);

-- One active role per user (user_id PK)
CREATE TABLE IF NOT EXISTS user_role_members (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES user_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_role_members_role_id_idx ON user_role_members (role_id);

