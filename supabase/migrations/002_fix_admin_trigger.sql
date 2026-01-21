-- Fix: Update trigger to not conflict with edge function staff creation
-- The original trigger was causing issues when admin creates users via edge function

-- Drop the old trigger
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;

-- Update the function to be smarter about when to create profiles
-- It should only auto-create a profile if no staff profiles exist (bootstrap case)
-- AND if a profile doesn't already exist for this user
CREATE OR REPLACE FUNCTION create_initial_admin_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- Only auto-create admin profile if:
    -- 1. No admin exists (bootstrap scenario)
    -- 2. No profile exists for this user yet
    IF NOT EXISTS (SELECT 1 FROM staff_profiles WHERE role = 'admin')
       AND NOT EXISTS (SELECT 1 FROM staff_profiles WHERE user_id = NEW.id) THEN
        INSERT INTO staff_profiles (user_id, email, full_name, role)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Admin'), 'admin');
    END IF;
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Profile already exists, ignore
        RETURN NEW;
    WHEN OTHERS THEN
        -- Log but don't fail user creation
        RAISE WARNING 'Could not auto-create admin profile: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created_admin
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_initial_admin_profile();

-- Also grant the function permission to bypass RLS
ALTER FUNCTION create_initial_admin_profile() SET search_path = public;
