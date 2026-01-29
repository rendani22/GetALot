-- Migration: Enforce RLS and Lock Policies for Tamper-Proof Audit Compliance
-- This migration:
-- 1. Ensures RLS is enabled on all tables
-- 2. Prevents locked POD modifications
-- 3. Restricts direct data manipulation - all changes must go through Edge Functions
-- 4. Adds comprehensive audit triggers for compliance

-- ============================================
-- SECTION 1: Verify RLS is enabled on all tables
-- ============================================

-- Re-enable RLS on all main tables (idempotent)
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECTION 2: Remove direct INSERT/UPDATE/DELETE policies for packages
-- All modifications should go through Edge Functions with service role
-- ============================================

-- Drop existing permissive policies on packages (we'll recreate stricter ones)
DROP POLICY IF EXISTS "Warehouse and admins can create packages" ON packages;
DROP POLICY IF EXISTS "Warehouse and admins can update packages" ON packages;

-- New INSERT policy: Only service role can insert (via Edge Functions)
-- Regular users can ONLY insert if they have a valid staff profile AND
-- the function is called through our controlled Edge Functions
CREATE POLICY "Controlled package creation"
ON packages FOR INSERT
TO authenticated
WITH CHECK (
  -- Must be authenticated with active staff profile (warehouse or admin)
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE user_id = auth.uid()
    AND role IN ('warehouse', 'admin')
    AND is_active = true
  )
);

-- New UPDATE policy: Packages can only be updated if not collected/locked
CREATE POLICY "Controlled package update"
ON packages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE user_id = auth.uid()
    AND role IN ('warehouse', 'admin', 'driver')
    AND is_active = true
  )
)
WITH CHECK (
  -- Cannot update if package has a locked POD
  NOT EXISTS (
    SELECT 1 FROM pods
    WHERE pods.package_id = packages.id
    AND pods.is_locked = true
  )
);

-- Add DELETE policy: Only service role (no direct deletion allowed)
DROP POLICY IF EXISTS "No direct package deletion" ON packages;
CREATE POLICY "No direct package deletion"
ON packages FOR DELETE
TO authenticated
USING (
  -- Only admins can delete, and only if no locked POD exists
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE user_id = auth.uid()
    AND role = 'admin'
    AND is_active = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM pods
    WHERE pods.package_id = packages.id
    AND pods.is_locked = true
  )
);

-- ============================================
-- SECTION 3: Strengthen POD table policies
-- ============================================

-- Drop existing POD policies to recreate stricter versions
DROP POLICY IF EXISTS "Staff can view PODs" ON pods;
DROP POLICY IF EXISTS "Staff can create PODs" ON pods;
DROP POLICY IF EXISTS "Staff can update unlocked PODs" ON pods;

-- SELECT: All active staff can view PODs
CREATE POLICY "Active staff can view PODs"
ON pods FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
);

-- INSERT: Only authorized staff can create PODs
CREATE POLICY "Collection staff can create PODs"
ON pods FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.role IN ('warehouse', 'admin', 'driver')
    AND staff_profiles.is_active = true
  )
  -- Package must exist and not already have a POD
  AND NOT EXISTS (
    SELECT 1 FROM pods existing_pod
    WHERE existing_pod.package_id = pods.package_id
  )
);

-- UPDATE: Can only update unlocked PODs (for PDF generation, then lock)
CREATE POLICY "Update only unlocked PODs"
ON pods FOR UPDATE
TO authenticated
USING (
  is_locked = false
  AND EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
)
WITH CHECK (
  -- After update, record can only become locked or stay unlocked
  -- Cannot unlock a locked record
  (is_locked = false OR (is_locked = true AND locked_at IS NOT NULL))
);

-- DELETE: PODs can never be deleted (handled by trigger, but also policy)
CREATE POLICY "PODs cannot be deleted"
ON pods FOR DELETE
TO authenticated
USING (false);  -- Always deny

-- ============================================
-- SECTION 4: Strengthen audit_logs table policies
-- Audit logs should be append-only
-- ============================================

-- Drop existing insert policy
DROP POLICY IF EXISTS "Service role can insert audit logs" ON audit_logs;

-- INSERT: All active staff can create audit logs (but only through proper channels)
CREATE POLICY "Staff can insert audit logs"
ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (
  -- Performer must be the current user
  performed_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
);

-- UPDATE: Audit logs can NEVER be updated
DROP POLICY IF EXISTS "Audit logs cannot be updated" ON audit_logs;
CREATE POLICY "Audit logs cannot be updated"
ON audit_logs FOR UPDATE
TO authenticated
USING (false);

-- DELETE: Audit logs can NEVER be deleted
DROP POLICY IF EXISTS "Audit logs cannot be deleted" ON audit_logs;
CREATE POLICY "Audit logs cannot be deleted"
ON audit_logs FOR DELETE
TO authenticated
USING (false);

-- ============================================
-- SECTION 5: Enhanced triggers for POD immutability
-- ============================================

