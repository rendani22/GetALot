/**
 * Audit Log model definitions.
 * Represents immutable audit trail records for compliance and tracking.
 */

/**
 * Audit action types used in the system
 */
export type AuditAction =
  | 'PACKAGE_CREATED'
  | 'PACKAGE_UPDATED'
  | 'PACKAGE_COLLECTED'
  | 'RECEIVER_NOTIFIED'
  | 'QR_GENERATED'
  | 'QR_DOWNLOADED'
  | 'QR_DOWNLOADED_PDF'
  | 'QR_PRINTED'
  | 'QR_SCANNED'
  | 'POD_SIGNED'
  | 'POD_COMPLETED'
  | 'POD_PDF_GENERATED'
  | 'STATUS_LOCKED'
  | 'EMAIL_SENT'
  | 'STAFF_CREATED'
  | 'STAFF_UPDATED'
  | 'STAFF_DEACTIVATED';

/**
 * Entity types that can be audited
 */
export type AuditEntityType = 'package' | 'pod' | 'staff' | 'system';

/**
 * Audit log record interface matching the database schema
 */
export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  performed_by: string;
  metadata: AuditMetadata | null;
  created_at: string;
}

/**
 * Metadata stored with audit logs
 */
export interface AuditMetadata {
  performed_by_name?: string;
  performed_by_role?: string;
  reference?: string;
  package_reference?: string;
  pod_reference?: string;
  pod_id?: string;
  signature_url?: string;
  signature_path?: string;
  pdf_url?: string;
  pdf_path?: string;
  staff_id?: string;
  staff_name?: string;
  collected_by_email?: string;
  user_agent?: string;
  timestamp_iso?: string;
  [key: string]: unknown;
}

/**
 * Audit log with staff profile details for display
 */
export interface AuditLogWithStaff extends AuditLog {
  staff_profile?: {
    full_name: string;
    email: string;
    role: string;
  };
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  packageId?: string;
  staffId?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Action display configuration for UI
 */
export const AUDIT_ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  PACKAGE_CREATED: {
    label: 'Package Created',
    icon: 'plus-circle',
    color: '#10b981' // green
  },
  PACKAGE_UPDATED: {
    label: 'Package Updated',
    icon: 'pencil',
    color: '#3b82f6' // blue
  },
  PACKAGE_COLLECTED: {
    label: 'Package Collected',
    icon: 'check-circle',
    color: '#10b981' // green
  },
  RECEIVER_NOTIFIED: {
    label: 'Receiver Notified',
    icon: 'mail',
    color: '#3b82f6' // blue
  },
  QR_GENERATED: {
    label: 'QR Code Generated',
    icon: 'qr-code',
    color: '#8b5cf6' // purple
  },
  QR_DOWNLOADED: {
    label: 'QR Code Downloaded (PNG)',
    icon: 'download',
    color: '#6366f1' // indigo
  },
  QR_DOWNLOADED_PDF: {
    label: 'QR Code Downloaded (PDF)',
    icon: 'document-download',
    color: '#6366f1' // indigo
  },
  QR_PRINTED: {
    label: 'QR Code Printed',
    icon: 'printer',
    color: '#6366f1' // indigo
  },
  QR_SCANNED: {
    label: 'QR Code Scanned',
    icon: 'camera',
    color: '#f59e0b' // amber
  },
  POD_SIGNED: {
    label: 'POD Signed',
    icon: 'pencil-alt',
    color: '#10b981' // green
  },
  POD_COMPLETED: {
    label: 'POD Completed',
    icon: 'badge-check',
    color: '#10b981' // green
  },
  POD_PDF_GENERATED: {
    label: 'POD PDF Generated',
    icon: 'document-text',
    color: '#8b5cf6' // purple
  },
  STATUS_LOCKED: {
    label: 'Status Locked',
    icon: 'lock-closed',
    color: '#ef4444' // red
  },
  EMAIL_SENT: {
    label: 'Email Notification Sent',
    icon: 'mail',
    color: '#3b82f6' // blue
  },
  STAFF_CREATED: {
    label: 'Staff Member Created',
    icon: 'user-add',
    color: '#10b981' // green
  },
  STAFF_UPDATED: {
    label: 'Staff Member Updated',
    icon: 'user',
    color: '#3b82f6' // blue
  },
  STAFF_DEACTIVATED: {
    label: 'Staff Member Deactivated',
    icon: 'user-remove',
    color: '#ef4444' // red
  }
};

/**
 * Get action configuration with fallback for unknown actions
 */
export function getActionConfig(action: string): { label: string; icon: string; color: string } {
  return AUDIT_ACTION_CONFIG[action] || {
    label: action.replace(/_/g, ' '),
    icon: 'information-circle',
    color: '#6b7280'
  };
}
