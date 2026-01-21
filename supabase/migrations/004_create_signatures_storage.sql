-- Migration: Create signatures storage bucket and policies
-- This bucket stores POD (Proof of Delivery) signatures as PNG images

-- IMPORTANT: Run this AFTER creating the bucket via Supabase Dashboard or the setup script
-- Dashboard: Storage > New Bucket > Name: "signatures" > Public: checked

-- Step 1: Create the storage bucket (must be done first)
-- This INSERT creates the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures',
  'signatures',
  true,
  1048576,  -- 1MB limit
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/png']::text[];

-- Step 2: Create storage policies for RLS

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can upload signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read signatures" ON storage.objects;
DROP POLICY IF EXISTS "Public can read signatures" ON storage.objects;

-- Allow authenticated users to upload signatures
CREATE POLICY "Authenticated users can upload signatures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signatures'
);

-- Allow public read access (since bucket is public)
CREATE POLICY "Public can read signatures"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'signatures'
);

-- Allow service role full access
-- This is default behavior for service role

-- Add signature_url column to packages table to store the signature reference
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS signature_url TEXT,
ADD COLUMN IF NOT EXISTS signature_path TEXT,
ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- Create index for signature queries
CREATE INDEX IF NOT EXISTS idx_packages_signed_at ON packages(signed_at);

COMMENT ON COLUMN packages.signature_url IS 'URL to the POD signature image in storage';
COMMENT ON COLUMN packages.signature_path IS 'Storage path of the signature file';
COMMENT ON COLUMN packages.signed_at IS 'Timestamp when the POD was signed';
