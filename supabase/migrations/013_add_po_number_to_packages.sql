-- Add purchase order number to packages
-- Allows tracking packages by their purchase order reference

-- Add po_number column to packages table
ALTER TABLE packages
ADD COLUMN po_number TEXT;

-- Create index for purchase order lookups
CREATE INDEX idx_packages_po_number ON packages(po_number);

-- Add comment
COMMENT ON COLUMN packages.po_number IS 'Purchase order number for tracking and reference';
