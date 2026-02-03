-- Driver Location Tracking Migration
-- Creates driver_locations table to track real-time GPS positions of drivers
-- Used by admin to monitor drivers with packages in transit

-- Create driver_locations table
CREATE TABLE driver_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION, -- GPS accuracy in meters
    heading DOUBLE PRECISION, -- Direction of travel in degrees
    speed DOUBLE PRECISION, -- Speed in m/s
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure only one location record per driver
    CONSTRAINT driver_locations_driver_unique UNIQUE (driver_id)
);

-- Create indexes for faster lookups
CREATE INDEX idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX idx_driver_locations_user_id ON driver_locations(user_id);
CREATE INDEX idx_driver_locations_updated_at ON driver_locations(updated_at);

-- Enable Row Level Security
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

-- Policy: Drivers can insert/update their own location
CREATE POLICY "Drivers can upsert their own location"
    ON driver_locations
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Policy: Admins can read all driver locations
CREATE POLICY "Admins can read all driver locations"
    ON driver_locations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND is_active = true
        )
    );

-- Function to upsert driver location
CREATE OR REPLACE FUNCTION upsert_driver_location(
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION DEFAULT NULL,
    p_heading DOUBLE PRECISION DEFAULT NULL,
    p_speed DOUBLE PRECISION DEFAULT NULL
)
RETURNS driver_locations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_driver_id UUID;
    v_result driver_locations;
BEGIN
    -- Get the driver's profile ID
    SELECT id INTO v_driver_id
    FROM staff_profiles
    WHERE user_id = auth.uid()
    AND role = 'driver'
    AND is_active = true;

    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'User is not an active driver';
    END IF;

    -- Upsert the location
    INSERT INTO driver_locations (driver_id, user_id, latitude, longitude, accuracy, heading, speed, updated_at)
    VALUES (v_driver_id, auth.uid(), p_latitude, p_longitude, p_accuracy, p_heading, p_speed, NOW())
    ON CONFLICT (driver_id)
    DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        accuracy = EXCLUDED.accuracy,
        heading = EXCLUDED.heading,
        speed = EXCLUDED.speed,
        updated_at = NOW()
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION upsert_driver_location TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE driver_locations IS 'Tracks real-time GPS locations of drivers for admin monitoring';
COMMENT ON FUNCTION upsert_driver_location IS 'Allows drivers to update their current GPS location';
