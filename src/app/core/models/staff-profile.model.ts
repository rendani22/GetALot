/**
 * Staff role definitions for the POD system.
 * - warehouse: Can manage inventory, prepare orders
 * - driver: Can handle deliveries, pickup packages
 * - collection: Collection point staff, can receive packages and process POD
 * - admin: Full system access, manage staff
 */
export type StaffRole = 'warehouse' | 'driver' | 'collection' | 'admin';

/**
 * Staff profile interface matching the database schema.
 * Linked to Supabase Auth user via user_id.
 */
export interface StaffProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * DTO for creating a new staff profile.
 * user_id is set by the Edge Function after creating auth user.
 */
export interface CreateStaffProfileDto {
  email: string;
  full_name: string;
  role: StaffRole;
  phone?: string;
  password: string; // Used to create auth user
}

/**
 * DTO for updating a staff profile.
 * Only admins can perform updates.
 */
export interface UpdateStaffProfileDto {
  full_name?: string;
  role?: StaffRole;
  phone?: string;
  is_active?: boolean;
}

/**
 * Staff profile with user details for display.
 */
export interface StaffProfileWithDetails extends StaffProfile {
  last_sign_in_at?: string;
}

/**
 * Role display configuration for UI.
 */
export const ROLE_CONFIG: Record<StaffRole, { label: string; description: string; color: string }> = {
  warehouse: {
    label: 'Warehouse',
    description: 'Inventory management and order preparation',
    color: '#3b82f6' // blue
  },
  driver: {
    label: 'Driver',
    description: 'Package pickup and delivery',
    color: '#f59e0b' // amber
  },
  collection: {
    label: 'Collection Point',
    description: 'Receive packages and process customer pickups',
    color: '#10b981' // green
  },
  admin: {
    label: 'Administrator',
    description: 'Full system access and staff management',
    color: '#8b5cf6' // purple
  }
};
