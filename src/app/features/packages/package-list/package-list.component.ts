import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PackageService } from '../../../core/services/package.service';
import { Package, PackageStatus, PACKAGE_STATUS_CONFIG } from '../../../core/models/package.model';

/**
 * PackageListComponent - View all packages for warehouse staff.
 *
 * Features:
 * - List all packages with status
 * - Filter by status
 * - Search by reference or email
 * - View package details
 */
@Component({
  selector: 'app-package-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './package-list.component.html',
  styleUrls: ['./package-list.component.scss']
})
export class PackageListComponent implements OnInit {
  private packageService = inject(PackageService);

  // UI State
  isLoading = signal(true);
  packages = signal<Package[]>([]);
  filteredPackages = signal<Package[]>([]);
  errorMessage = signal<string | null>(null);

  // Filters
  searchQuery = '';
  statusFilter: PackageStatus | 'all' = 'all';

  // Status config for display
  statusConfig = PACKAGE_STATUS_CONFIG;
  statusOptions: (PackageStatus | 'all')[] = ['all', 'pending', 'notified', 'collected', 'returned'];

  async ngOnInit(): Promise<void> {
    await this.loadPackages();
  }

  async loadPackages(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.packageService.loadPackages();

      // Subscribe to packages from service
      this.packageService.packages$.subscribe(packages => {
        this.packages.set(packages);
        this.applyFilters();
      });
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to load packages');
    } finally {
      this.isLoading.set(false);
    }
  }

  applyFilters(): void {
    let filtered = this.packages();

    // Apply status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === this.statusFilter);
    }

    // Apply search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(p =>
        p.reference.toLowerCase().includes(query) ||
        p.receiver_email.toLowerCase().includes(query) ||
        (p.notes && p.notes.toLowerCase().includes(query))
      );
    }

    this.filteredPackages.set(filtered);
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onStatusFilterChange(): void {
    this.applyFilters();
  }

  async refresh(): Promise<void> {
    await this.loadPackages();
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusLabel(status: PackageStatus | 'all'): string {
    if (status === 'all') return 'All Statuses';
    return this.statusConfig[status].label;
  }

  getStatusColor(status: PackageStatus): string {
    return this.statusConfig[status].color;
  }

  getPackageCount(status: PackageStatus | 'all'): number {
    if (status === 'all') return this.packages().length;
    return this.packages().filter(p => p.status === status).length;
  }
}
