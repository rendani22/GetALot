import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { StaffService } from '../../../core/services/staff.service';
import {
  AuditLogWithStaff,
  AuditLogFilters,
  getActionConfig
} from '../../../core/models/audit-log.model';
import { StaffProfile } from '../../../core/models/staff-profile.model';

/**
 * AuditTrailComponent - Admin view for audit logs.
 *
 * Features:
 * - Timeline view of all system actions
 * - Filter by package, staff, date range, action type
 * - Export to CSV for compliance reporting
 * - Read-only display
 * - Pagination support
 */
@Component({
  selector: 'app-audit-trail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-trail.component.html',
  styleUrls: ['./audit-trail.component.scss']
})
export class AuditTrailComponent implements OnInit {
  private router = inject(Router);
  private auditLogService = inject(AuditLogService);
  private staffService = inject(StaffService);

  // UI State
  isLoading = signal(true);
  isExporting = signal(false);
  errorMessage = signal<string | null>(null);
  auditLogs = signal<AuditLogWithStaff[]>([]);
  totalCount = signal(0);

  // Filter state
  filters = signal<AuditLogFilters>({
    limit: 50,
    offset: 0
  });

  // Filter options
  staffList = signal<StaffProfile[]>([]);
  actionTypes = signal<string[]>([]);
  showFilters = signal(false);

  // Filter form values
  filterPackageRef = '';
  filterStaffId = '';
  filterAction = '';
  filterDateFrom = '';
  filterDateTo = '';

  // Pagination
  currentPage = signal(1);
  pageSize = 50;

