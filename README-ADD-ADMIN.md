# Adding Admin Users & Fixing Staff Creation

## Issue: "Database error creating new user"

If you're getting this error when trying to create staff via the edge function:

```json
{
    "error": "Failed to create user: Database error creating new user",
    "code": 500,
    "hint": "Check that SUPABASE_SERVICE_ROLE_KEY is set correctly in Edge Function secrets"
}
```

### Root Cause

The `on_auth_user_created_admin` trigger fires when new users are created and tries to insert into `staff_profiles`. This conflicts with the edge function which also tries to create a profile.

### Fix

Run migration `002_fix_admin_trigger.sql` or execute this SQL in your Supabase SQL Editor:

```sql
-- Drop the old trigger
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;

-- Update the function to handle edge cases
CREATE OR REPLACE FUNCTION create_initial_admin_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- Only auto-create admin profile for bootstrap (no admins exist)
    -- AND no profile exists for this user yet
    IF NOT EXISTS (SELECT 1 FROM staff_profiles WHERE role = 'admin')
       AND NOT EXISTS (SELECT 1 FROM staff_profiles WHERE user_id = NEW.id) THEN
        INSERT INTO staff_profiles (user_id, email, full_name, role)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Admin'), 'admin');
    END IF;
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        RETURN NEW;
    WHEN OTHERS THEN
        RAISE WARNING 'Could not auto-create admin profile: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created_admin
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_initial_admin_profile();
```

### Ensure Edge Function Secrets Are Set

Also verify these secrets are set in your Supabase project:

1. Go to **Project Settings** → **Edge Functions**
2. Ensure these secrets exist:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

You can set them via CLI:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
