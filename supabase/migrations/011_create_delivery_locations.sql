-- Delivery Locations Migration
-- Creates delivery_locations table for managing delivery destinations
-- Admins can create and manage delivery locations with Google Maps integration

-- Create delivery_locations table
CREATE TABLE delivery_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    google_maps_link TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT delivery_locations_name_unique UNIQUE (name)
);

-- Create indexes for faster lookups
CREATE INDEX idx_delivery_locations_name ON delivery_locations(name);
CREATE INDEX idx_delivery_locations_is_active ON delivery_locations(is_active);
CREATE INDEX idx_delivery_locations_created_at ON delivery_locations(created_at);

-- Enable Row Level Security
ALTER TABLE delivery_locations ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read delivery locations (for package assignment)
CREATE POLICY "Authenticated users can view delivery locations"
    ON delivery_locations
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only admins can insert new delivery locations
CREATE POLICY "Admins can create delivery locations"
    ON delivery_locations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Policy: Only admins can update delivery locations
CREATE POLICY "Admins can update delivery locations"
    ON delivery_locations
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Policy: Only admins can delete delivery locations
CREATE POLICY "Admins can delete delivery locations"
    ON delivery_locations
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_delivery_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_delivery_locations_updated_at
    BEFORE UPDATE ON delivery_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_delivery_locations_updated_at();

-- Add comment to table
COMMENT ON TABLE delivery_locations IS 'Stores delivery location information with Google Maps integration';
