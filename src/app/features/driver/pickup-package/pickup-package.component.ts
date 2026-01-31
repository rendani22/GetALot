import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PackageService } from '../../../core/services/package.service';
import { StaffService } from '../../../core/services/staff.service';
import { Package, PACKAGE_STATUS_CONFIG } from '../../../core/models/package.model';
import { QrScannerComponent } from '../../../shared/components/qr-scanner/qr-scanner.component';
import { supabase } from '../../../core/supabase/supabase.client';
import { environment } from '../../../../environments/environment';

/**
 * PickupPackageComponent - QR scanner for drivers to pickup packages.
 *
 * Features:
 * - Camera-based QR scanning
 * - Fetches package details from reference
 * - Validates package is ready for pickup (pending/notified)
 * - Marks package as in_transit
 * - Sends "Package On the Way" email
 */
@Component({
  selector: 'app-pickup-package',
  standalone: true,
  imports: [CommonModule, RouterLink, QrScannerComponent],
  template: `
    <div class="pickup-container">
      <header class="page-header">
        <a routerLink="/dashboard" class="back-btn">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </a>
        <h1>Pickup Package</h1>
      </header>

      <main class="content">
        @if (isLoading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <p>{{ loadingMessage() }}</p>
          </div>
        }

        @else if (showScanner()) {
          <div class="scanner-section">
            <div class="instructions">
              <h2>Scan Package QR Code</h2>
              <p>Point your camera at the QR code on the package label to pick it up for delivery.</p>
            </div>

            <app-qr-scanner
              (scanned)="onQrScanned($event)"
            />
          </div>
        }

        @else if (scannedPackage()) {
          <div class="result-card" [class.error]="errorMessage()" [class.success]="successMessage()">
            <!-- Status Icon -->
            <div class="status-icon" 
                 [class.success]="successMessage()" 
                 [class.warning]="errorMessage() && !successMessage()">
              @if (successMessage()) {
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              } @else if (errorMessage()) {
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              }
            </div>

            <!-- Message -->
            @if (successMessage()) {
              <h2 class="success-title">{{ successMessage() }}</h2>
              @if (emailSent()) {
                <p class="email-status">📧 Notification email sent to receiver</p>
              }
            } @else if (errorMessage()) {
              <h2 class="error-title">Cannot Pick Up Package</h2>
              <p class="error-message">{{ errorMessage() }}</p>
            } @else {
              <h2>Package Found</h2>
            }

            <!-- Package Details -->
            <div class="package-details">
              <div class="detail-row">
                <span class="label">Reference</span>
                <span class="value reference">{{ scannedPackage()!.reference }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Receiver</span>
                <span class="value">{{ scannedPackage()!.receiver_email }}</span>
              </div>
              @if (scannedPackage()!.notes) {
                <div class="detail-row">
                  <span class="label">Notes</span>
                  <span class="value">{{ scannedPackage()!.notes }}</span>
                </div>
              }
              <div class="detail-row">
                <span class="label">Status</span>
                <span class="status-badge" [style.background-color]="statusConfig[scannedPackage()!.status].color">
                  {{ statusConfig[scannedPackage()!.status].label }}
                </span>
              </div>
            </div>

            <!-- Package Items -->
            @if (scannedPackage()!.items && scannedPackage()!.items!.length > 0) {
              <div class="items-section">
                <h3>Package Contents</h3>
                <div class="items-list">
                  @for (item of scannedPackage()!.items; track item.id || $index) {
                    <div class="item-entry">
                      <span class="item-qty">{{ item.quantity }}×</span>
                      <span class="item-desc">{{ item.description }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Actions -->
            <div class="actions">
              @if (!successMessage() && !errorMessage() && canPickup()) {
                <button class="btn primary" (click)="pickupPackage()">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                  Confirm Pickup
                </button>
              }
              <button class="btn secondary" (click)="scanAnother()">
                {{ successMessage() ? 'Scan Next Package' : 'Scan Another' }}
              </button>
            </div>
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    .pickup-container {
      min-height: 100vh;
      background: #f3f4f6;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.5rem;
      background: #f59e0b;
      color: white;

      h1 {
        margin: 0;
        font-size: 1.25rem;
      }
    }

    .back-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      text-decoration: none;

      svg {
        width: 20px;
        height: 20px;
      }
    }

    .content {
      padding: 1.5rem;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      gap: 1rem;

      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #e5e7eb;
        border-top-color: #f59e0b;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      p {
        color: #6b7280;
        font-size: 0.875rem;
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .scanner-section {
      .instructions {
        text-align: center;
        margin-bottom: 1.5rem;

        h2 {
          margin: 0 0 0.5rem;
          font-size: 1.25rem;
          color: #1f2937;
        }

        p {
          margin: 0;
          color: #6b7280;
          font-size: 0.875rem;
        }
      }
    }

    .result-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

      &.success {
        border-top: 4px solid #10b981;
      }

      &.error {
        border-top: 4px solid #f59e0b;
      }
    }

    .status-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;

      svg {
        width: 32px;
        height: 32px;
      }

      &.success {
        background: #d1fae5;
        color: #10b981;
      }

      &.warning {
        background: #fef3c7;
        color: #f59e0b;
      }
    }

    .success-title {
      text-align: center;
      color: #059669;
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
    }

    .error-title {
      text-align: center;
      color: #b45309;
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
    }

    .error-message {
      text-align: center;
      color: #6b7280;
      font-size: 0.875rem;
      margin: 0 0 1rem;
    }

    .email-status {
      text-align: center;
      color: #059669;
      font-size: 0.875rem;
      margin: 0 0 1rem;
    }

    h2 {
      text-align: center;
      margin: 0 0 1.5rem;
      font-size: 1.25rem;
      color: #1f2937;
    }

    .package-details {
      background: #f9fafb;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid #e5e7eb;

      &:last-child {
        border-bottom: none;
      }

      .label {
        font-size: 0.875rem;
        color: #6b7280;
      }

      .value {
        font-weight: 500;
        color: #1f2937;
        font-size: 0.875rem;

        &.reference {
          font-family: monospace;
          font-size: 1rem;
          color: #f59e0b;
        }
      }
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      color: white;
    }

    .items-section {
      margin-bottom: 1rem;

      h3 {
        font-size: 0.875rem;
        color: #6b7280;
        margin: 0 0 0.5rem;
      }
    }

    .items-list {
      background: #f9fafb;
      border-radius: 8px;
      padding: 0.5rem;
    }

    .item-entry {
      display: flex;
      gap: 0.5rem;
      padding: 0.5rem;
      font-size: 0.875rem;

      .item-qty {
        font-weight: 600;
        color: #f59e0b;
        min-width: 30px;
      }

      .item-desc {
        color: #374151;
      }
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.875rem 1.5rem;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: background 0.2s;

      svg {
        width: 20px;
        height: 20px;
      }

      &.primary {
        background: #f59e0b;
        color: white;

        &:hover {
          background: #d97706;
        }
      }

      &.secondary {
        background: #e5e7eb;
        color: #374151;

        &:hover {
          background: #d1d5db;
        }
      }
    }
  `]
})
export class PickupPackageComponent {
  private router = inject(Router);
  private packageService = inject(PackageService);
  protected staffService = inject(StaffService);

