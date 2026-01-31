/**
 * Delivery location interface matching the database schema.
 * Delivery locations are destinations where packages can be delivered.
 */
export interface DeliveryLocation {
  id: string;
  name: string;
  address: string;
  google_maps_link: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * DTO for creating a new delivery location.
 */
export interface CreateDeliveryLocationDto {
  name: string;
  address: string;
  google_maps_link?: string;
}

/**
 * DTO for updating a delivery location.
 */
export interface UpdateDeliveryLocationDto {
  name?: string;
  address?: string;
  google_maps_link?: string;
  is_active?: boolean;
}
