-- Add RLS policies for new transit statuses
-- This migration runs after 014_add_transit_statuses.sql
-- (Enum values must be committed before they can be used in policies)

-- Policy: Allow drivers to update package status to in_transit
DROP POLICY IF EXISTS "Drivers can pickup packages" ON packages;
CREATE POLICY "Drivers can pickup packages"
    ON packages
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'driver'
            AND is_active = true
        )
        AND status IN ('pending', 'notified')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'driver'
            AND is_active = true
        )
        AND status = 'in_transit'
    );

-- Policy: Allow collection staff to receive packages (mark as ready_for_collection)
DROP POLICY IF EXISTS "Collection staff can receive packages" ON packages;
CREATE POLICY "Collection staff can receive packages"
    ON packages
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'collection'
            AND is_active = true
        )
        AND status = 'in_transit'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'collection'
            AND is_active = true
        )
        AND status = 'ready_for_collection'
    );

-- Policy: Allow collection staff to view packages
DROP POLICY IF EXISTS "Collection staff can view packages" ON packages;
CREATE POLICY "Collection staff can view packages"
    ON packages
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'collection'
            AND is_active = true
        )
    );

-- Policy: Allow drivers to view packages
DROP POLICY IF EXISTS "Drivers can view packages" ON packages;
CREATE POLICY "Drivers can view packages"
    ON packages
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'driver'
            AND is_active = true
        )
    );
