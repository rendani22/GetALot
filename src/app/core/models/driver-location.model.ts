/**
 * Driver location interface for real-time GPS tracking.
 */
export interface DriverLocation {
  id: string;
  driver_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string;
}

/**
 * Driver location with staff profile details.
 */
export interface DriverLocationWithProfile extends DriverLocation {
  driver?: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
  };
}

/**
 * DTO for updating driver location.
 */
export interface UpdateDriverLocationDto {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
}
