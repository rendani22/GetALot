-- Add new package statuses for multi-stage delivery flow
-- - in_transit: Driver has picked up package and is en route to collection point
-- - ready_for_collection: Package arrived at collection point, receiver can pick up
--
-- NOTE: This migration only adds enum values and columns.
-- Policies using these new enum values are in 015_add_transit_policies.sql
-- (PostgreSQL requires enum values to be committed before use)

-- Add new values to package_status enum
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'in_transit' AFTER 'notified';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'ready_for_collection' AFTER 'in_transit';

-- Add new staff role for collection point staff
DO $$
BEGIN
    -- Check if 'collection' role exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'collection'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'staff_role')
    ) THEN
        ALTER TYPE staff_role ADD VALUE 'collection';
    END IF;
END $$;

-- Add column to track driver who picked up the package
ALTER TABLE packages ADD COLUMN IF NOT EXISTS picked_up_by UUID REFERENCES auth.users(id);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;

-- Add column to track collection point staff who received the package
ALTER TABLE packages ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES auth.users(id);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_packages_picked_up_by ON packages(picked_up_by);
CREATE INDEX IF NOT EXISTS idx_packages_received_by ON packages(received_by);


-- Comment on new columns
COMMENT ON COLUMN packages.picked_up_by IS 'Driver user_id who picked up the package for delivery';
COMMENT ON COLUMN packages.picked_up_at IS 'Timestamp when driver picked up the package';
COMMENT ON COLUMN packages.received_by IS 'Collection point staff user_id who received the package';
COMMENT ON COLUMN packages.received_at IS 'Timestamp when package was received at collection point';
