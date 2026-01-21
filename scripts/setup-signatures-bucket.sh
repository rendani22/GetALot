#!/bin/bash
# Script to create the signatures storage bucket in Supabase
# Run this if you get "Bucket not found" error

# You can run the SQL directly in the Supabase SQL Editor (Dashboard > SQL Editor):
# Copy and paste the following SQL:

cat << 'EOF'
============================================================
Run this SQL in Supabase Dashboard > SQL Editor:
============================================================

-- Create the signatures storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures',
  'signatures',
  true,
  1048576,
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/png']::text[];

-- Create upload policy for authenticated users
DROP POLICY IF EXISTS "Authenticated users can upload signatures" ON storage.objects;
CREATE POLICY "Authenticated users can upload signatures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'signatures');

-- Create public read policy
DROP POLICY IF EXISTS "Public can read signatures" ON storage.objects;
CREATE POLICY "Public can read signatures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'signatures');

============================================================
Alternative: Create via Dashboard UI
============================================================
1. Go to Supabase Dashboard > Storage
2. Click "New Bucket"
3. Name: signatures
4. Check "Public bucket"
5. Click "Create bucket"
6. Then run just the policy SQL above

EOF