  // Helper function exposed to template
  getActionConfig = getActionConfig;

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadAuditLogs(),
      this.loadFilterOptions()
    ]);
  }

  async loadAuditLogs(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const logs = await this.auditLogService.loadAuditLogs(this.filters());

    this.auditLogs.set(logs);

    // Subscribe to total count
    this.auditLogService.totalCount$.subscribe(count => {
      this.totalCount.set(count);
    });

    this.isLoading.set(false);
  }

  async loadFilterOptions(): Promise<void> {
    // Load staff list
    await this.staffService.loadAllStaff();
    this.staffService.staffList$.subscribe(staff => {
      this.staffList.set(staff);
    });

    // Load distinct actions
    const actions = await this.auditLogService.getDistinctActions();
    this.actionTypes.set(actions);
  }

  async applyFilters(): Promise<void> {
    const newFilters: AuditLogFilters = {
      limit: this.pageSize,
      offset: 0
    };

    if (this.filterStaffId) {
      newFilters.staffId = this.filterStaffId;
    }

    if (this.filterAction) {
      newFilters.action = this.filterAction;
    }

    if (this.filterDateFrom) {
      newFilters.dateFrom = this.filterDateFrom;
    }

    if (this.filterDateTo) {
      newFilters.dateTo = this.filterDateTo;
    }

    if (this.filterPackageRef) {
      newFilters.search = this.filterPackageRef;
    }

    this.filters.set(newFilters);
    this.currentPage.set(1);
    await this.loadAuditLogs();
  }

  async clearFilters(): Promise<void> {
    this.filterPackageRef = '';
    this.filterStaffId = '';
    this.filterAction = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';

    this.filters.set({ limit: this.pageSize, offset: 0 });
    this.currentPage.set(1);
    await this.loadAuditLogs();
  }

  toggleFilters(): void {
    this.showFilters.set(!this.showFilters());
  }

  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.totalPages()) return;

    this.currentPage.set(page);
    this.filters.update(f => ({
      ...f,
      offset: (page - 1) * this.pageSize
    }));
    await this.loadAuditLogs();
  }

  totalPages(): number {
    return Math.ceil(this.totalCount() / this.pageSize);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return this.formatDate(dateString);
  }

  getMetadataDisplay(log: AuditLogWithStaff): string[] {
    const items: string[] = [];
    const meta = log.metadata;

    if (!meta) return items;

    if (meta['reference']) {
      items.push(`Ref: ${meta['reference']}`);
    }
    if (meta['package_reference'] && meta['package_reference'] !== meta['reference']) {
      items.push(`Package: ${meta['package_reference']}`);
    }
    if (meta['pod_reference']) {
      items.push(`POD: ${meta['pod_reference']}`);
    }
    if (meta['collected_by_email']) {
      items.push(`Receiver: ${meta['collected_by_email']}`);
    }

    return items;
  }

  goBack(): void {
    this.router.navigate(['/admin']);
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filterPackageRef ||
      this.filterStaffId ||
      this.filterAction ||
      this.filterDateFrom ||
      this.filterDateTo
    );
  }

  /**
   * Export audit logs to CSV file
   * Uses current filters but fetches all matching records (no pagination limit)
   */
  async exportToCsv(): Promise<void> {
    this.isExporting.set(true);
    this.errorMessage.set(null);

    try {
      // Build filters without pagination limit to get all records
      const exportFilters: AuditLogFilters = {
        limit: 10000, // Large limit to get all records
        offset: 0
      };

      if (this.filterStaffId) {
        exportFilters.staffId = this.filterStaffId;
      }
      if (this.filterAction) {
        exportFilters.action = this.filterAction;
      }
      if (this.filterDateFrom) {
        exportFilters.dateFrom = this.filterDateFrom;
      }
      if (this.filterDateTo) {
        exportFilters.dateTo = this.filterDateTo;
      }
      if (this.filterPackageRef) {
        exportFilters.search = this.filterPackageRef;
      }

      // Fetch all logs matching filters
      const logs = await this.auditLogService.loadAuditLogs(exportFilters);

      if (logs.length === 0) {
        this.errorMessage.set('No audit logs to export');
        return;
      }

      // Generate CSV content
      const csv = this.generateCsvContent(logs);

      // Download file
      this.downloadCsv(csv, this.generateFilename());

    } catch (err: any) {
      console.error('Export error:', err);
      this.errorMessage.set(err.message || 'Failed to export audit logs');
    } finally {
      this.isExporting.set(false);
      // Reload current page data
      await this.loadAuditLogs();
    }
  }

  /**
   * Generate CSV content from audit logs
   */
  private generateCsvContent(logs: AuditLogWithStaff[]): string {
    // CSV Headers
    const headers = [
      'Timestamp',
      'Action',
      'Action Label',
      'Entity Type',
      'Entity ID',
      'Staff Name',
      'Staff Email',
      'Staff Role',
      'Staff User ID',
      'Package Reference',
      'POD Reference',
      'Receiver Email',
      'Signature URL',
      'PDF URL',
      'Additional Metadata',
      'Audit Log ID'
    ];

    // Build rows
    const rows = logs.map(log => {
      const meta = log.metadata || {};

      return [
        this.formatDateForCsv(log.created_at),
        log.action,
        getActionConfig(log.action).label,
        log.entity_type,
        log.entity_id,
        log.staff_profile?.full_name || meta['performed_by_name'] || '',
        log.staff_profile?.email || '',
        log.staff_profile?.role || meta['performed_by_role'] || '',
        log.performed_by,
        meta['reference'] || meta['package_reference'] || '',
        meta['pod_reference'] || '',
        meta['collected_by_email'] || '',
        meta['signature_url'] || '',
        meta['pdf_url'] || '',
        this.getAdditionalMetadata(meta),
        log.id
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => this.escapeCsvCell(cell)).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Escape a CSV cell value
   */
  private escapeCsvCell(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // If the value contains comma, newline, or quote, wrap in quotes
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  /**
   * Get additional metadata as a JSON string (excluding known fields)
   */
  private getAdditionalMetadata(meta: Record<string, unknown>): string {
    const knownFields = [
      'performed_by_name',
      'performed_by_role',
      'reference',
      'package_reference',
      'pod_reference',
      'collected_by_email',
      'signature_url',
      'signature_path',
      'pdf_url',
      'pdf_path',
      'user_agent',
      'timestamp_iso'
    ];

    const additional: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(meta)) {
      if (!knownFields.includes(key) && value !== null && value !== undefined) {
        additional[key] = value;
      }
    }

    if (Object.keys(additional).length === 0) {
      return '';
    }

    return JSON.stringify(additional);
  }

  /**
   * Format date for CSV export (ISO format for consistency)
   */
  private formatDateForCsv(dateString: string): string {
    const date = new Date(dateString);
    return date.toISOString();
  }

  /**
   * Generate filename for the CSV export
   */
  private generateFilename(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

    let filename = `audit-logs-${dateStr}-${timeStr}`;

    // Add filter indicators to filename
    if (this.filterDateFrom || this.filterDateTo) {
      filename += `-${this.filterDateFrom || 'start'}-to-${this.filterDateTo || 'end'}`;
    }
    if (this.filterAction) {
      filename += `-${this.filterAction.toLowerCase()}`;
    }

    return `${filename}.csv`;
  }

  /**
   * Trigger CSV file download
   */
  private downloadCsv(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }
}
