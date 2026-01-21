import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { AuditLogWithStaff, getActionConfig } from '../../../core/models/audit-log.model';

/**
 * AuditTimelineComponent - Reusable timeline view for audit logs.
 *
 * Can be embedded in package detail or POD detail views
 * to show a chronological history of actions.
 */
@Component({
  selector: 'app-audit-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="audit-timeline">
      <div class="timeline-header">
        <h4>Activity Timeline</h4>
        @if (isLoading()) {
          <span class="loading-indicator">Loading...</span>
        }
      </div>

      @if (error()) {
        <div class="timeline-error">
          <p>{{ error() }}</p>
        </div>
      } @else if (logs().length === 0 && !isLoading()) {
        <div class="timeline-empty">
          <p>No activity recorded yet</p>
        </div>
      } @else {
        <div class="timeline-list">
          @for (log of logs(); track log.id) {
            <div class="timeline-item">
              <div class="timeline-dot" [style.background-color]="getActionConfig(log.action).color"></div>
              <div class="timeline-content">
                <div class="timeline-action">
                  <span class="action-name" [style.color]="getActionConfig(log.action).color">
                    {{ getActionConfig(log.action).label }}
                  </span>
                  <span class="action-time">{{ formatRelativeTime(log.created_at) }}</span>
                </div>
                <div class="timeline-details">
                  <span class="staff-name">
                    {{ log.staff_profile?.full_name || log.metadata?.['performed_by_name'] || 'System' }}
                  </span>
                  @if (log.metadata?.['reference'] || log.metadata?.['pod_reference']) {
                    <span class="ref-badge">
                      {{ log.metadata?.['pod_reference'] || log.metadata?.['reference'] }}
                    </span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .audit-timeline {
      background: #fafafa;
      border-radius: 8px;
      padding: 1rem;
    }

    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e5e7eb;

      h4 {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 600;
        color: #1e3a5f;
      }

      .loading-indicator {
        font-size: 0.75rem;
        color: #6b7280;
      }
    }

    .timeline-error, .timeline-empty {
      text-align: center;
      padding: 1rem;
      color: #6b7280;
      font-size: 0.875rem;

      p { margin: 0; }
    }

    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .timeline-item {
      display: flex;
      gap: 0.75rem;
      padding-left: 0.5rem;
    }

    .timeline-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 4px;
    }

    .timeline-content {
      flex: 1;
      min-width: 0;
    }

    .timeline-action {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;

      .action-name {
        font-size: 0.8125rem;
        font-weight: 500;
      }

      .action-time {
        font-size: 0.6875rem;
        color: #9ca3af;
        white-space: nowrap;
      }
    }

    .timeline-details {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.25rem;

      .staff-name {
        font-size: 0.75rem;
        color: #6b7280;
      }

      .ref-badge {
        font-size: 0.625rem;
        font-family: monospace;
        padding: 0.125rem 0.375rem;
        background: #e0e7ff;
        color: #4338ca;
        border-radius: 4px;
      }
    }
  `]
})
export class AuditTimelineComponent implements OnChanges {
  private auditLogService = inject(AuditLogService);

  /** Entity ID to load audit logs for */
  @Input({ required: true }) entityId!: string;

  /** Optional entity type filter */
  @Input() entityType?: string;

  /** Maximum number of logs to show */
  @Input() limit = 10;

  logs = signal<AuditLogWithStaff[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Expose helper to template
  getActionConfig = getActionConfig;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityId'] && this.entityId) {
      this.loadLogs();
    }
  }

  async loadLogs(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const logs = await this.auditLogService.getEntityAuditLogs(this.entityId, this.entityType);
      this.logs.set(logs.slice(0, this.limit));
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load audit logs');
    } finally {
      this.isLoading.set(false);
    }
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

    return date.toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: 'short'
    });
  }
}
