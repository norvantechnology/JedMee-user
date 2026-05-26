-- 068_sales_invoices_delete_by_user.sql
-- Purpose:
--   Add deleted_by_user_id to sales_invoices so the DELETE /sales-invoices/:id
--   handler can record which user performed the soft-delete, consistent with
--   the purchase_invoices table.

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;