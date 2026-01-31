-- Migration: Fix audit_logs performed_by foreign key constraint
-- Ensures performed_by references auth.users(id) not staff_profiles(id)

-- First, drop the existing constraint if it exists
ALTER TABLE audit_logs
DROP CONSTRAINT IF EXISTS audit_logs_performed_by_fkey;

-- Re-add the correct constraint to auth.users
ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_performed_by_fkey
FOREIGN KEY (performed_by) REFERENCES auth.users(id);

-- Add comment to clarify the relationship
COMMENT ON COLUMN audit_logs.performed_by IS 'References auth.users(id) - the authenticated user who performed the action';
