-- Migration: Update audit_logs RLS policies for broader access
-- Allow all active staff to view audit logs (not just admins)
-- This enables the audit timeline feature on package detail pages

-- Drop existing admin-only policy
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;

-- Create new policy allowing all active staff to view audit logs
CREATE POLICY "Staff can view audit logs"
ON audit_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
);

-- Create index for faster metadata searches
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_reference
ON audit_logs USING gin ((metadata->'reference'));

-- Create index for entity_id + entity_type composite queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
ON audit_logs (entity_id, entity_type);

-- Add comment
COMMENT ON POLICY "Staff can view audit logs" ON audit_logs IS
  'All active staff members can view audit logs for compliance and tracking purposes';
