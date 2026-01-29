 -- Receiver Profiles Migration
-- Creates receiver_profiles table for package receivers
-- These are employees who can collect packages

-- Create receiver_profiles table
CREATE TABLE receiver_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    employee_number TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT receiver_profiles_employee_number_unique UNIQUE (employee_number),
    CONSTRAINT receiver_profiles_email_unique UNIQUE (email)
);

-- Create indexes for faster lookups
CREATE INDEX idx_receiver_profiles_employee_number ON receiver_profiles(employee_number);
CREATE INDEX idx_receiver_profiles_email ON receiver_profiles(email);
CREATE INDEX idx_receiver_profiles_is_active ON receiver_profiles(is_active);
CREATE INDEX idx_receiver_profiles_surname ON receiver_profiles(surname);
CREATE INDEX idx_receiver_profiles_name ON receiver_profiles(name);

-- Enable Row Level Security
ALTER TABLE receiver_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read receiver profiles (for package assignment)
CREATE POLICY "Authenticated users can view receiver profiles"
    ON receiver_profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only admins can insert new receiver profiles
CREATE POLICY "Admins can create receiver profiles"
    ON receiver_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Policy: Only admins can update receiver profiles
CREATE POLICY "Admins can update receiver profiles"
    ON receiver_profiles
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

-- Policy: Only admins can delete receiver profiles
CREATE POLICY "Admins can delete receiver profiles"
    ON receiver_profiles
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff_profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Trigger to auto-update updated_at (reusing existing function)
CREATE TRIGGER update_receiver_profiles_updated_at
    BEFORE UPDATE ON receiver_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE receiver_profiles IS 'Stores receiver/employee profiles who can collect packages';
COMMENT ON COLUMN receiver_profiles.employee_number IS 'Unique employee identifier';
COMMENT ON COLUMN receiver_profiles.phone IS 'Optional contact phone number';
