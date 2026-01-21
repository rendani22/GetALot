import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PackageService } from '../../../core/services/package.service';
import { PodService } from '../../../core/services/pod.service';
import { Package, PACKAGE_STATUS_CONFIG } from '../../../core/models/package.model';
import { Pod } from '../../../core/models/pod.model';
import { SignaturePadComponent } from '../../../shared/components/signature-pad/signature-pad.component';
import { supabase } from '../../../core/supabase/supabase.client';

/**
 * CollectionConfirmComponent - POD collection confirmation with signature capture.
 *
 * Features:
 * - Display package details for verification
 * - Capture receiver's digital signature
 * - Create POD record with PDF generation
 * - Update package status to collected
 * - Lock POD record (immutable)
 * - Record audit logs for POD process
 */
@Component({
  selector: 'app-collection-confirm',
  standalone: true,
  imports: [CommonModule, SignaturePadComponent],
  templateUrl: './collection-confirm.component.html',
  styleUrls: ['./collection-confirm.component.scss']
})
export class CollectionConfirmComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private packageService = inject(PackageService);
  private podService = inject(PodService);

  // UI State
  isLoading = signal(true);
  isProcessing = signal(false);
  package = signal<Package | null>(null);
  errorMessage = signal<string | null>(null);
  isComplete = signal(false);

  // Signature state
  signatureUrl = signal<string | null>(null);
  signaturePath = signal<string | null>(null);
  signedAt = signal<string | null>(null);

  // POD state
  pod = signal<Pod | null>(null);
  podPdfUrl = signal<string | null>(null);

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

    // Check if already collected
    if (pkg.status === 'collected') {
      this.errorMessage.set('This package has already been collected');
    }

    // Check if returned
    if (pkg.status === 'returned') {
      this.errorMessage.set('This package has been marked as returned and cannot be collected');
    }

    this.package.set(pkg);
  }

  onSignatureSigned(event: { url: string; path: string }): void {
    this.signatureUrl.set(event.url);
    this.signaturePath.set(event.path);
    this.signedAt.set(new Date().toISOString());
  }

  onSignatureCleared(): void {
    this.signatureUrl.set(null);
    this.signaturePath.set(null);
    this.signedAt.set(null);
  }

  onSignatureError(error: string): void {
    this.errorMessage.set(error);
  }

  async confirmCollection(): Promise<void> {
    const pkg = this.package();
    const sigUrl = this.signatureUrl();
    const sigPath = this.signaturePath();
    const sigTime = this.signedAt();

    if (!pkg || !sigUrl || !sigPath || !sigTime) {
      this.errorMessage.set('Please provide a signature before confirming');
      return;
    }

    this.isProcessing.set(true);
    this.errorMessage.set(null);

    try {
      // Step 1: Update package status to collected with signature info
      const { data: updatedPkg, error: updateError } = await supabase
        .from('packages')
        .update({
          status: 'collected',
          collected_at: new Date().toISOString(),
          signature_url: sigUrl,
          signature_path: sigPath,
          signed_at: sigTime
        })
        .eq('id', pkg.id)
        .select()
        .single();

      if (updateError) {
        this.errorMessage.set(updateError.message);
        return;
      }

      // Step 2: Complete POD process (create record, generate PDF, lock)
      const { pod, pdfUrl, error: podError } = await this.podService.completePod(
        updatedPkg,
        sigUrl,
        sigPath,
        sigTime
      );

      if (podError) {
        // Package is collected but POD failed - show warning but allow completion
        console.error('POD completion error:', podError);
        this.errorMessage.set(`Package collected but POD generation failed: ${podError}`);
      }

      // Update local state
      this.package.set(updatedPkg);
      this.pod.set(pod);
      this.podPdfUrl.set(pdfUrl);
      this.isComplete.set(true);

    } catch (err: any) {
      console.error('Collection error:', err);
      this.errorMessage.set(err.message || 'Failed to confirm collection');
    } finally {
      this.isProcessing.set(false);
    }
  }

  downloadPodPdf(): void {
    const pdfUrl = this.podPdfUrl();
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
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

  goBack(): void {
    this.router.navigate(['/collection/scan']);
  }

  scanAnother(): void {
    this.router.navigate(['/collection/scan']);
  }
}