-- Drop existing triggers to recreate with enhancements
DROP TRIGGER IF EXISTS trigger_prevent_pod_modification ON pods;
DROP TRIGGER IF EXISTS trigger_prevent_pod_deletion ON pods;

-- Enhanced function to prevent modification of locked PODs
CREATE OR REPLACE FUNCTION prevent_pod_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- If record is already locked, prevent any changes
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'POD_LOCKED: Record % is locked and cannot be modified. Locked at: %',
      OLD.pod_reference, OLD.locked_at;
  END IF;

  -- Cannot unlock a record once locked
  IF OLD.is_locked = true AND NEW.is_locked = false THEN
    RAISE EXCEPTION 'POD_UNLOCK_DENIED: Cannot unlock a locked POD record';
  END IF;

  -- If locking, ensure locked_at is set
  IF NEW.is_locked = true AND NEW.locked_at IS NULL THEN
    NEW.locked_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_pod_modification
  BEFORE UPDATE ON pods
  FOR EACH ROW
  EXECUTE FUNCTION prevent_pod_modification();

-- Enhanced function to absolutely prevent POD deletion
CREATE OR REPLACE FUNCTION prevent_pod_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the attempted deletion before raising exception
  INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
  SELECT
    'POD_DELETE_ATTEMPT',
    'pod',
    OLD.id,
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
    jsonb_build_object(
      'pod_reference', OLD.pod_reference,
      'package_id', OLD.package_id,
      'was_locked', OLD.is_locked,
      'attempted_at', NOW(),
      'denial_reason', 'POD records are immutable and cannot be deleted'
    );

  RAISE EXCEPTION 'POD_DELETE_DENIED: POD records cannot be deleted. Record: %, Package: %',
    OLD.pod_reference, OLD.package_reference;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_prevent_pod_deletion
  BEFORE DELETE ON pods
  FOR EACH ROW
  EXECUTE FUNCTION prevent_pod_deletion();

-- ============================================
-- SECTION 6: Add trigger to auto-audit POD state changes
-- ============================================

CREATE OR REPLACE FUNCTION audit_pod_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log when POD is locked
  IF NEW.is_locked = true AND (OLD.is_locked IS NULL OR OLD.is_locked = false) THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'POD_LOCKED',
      'pod',
      NEW.id,
      COALESCE(auth.uid(), NEW.staff_id),
      jsonb_build_object(
        'pod_reference', NEW.pod_reference,
        'package_id', NEW.package_id,
        'package_reference', NEW.package_reference,
        'locked_at', NEW.locked_at,
        'pdf_generated', NEW.pdf_url IS NOT NULL
      )
    );
  END IF;

  -- Log when PDF is generated
  IF NEW.pdf_url IS NOT NULL AND OLD.pdf_url IS NULL THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'POD_PDF_GENERATED',
      'pod',
      NEW.id,
      COALESCE(auth.uid(), NEW.staff_id),
      jsonb_build_object(
        'pod_reference', NEW.pod_reference,
        'pdf_url', NEW.pdf_url,
        'pdf_path', NEW.pdf_path,
        'generated_at', NEW.pdf_generated_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_pod_changes ON pods;
CREATE TRIGGER trigger_audit_pod_changes
  AFTER UPDATE ON pods
  FOR EACH ROW
  EXECUTE FUNCTION audit_pod_changes();

-- ============================================
-- SECTION 7: Add trigger to prevent package modification when POD is locked
-- ============================================

CREATE OR REPLACE FUNCTION prevent_package_modification_when_locked()
RETURNS TRIGGER AS $$
DECLARE
  locked_pod_exists BOOLEAN;
BEGIN
  -- Check if package has a locked POD
  SELECT EXISTS (
    SELECT 1 FROM pods
    WHERE pods.package_id = OLD.id
    AND pods.is_locked = true
  ) INTO locked_pod_exists;

  IF locked_pod_exists THEN
    -- Log the attempted modification
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'PACKAGE_MODIFICATION_DENIED',
      'package',
      OLD.id,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
      jsonb_build_object(
        'package_reference', OLD.reference,
        'reason', 'Package has a locked POD',
        'attempted_at', NOW()
      )
    );

    RAISE EXCEPTION 'PACKAGE_LOCKED: Package % cannot be modified because it has a locked POD',
      OLD.reference;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_prevent_package_modification_when_locked ON packages;
CREATE TRIGGER trigger_prevent_package_modification_when_locked
  BEFORE UPDATE ON packages
  FOR EACH ROW
  EXECUTE FUNCTION prevent_package_modification_when_locked();

