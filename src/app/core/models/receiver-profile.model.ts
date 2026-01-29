/**
 * Receiver profile interface matching the database schema.
 * Receivers are people who can collect packages.
 */
export interface ReceiverProfile {
  id: string;
  name: string;
  surname: string;
  employee_number: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * DTO for creating a new receiver profile.
 */
export interface CreateReceiverProfileDto {
  name: string;
  surname: string;
  employee_number: string;
  email: string;
  phone?: string;
}

/**
 * DTO for updating a receiver profile.
 */
export interface UpdateReceiverProfileDto {
  name?: string;
  surname?: string;
  employee_number?: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
}

/**
 * Receiver profile with computed full name for display.
 */
export interface ReceiverProfileDisplay extends ReceiverProfile {
  full_name: string;
}

/**
 * Helper function to get full name from receiver profile.
 */
export function getReceiverFullName(receiver: ReceiverProfile): string {
  return `${receiver.name} ${receiver.surname}`;
}
