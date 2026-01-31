-- Add RLS policy to allow collection staff to complete package collections
-- This allows collection staff to update packages to collected status

-- Policy: Allow collection staff to complete collection (mark as collected)
DROP POLICY IF EXISTS "Collection staff can complete collection" ON packages;
CREATE POLICY "Collection staff can complete collection"
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
        AND status IN ('pending', 'notified', 'ready_for_collection')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'collection'
            AND is_active = true
        )
        AND status = 'collected'
    );

COMMENT ON POLICY "Collection staff can complete collection" ON packages IS
'Allows collection point staff to mark packages as collected when receiver picks up the package';
