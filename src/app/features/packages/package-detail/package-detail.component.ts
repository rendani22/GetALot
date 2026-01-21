import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PackageService } from '../../../core/services/package.service';
import { Package, PACKAGE_STATUS_CONFIG } from '../../../core/models/package.model';
import { QrCodeComponent } from '../../../shared/components/qr-code/qr-code.component';

/**
 * PackageDetailComponent - View full package details.
 *
 * Features:
 * - Display all package information
 * - Show QR code for printing
 * - View status history
 * - Actions based on status
 */
@Component({
  selector: 'app-package-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, QrCodeComponent],
  templateUrl: './package-detail.component.html',
  styleUrls: ['./package-detail.component.scss']
})
export class PackageDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private packageService = inject(PackageService);

  // UI State
  isLoading = signal(true);
  package = signal<Package | null>(null);
  errorMessage = signal<string | null>(null);

  // Status config for display
  statusConfig = PACKAGE_STATUS_CONFIG;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage.set('Package ID not provided');
      this.isLoading.set(false);
      return;
    }

    await this.loadPackage(id);
  }

  async loadPackage(id: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { package: pkg, error } = await this.packageService.getPackage(id);

    this.isLoading.set(false);

    if (error || !pkg) {
      this.errorMessage.set(error || 'Package not found');
      return;
    }

    this.package.set(pkg);
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusColor(status: string): string {
    return this.statusConfig[status as keyof typeof this.statusConfig]?.color || '#6b7280';
  }

  getStatusLabel(status: string): string {
    return this.statusConfig[status as keyof typeof this.statusConfig]?.label || status;
  }

  goBack(): void {
    this.router.navigate(['/packages']);
  }

  scanForCollection(): void {
    this.router.navigate(['/collection/scan']);
  }
}