  // UI State
  isLoading = signal(false);
  loadingMessage = signal('');
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  scannedPackage = signal<Package | null>(null);
  showScanner = signal(true);
  emailSent = signal(false);

  // Status config for display
  statusConfig = PACKAGE_STATUS_CONFIG;

  async onQrScanned(reference: string): Promise<void> {
    const trimmedRef = reference.trim().toUpperCase();
    this.isLoading.set(true);
    this.loadingMessage.set('Looking up package...');
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.showScanner.set(false);

    try {
      const { package: pkg, error } = await this.packageService.getPackageByReference(trimmedRef);

      if (error || !pkg) {
        this.errorMessage.set(`Package not found: ${trimmedRef}`);
        this.isLoading.set(false);
        this.showScanner.set(true);
        return;
      }

      // Check package status
      if (!['pending', 'notified'].includes(pkg.status)) {
        let message = '';
        if (pkg.status === 'in_transit') {
          message = `This package (${pkg.reference}) is already in transit.`;
        } else if (pkg.status === 'ready_for_collection') {
          message = `This package (${pkg.reference}) is already at the collection point.`;
        } else if (pkg.status === 'collected') {
          message = `This package (${pkg.reference}) has already been collected.`;
        } else if (pkg.status === 'returned') {
          message = `This package (${pkg.reference}) has been returned.`;
        }
        this.errorMessage.set(message);
        this.scannedPackage.set(pkg);
        this.isLoading.set(false);
        return;
      }

      // Package is ready for pickup
      this.scannedPackage.set(pkg);
      this.isLoading.set(false);

      // Log QR scan audit
      await this.logAudit('QR_SCANNED_DRIVER_PICKUP', pkg.id, {
        reference: pkg.reference,
        scanned_for: 'driver_pickup'
      });

    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to fetch package details');
      this.showScanner.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  canPickup(): boolean {
    const pkg = this.scannedPackage();
    return pkg !== null && ['pending', 'notified'].includes(pkg.status);
  }

  async pickupPackage(): Promise<void> {
    const pkg = this.scannedPackage();
    if (!pkg) return;

    this.isLoading.set(true);
    this.loadingMessage.set('Marking package as picked up...');

    try {
      // Refresh the session before making the API call
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('Session error:', sessionError);
        this.errorMessage.set('Session expired. Please log in again.');
        this.router.navigate(['/auth/login']);
        return;
      }

      const result = await this.packageService.driverPickup(pkg.id);

      if (result.error) {
        console.error('Pickup error:', result.error);
        this.errorMessage.set(result.error);
      } else if (result.package) {
        this.scannedPackage.set(result.package);
        this.successMessage.set(`Package ${pkg.reference} picked up successfully!`);
        this.emailSent.set(result.emailSent);
      }
    } catch (err: any) {
      console.error('Pickup exception:', err);
      this.errorMessage.set(err.message || 'Failed to pickup package');
    } finally {
      this.isLoading.set(false);
    }
  }

  scanAnother(): void {
    this.scannedPackage.set(null);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.emailSent.set(false);
    this.showScanner.set(true);
  }

  private async logAudit(action: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch(
        `${environment.supabase.url}/functions/v1/log-audit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({
            action,
            entity_type: 'package',
            entity_id: entityId,
            metadata
          })
        }
      );
    } catch (e) {
      console.error('Failed to log audit:', e);
    }
  }
}
