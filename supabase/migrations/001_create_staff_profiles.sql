-- Staff Profiles Migration
-- Creates staff_profiles table linked to Supabase Auth users
-- Includes role-based access control (warehouse, driver, admin)

-- Create enum for staff roles
CREATE TYPE staff_role AS ENUM ('warehouse', 'driver', 'admin');

-- Create staff_profiles table
CREATE TABLE staff_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role staff_role NOT NULL DEFAULT 'warehouse',
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT staff_profiles_email_unique UNIQUE (email)
);

-- Create index for faster lookups
CREATE INDEX idx_staff_profiles_user_id ON staff_profiles(user_id);
CREATE INDEX idx_staff_profiles_role ON staff_profiles(role);
CREATE INDEX idx_staff_profiles_is_active ON staff_profiles(is_active);

-- Enable Row Level Security
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read staff profiles (for assignment lookups)
CREATE POLICY "Authenticated users can view staff profiles"
    ON staff_profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only admins can insert new staff profiles
CREATE POLICY "Admins can create staff profiles"
    ON staff_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Policy: Only admins can update staff profiles
CREATE POLICY "Admins can update staff profiles"
    ON staff_profiles
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

-- Policy: Only admins can delete staff profiles
CREATE POLICY "Admins can delete staff profiles"
    ON staff_profiles
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_staff_profiles_updated_at
    BEFORE UPDATE ON staff_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to create staff profile when first admin is created (bootstrap)
-- This allows the first user to become an admin
CREATE OR REPLACE FUNCTION create_initial_admin_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if this is the first user and no admin exists
    IF NOT EXISTS (SELECT 1 FROM staff_profiles WHERE role = 'admin') THEN
        INSERT INTO staff_profiles (user_id, email, full_name, role)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Admin'), 'admin');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create admin profile for first user
CREATE TRIGGER on_auth_user_created_admin
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_initial_admin_profile();

-- Comment on table
COMMENT ON TABLE staff_profiles IS 'Staff profiles linked to Supabase Auth users with role-based access';
COMMENT ON COLUMN staff_profiles.role IS 'Staff role: warehouse (inventory), driver (deliveries), admin (full access)';
