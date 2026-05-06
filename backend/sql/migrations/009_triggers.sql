-- 009_triggers.sql
-- updated_at helper + triggers + account_id defaulting

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Default account_id to id for owner users (account == owner user)
CREATE OR REPLACE FUNCTION set_default_account_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    NEW.account_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_users_default_account_id ON app_users;
CREATE TRIGGER trg_app_users_default_account_id
BEFORE INSERT ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_default_account_id();

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;
CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_roles_updated_at ON user_roles;
CREATE TRIGGER trg_user_roles_updated_at
BEFORE UPDATE ON user_roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_role_permissions_updated_at ON user_role_permissions;
CREATE TRIGGER trg_user_role_permissions_updated_at
BEFORE UPDATE ON user_role_permissions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at
BEFORE UPDATE ON vendors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

