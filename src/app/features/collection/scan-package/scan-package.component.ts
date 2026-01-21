import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PackageService } from '../../../core/services/package.service';
import { Package, PACKAGE_STATUS_CONFIG } from '../../../core/models/package.model';
import { QrScannerComponent } from '../../../shared/components/qr-scanner/qr-scanner.component';
import { supabase } from '../../../core/supabase/supabase.client';
import { environment } from '../../../../environments/environment';

/**
 * ScanPackageComponent - QR code scanner for collection point staff.
 *
 * Features:
 * - Camera-based QR scanning
 * - Fetches package details from reference
 * - Prevents scanning of already collected packages
 * - Records QR_SCANNED audit log
 * - Initiates POD process
 */
@Component({
  selector: 'app-scan-package',
  standalone: true,
  imports: [CommonModule, RouterLink, QrScannerComponent],
  templateUrl: './scan-package.component.html',
  styleUrls: ['./scan-package.component.scss']
})
export class ScanPackageComponent {
  private router = inject(Router);
  private packageService = inject(PackageService);

  // UI State
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  scannedPackage = signal<Package | null>(null);
  showScanner = signal(true);

  // Status config for display
  statusConfig = PACKAGE_STATUS_CONFIG;

  async onQrScanned(reference: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.scannedPackage.set(null);

    // Validate reference format
    const trimmedRef = reference.trim().toUpperCase();
    if (!trimmedRef.startsWith('PKG-')) {
      this.errorMessage.set('Invalid QR code. This does not appear to be a valid package reference.');
      this.isLoading.set(false);
      this.showScanner.set(true);
      return;
    }

    try {
      // Fetch package by reference
      const { package: pkg, error } = await this.packageService.getPackageByReference(trimmedRef);

      if (error || !pkg) {
        this.errorMessage.set(`Package not found: ${trimmedRef}`);
        this.isLoading.set(false);
        this.showScanner.set(true);
        return;
      }

      // Check if already collected
      if (pkg.status === 'collected') {
        this.errorMessage.set(`This package (${pkg.reference}) has already been collected on ${this.formatDate(pkg.collected_at)}.`);
        this.scannedPackage.set(pkg);
        this.isLoading.set(false);
        this.showScanner.set(false);
        return;
      }

      // Check if returned
      if (pkg.status === 'returned') {
        this.errorMessage.set(`This package (${pkg.reference}) has been marked as returned and cannot be collected.`);
        this.scannedPackage.set(pkg);
        this.isLoading.set(false);
        this.showScanner.set(false);
        return;
      }

      // Record audit log
      await this.logAudit('QR_SCANNED', pkg.id, { reference: pkg.reference });

      // Success - show package details
      this.scannedPackage.set(pkg);
      this.showScanner.set(false);

    } catch (err: any) {
      console.error('Scan error:', err);
      this.errorMessage.set(err.message || 'Failed to fetch package details');
      this.showScanner.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  scanAnother(): void {
    this.scannedPackage.set(null);
    this.errorMessage.set(null);
    this.showScanner.set(true);
  }

  async proceedToCollection(pkg: Package): Promise<void> {
    // Navigate to POD collection flow (to be implemented)
    // For now, navigate to a collection confirmation page
    this.router.navigate(['/collection', pkg.id, 'confirm']);
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  }

  private async logAudit(action: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      await fetch(
        `${environment.supabase.url}/functions/v1/log-audit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({
            action,
            entity_type: 'package',
            entity_id: entityId,
            metadata
          })
        }
      ).catch(err => console.warn('Audit log failed:', err));
    } catch (err) {
      console.warn('Audit log error:', err);
    }
  }
}
