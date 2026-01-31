-- Package Items Migration
-- Creates package_items table for tracking items within packages

-- Create package_items table
CREATE TABLE package_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX idx_package_items_package_id ON package_items(package_id);

-- Enable Row Level Security
ALTER TABLE package_items ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view package items (same as packages)
CREATE POLICY "Authenticated users can view package items"
    ON package_items
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Warehouse staff and admins can create package items
CREATE POLICY "Warehouse and admins can create package items"
    ON package_items
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

-- Policy: Warehouse staff and admins can update package items
CREATE POLICY "Warehouse and admins can update package items"
    ON package_items
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

-- Policy: Admins can delete package items
CREATE POLICY "Admins can delete package items"
    ON package_items
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND is_active = true
        )
    );

-- Add comment to table
COMMENT ON TABLE package_items IS 'Items contained within a package, with quantity and description';
