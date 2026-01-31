-- Add delivery location to packages
-- Links packages to delivery_locations table for destination tracking

-- Add delivery_location_id column to packages table
ALTER TABLE packages
ADD COLUMN delivery_location_id UUID REFERENCES delivery_locations(id);

-- Create index for delivery location lookups
CREATE INDEX idx_packages_delivery_location ON packages(delivery_location_id);

-- Add comment
COMMENT ON COLUMN packages.delivery_location_id IS 'Reference to the delivery location where this package is going';
