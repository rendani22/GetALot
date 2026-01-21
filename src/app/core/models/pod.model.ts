/**
 * POD (Proof of Delivery) model definitions.
 * Represents an immutable record of package delivery confirmation.
 */

/**
 * POD status definitions
 * - completed: POD has been signed and locked
 */
export type PodStatus = 'completed';

/**
 * POD record interface matching the database schema.
 * This record is immutable once created.
 */
export interface Pod {
  id: string;
  pod_reference: string;          // e.g., POD-2026-0001
  package_id: string;
  package_reference: string;
  receiver_email: string;

  // Staff who processed the collection
  staff_id: string;
  staff_name: string;
  staff_email: string;

  // Signature info
  signature_url: string;
  signature_path: string;

  // Timestamps
  signed_at: string;
  completed_at: string;

  // PDF storage
  pdf_url: string | null;
  pdf_path: string | null;
  pdf_generated_at: string | null;

  // Immutability
  is_locked: boolean;
  locked_at: string | null;

  // Metadata
  created_at: string;
  notes: string | null;
}

/**
 * DTO for creating a POD record
 */
export interface CreatePodDto {
  package_id: string;
  package_reference: string;
  receiver_email: string;
  signature_url: string;
  signature_path: string;
  signed_at: string;
  notes?: string;
}

/**
 * POD with package details for display
 */
export interface PodWithPackage extends Pod {
  package?: {
    reference: string;
    receiver_email: string;
    notes: string | null;
    created_at: string;
  };
}

/**
 * Response from complete-pod Edge Function
 */
export interface CompletePodResponse {
  pod: Pod;
  pdf_url: string;
  pdf_generated: boolean;
}