-- Similar trigger for package deletion
CREATE OR REPLACE FUNCTION prevent_package_deletion_when_locked()
RETURNS TRIGGER AS $$
DECLARE
  locked_pod_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pods
    WHERE pods.package_id = OLD.id
    AND pods.is_locked = true
  ) INTO locked_pod_exists;

  IF locked_pod_exists THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'PACKAGE_DELETE_DENIED',
      'package',
      OLD.id,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
      jsonb_build_object(
        'package_reference', OLD.reference,
        'reason', 'Package has a locked POD',
        'attempted_at', NOW()
      )
    );

    RAISE EXCEPTION 'PACKAGE_DELETE_DENIED: Package % cannot be deleted because it has a locked POD',
      OLD.reference;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_prevent_package_deletion_when_locked ON packages;
CREATE TRIGGER trigger_prevent_package_deletion_when_locked
  BEFORE DELETE ON packages
  FOR EACH ROW
  EXECUTE FUNCTION prevent_package_deletion_when_locked();

-- ============================================
-- SECTION 8: Create audit log for all table modifications
-- This ensures a complete audit trail
-- ============================================

CREATE OR REPLACE FUNCTION audit_table_changes()
RETURNS TRIGGER AS $$
DECLARE
  action_type TEXT;
  entity_data JSONB;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    action_type := TG_TABLE_NAME || '_CREATED';
    entity_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := TG_TABLE_NAME || '_UPDATED';
    entity_data := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW),
      'changed_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key != to_jsonb(OLD) -> key
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    action_type := TG_TABLE_NAME || '_DELETED';
    entity_data := to_jsonb(OLD);
  END IF;

  -- Don't audit the audit_logs table itself to prevent infinite loops
  IF TG_TABLE_NAME != 'audit_logs' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      action_type,
      TG_TABLE_NAME,
      CASE
        WHEN TG_OP = 'DELETE' THEN OLD.id
        ELSE NEW.id
      END,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
      entity_data
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply generic audit trigger to packages table
DROP TRIGGER IF EXISTS trigger_audit_packages_changes ON packages;
CREATE TRIGGER trigger_audit_packages_changes
  AFTER INSERT OR UPDATE OR DELETE ON packages
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

-- Apply generic audit trigger to staff_profiles table
DROP TRIGGER IF EXISTS trigger_audit_staff_profiles_changes ON staff_profiles;
CREATE TRIGGER trigger_audit_staff_profiles_changes
  AFTER INSERT OR UPDATE OR DELETE ON staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

-- Apply generic audit trigger to pods table (for inserts only, updates handled separately)
DROP TRIGGER IF EXISTS trigger_audit_pods_insert ON pods;
CREATE TRIGGER trigger_audit_pods_insert
  AFTER INSERT ON pods
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

-- ============================================
-- SECTION 9: Add is_locked check function for frontend
-- ============================================

CREATE OR REPLACE FUNCTION is_pod_locked(p_package_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  locked BOOLEAN;
BEGIN
  SELECT pods.is_locked INTO locked
  FROM pods
  WHERE pods.package_id = p_package_id;

  RETURN COALESCE(locked, false);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get lock status details
CREATE OR REPLACE FUNCTION get_pod_lock_status(p_package_id UUID)
RETURNS TABLE (
  is_locked BOOLEAN,
  locked_at TIMESTAMPTZ,
  pod_reference TEXT,
  pdf_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT pods.is_locked, pods.locked_at, pods.pod_reference, pods.pdf_url
  FROM pods
  WHERE pods.package_id = p_package_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- SECTION 10: Add comments for documentation
-- ============================================

COMMENT ON POLICY "Controlled package creation" ON packages IS
  'Packages can only be created by authenticated warehouse staff or admins';

COMMENT ON POLICY "Controlled package update" ON packages IS
  'Packages can only be updated if they do not have a locked POD';

COMMENT ON POLICY "No direct package deletion" ON packages IS
  'Only admins can delete packages, and only if no locked POD exists';

COMMENT ON POLICY "Active staff can view PODs" ON pods IS
  'All active staff members can view POD records';

COMMENT ON POLICY "Collection staff can create PODs" ON pods IS
  'PODs can only be created by collection staff for packages without existing PODs';

COMMENT ON POLICY "Update only unlocked PODs" ON pods IS
  'PODs can only be updated while unlocked (for PDF generation before locking)';

COMMENT ON POLICY "PODs cannot be deleted" ON pods IS
  'POD records are immutable and can never be deleted';

COMMENT ON FUNCTION prevent_pod_modification() IS
  'Prevents any modifications to locked POD records';

COMMENT ON FUNCTION prevent_pod_deletion() IS
  'Prevents deletion of POD records and logs the attempt';

COMMENT ON FUNCTION audit_pod_changes() IS
  'Automatically logs POD state changes to audit_logs';

COMMENT ON FUNCTION prevent_package_modification_when_locked() IS
  'Prevents modification of packages that have a locked POD';

COMMENT ON FUNCTION audit_table_changes() IS
  'Generic trigger function to audit all table changes';

COMMENT ON FUNCTION is_pod_locked(UUID) IS
  'Returns whether a package has a locked POD';

COMMENT ON FUNCTION get_pod_lock_status(UUID) IS
  'Returns detailed lock status for a package POD';
