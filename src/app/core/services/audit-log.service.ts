import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { supabase } from '../supabase/supabase.client';
import { AuditLog, AuditLogWithStaff, AuditLogFilters } from '../models/audit-log.model';

/**
 * AuditLogService handles retrieval of audit log records.
 *
 * Key features:
 * - Fetch audit logs with filtering
 * - Query by package, staff, date range
 * - Read-only access (no create/update/delete)
 */
@Injectable({
  providedIn: 'root'
})
export class AuditLogService {
  private logsSubject = new BehaviorSubject<AuditLogWithStaff[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private totalCountSubject = new BehaviorSubject<number>(0);

  /** List of audit logs */
  readonly logs$ = this.logsSubject.asObservable();

  /** Loading state */
  readonly loading$ = this.loadingSubject.asObservable();

  /** Error state */
  readonly error$ = this.errorSubject.asObservable();

  /** Total count for pagination */
  readonly totalCount$ = this.totalCountSubject.asObservable();

  /**
   * Load audit logs with optional filters
   */
  async loadAuditLogs(filters?: AuditLogFilters): Promise<AuditLogWithStaff[]> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.packageId) {
        query = query.eq('entity_id', filters.packageId);
      }

      if (filters?.staffId) {
        query = query.eq('performed_by', filters.staffId);
      }

      if (filters?.action) {
        query = query.eq('action', filters.action);
      }

      if (filters?.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters?.dateTo) {
        // Add one day to include the entire end date
        const endDate = new Date(filters.dateTo);
        endDate.setDate(endDate.getDate() + 1);
        query = query.lt('created_at', endDate.toISOString());
      }

      if (filters?.search) {
        // Search in metadata JSONB field
        query = query.or(`action.ilike.%${filters.search}%,metadata->reference.ilike.%${filters.search}%`);
      }

      // Pagination
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        this.errorSubject.next(error.message);
        return [];
      }

      // Enrich with staff profile data
      const enrichedLogs = await this.enrichLogsWithStaffData(data || []);

      this.logsSubject.next(enrichedLogs);
      this.totalCountSubject.next(count || 0);

      return enrichedLogs;

    } catch (err: any) {
      this.errorSubject.next(err.message || 'Failed to load audit logs');
      return [];
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Get audit logs for a specific package
   */
  async getPackageAuditLogs(packageId: string): Promise<AuditLogWithStaff[]> {
    return this.loadAuditLogs({ packageId, limit: 100 });
  }

  /**
   * Get audit logs by entity (package or pod)
   */
  async getEntityAuditLogs(entityId: string, entityType?: string): Promise<AuditLogWithStaff[]> {
    const filters: AuditLogFilters = { limit: 100 };

    // Query for logs where entity_id matches
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch entity audit logs:', error);
      return [];
    }

    return this.enrichLogsWithStaffData(data || []);
  }

  /**
   * Get a single audit log by ID
   */
  async getAuditLog(id: string): Promise<AuditLogWithStaff | null> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Failed to fetch audit log:', error);
      return null;
    }

    const enriched = await this.enrichLogsWithStaffData([data]);
    return enriched[0] || null;
  }

  /**
   * Get distinct actions for filter dropdown
   */
  async getDistinctActions(): Promise<string[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('action')
      .order('action');

    if (error) {
      console.error('Failed to fetch distinct actions:', error);
      return [];
    }

    // Get unique actions
    const actions = [...new Set(data?.map(d => d.action) || [])];
    return actions;
  }

  /**
   * Enrich audit logs with staff profile information
   */
  private async enrichLogsWithStaffData(logs: AuditLog[]): Promise<AuditLogWithStaff[]> {
    if (logs.length === 0) return [];

    // Get unique user IDs
    const userIds = [...new Set(logs.map(log => log.performed_by))];

    // Fetch staff profiles
    const { data: staffProfiles } = await supabase
      .from('staff_profiles')
      .select('user_id, full_name, email, role')
      .in('user_id', userIds);

    // Create lookup map
    const staffMap = new Map(
      staffProfiles?.map(sp => [sp.user_id, sp]) || []
    );

    // Enrich logs
    return logs.map(log => ({
      ...log,
      staff_profile: staffMap.get(log.performed_by) || undefined
    }));
  }

  /**
   * Clear current logs
   */
  clearLogs(): void {
    this.logsSubject.next([]);
    this.totalCountSubject.next(0);
    this.errorSubject.next(null);
  }
}
