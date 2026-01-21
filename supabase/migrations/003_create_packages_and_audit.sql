-- Packages and Audit Logs Migration
-- Creates packages table for tracking incoming packages
-- Creates audit_logs table for system-wide audit trail

-- Create enum for package status
CREATE TYPE package_status AS ENUM ('pending', 'notified', 'collected', 'returned');

-- Create packages table
CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL UNIQUE,
    receiver_email TEXT NOT NULL,
    notes TEXT,
    status package_status NOT NULL DEFAULT 'pending',
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    collected_at TIMESTAMPTZ,
    collected_by UUID REFERENCES auth.users(id)
);

-- Create indexes for common queries
CREATE INDEX idx_packages_reference ON packages(reference);
CREATE INDEX idx_packages_receiver_email ON packages(receiver_email);
CREATE INDEX idx_packages_status ON packages(status);
CREATE INDEX idx_packages_created_by ON packages(created_by);
CREATE INDEX idx_packages_created_at ON packages(created_at DESC);

-- Enable Row Level Security
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view all packages
CREATE POLICY "Authenticated users can view packages"
    ON packages
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Warehouse staff and admins can create packages
CREATE POLICY "Warehouse and admins can create packages"
    ON packages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role IN ('warehouse', 'admin')
            AND is_active = true
        )
    );

-- Policy: Warehouse staff and admins can update packages
CREATE POLICY "Warehouse and admins can update packages"
    ON packages
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role IN ('warehouse', 'admin')
            AND is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role IN ('warehouse', 'admin')
            AND is_active = true
        )
    );

-- ============================================
-- Audit Logs Table
-- ============================================

-- Create audit_logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    performed_by UUID NOT NULL REFERENCES auth.users(id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for audit queries
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all audit logs
CREATE POLICY "Admins can view audit logs"
    ON audit_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Policy: System (service role) can insert audit logs
-- In practice, audit logs are inserted via Edge Functions using service role
CREATE POLICY "Service role can insert audit logs"
    ON audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ============================================
-- Function to generate unique package reference
-- Format: PKG-YYYYMMDD-XXXX (date + 4 alphanumeric chars)
-- ============================================

CREATE OR REPLACE FUNCTION generate_package_reference()
RETURNS TEXT AS $$
DECLARE
    date_part TEXT;
    random_part TEXT;
    new_reference TEXT;
    reference_exists BOOLEAN;
BEGIN
    date_part := TO_CHAR(NOW(), 'YYYYMMDD');

    LOOP
        -- Generate 4 random alphanumeric characters
        random_part := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
        new_reference := 'PKG-' || date_part || '-' || random_part;

        -- Check if reference already exists
        SELECT EXISTS(SELECT 1 FROM packages WHERE reference = new_reference) INTO reference_exists;

        EXIT WHEN NOT reference_exists;
    END LOOP;

    RETURN new_reference;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate package reference on insert
CREATE OR REPLACE FUNCTION set_package_reference()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.reference IS NULL OR NEW.reference = '' THEN
        NEW.reference := generate_package_reference();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_package_reference
    BEFORE INSERT ON packages
    FOR EACH ROW
    EXECUTE FUNCTION set_package_reference();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_packages_updated_at
    BEFORE UPDATE ON packages
    FOR EACH ROW
    EXECUTE FUNCTION update_packages_updated_at();
