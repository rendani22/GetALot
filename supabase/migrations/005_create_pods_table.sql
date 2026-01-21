-- Migration: Create POD (Proof of Delivery) table and related structures
-- POD records are immutable once completed and locked

-- Create sequence for POD reference numbers (POD-YYYY-NNNN format)
CREATE SEQUENCE IF NOT EXISTS pod_reference_seq START 1;

-- Function to generate POD reference
CREATE OR REPLACE FUNCTION generate_pod_reference()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  seq_part TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  seq_part := LPAD(nextval('pod_reference_seq')::TEXT, 4, '0');
  RETURN 'POD-' || year_part || '-' || seq_part;
END;
$$ LANGUAGE plpgsql;

-- Create POD table
CREATE TABLE IF NOT EXISTS pods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_reference TEXT UNIQUE NOT NULL DEFAULT generate_pod_reference(),

  -- Package reference
  package_id UUID NOT NULL REFERENCES packages(id),
  package_reference TEXT NOT NULL,
  receiver_email TEXT NOT NULL,

  -- Staff who processed the collection
  staff_id UUID NOT NULL REFERENCES staff_profiles(id),
  staff_name TEXT NOT NULL,
  staff_email TEXT NOT NULL,

  -- Signature info
  signature_url TEXT NOT NULL,
  signature_path TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,

  -- Completion
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- PDF storage
  pdf_url TEXT,
  pdf_path TEXT,
  pdf_generated_at TIMESTAMPTZ,

  -- Immutability flag - once locked, record cannot be modified
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,

  -- Constraints
  CONSTRAINT unique_package_pod UNIQUE (package_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pods_package_id ON pods(package_id);
CREATE INDEX IF NOT EXISTS idx_pods_staff_id ON pods(staff_id);
CREATE INDEX IF NOT EXISTS idx_pods_completed_at ON pods(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pods_pod_reference ON pods(pod_reference);

-- Enable RLS
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Staff can view all PODs
CREATE POLICY "Staff can view PODs"
ON pods FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
);

-- Staff can create PODs
CREATE POLICY "Staff can create PODs"
ON pods FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
);

-- Only allow updates to unlocked PODs (for PDF generation)
CREATE POLICY "Staff can update unlocked PODs"
ON pods FOR UPDATE
TO authenticated
USING (
  is_locked = false
  AND EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
);

-- Trigger to prevent updates on locked PODs
CREATE OR REPLACE FUNCTION prevent_pod_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'POD record is locked and cannot be modified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_pod_modification ON pods;
CREATE TRIGGER trigger_prevent_pod_modification
  BEFORE UPDATE ON pods
  FOR EACH ROW
  EXECUTE FUNCTION prevent_pod_modification();

-- Trigger to prevent deletion of PODs
CREATE OR REPLACE FUNCTION prevent_pod_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'POD records cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_pod_deletion ON pods;
CREATE TRIGGER trigger_prevent_pod_deletion
  BEFORE DELETE ON pods
  FOR EACH ROW
  EXECUTE FUNCTION prevent_pod_deletion();

-- Add pod_id reference to packages table
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS pod_id UUID REFERENCES pods(id);

-- Create storage bucket for POD PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pod-documents',
  'pod-documents',
  true,
  5242880,  -- 5MB limit for PDFs
  ARRAY['application/pdf', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf', 'image/png']::text[];

-- Storage policies for POD documents
DROP POLICY IF EXISTS "Staff can upload POD documents" ON storage.objects;
CREATE POLICY "Staff can upload POD documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pod-documents'
  AND EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE staff_profiles.user_id = auth.uid()
    AND staff_profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "Public can read POD documents" ON storage.objects;
CREATE POLICY "Public can read POD documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pod-documents');

-- Comments
COMMENT ON TABLE pods IS 'Immutable Proof of Delivery records';
COMMENT ON COLUMN pods.pod_reference IS 'Unique POD reference number (POD-YYYY-NNNN)';
COMMENT ON COLUMN pods.is_locked IS 'When true, record cannot be modified';
COMMENT ON COLUMN pods.locked_at IS 'Timestamp when record was locked';
