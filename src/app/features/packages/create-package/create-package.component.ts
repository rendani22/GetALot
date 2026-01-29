import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PackageService } from '../../../core/services/package.service';
import { ReceiverService } from '../../../core/services/receiver.service';
import { Package, PACKAGE_STATUS_CONFIG } from '../../../core/models/package.model';
import { ReceiverProfile } from '../../../core/models/receiver-profile.model';
import { QrCodeComponent } from '../../../shared/components/qr-code/qr-code.component';

/**
 * CreatePackageComponent - Form for warehouse staff to register new packages.
 *
 * Features:
 * - Select receiver from active receivers list
 * - Optional package notes
 * - Auto-generates unique reference
 * - Generates QR code for package
 * - Sends email notification to receiver
 * - Records audit log
 */
@Component({
  selector: 'app-create-package',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, QrCodeComponent],
  templateUrl: './create-package.component.html',
  styleUrls: ['./create-package.component.scss']
})
export class CreatePackageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private packageService = inject(PackageService);
  private receiverService = inject(ReceiverService);

  // UI State
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  createdPackage = signal<Package | null>(null);
  emailSent = signal<boolean>(false);
  emailWarning = signal<string | null>(null);

  // Receivers
  receivers = signal<ReceiverProfile[]>([]);
  loadingReceivers = signal(true);

  // Status config for display
  statusConfig = PACKAGE_STATUS_CONFIG;

  // Form
  packageForm: FormGroup;

  constructor() {
    this.packageForm = this.fb.group({
      receiver_id: ['', [Validators.required]],
      notes: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadReceivers();
  }

  private async loadReceivers(): Promise<void> {
    this.loadingReceivers.set(true);
    await this.receiverService.loadAllReceivers();

    // Subscribe to receivers and filter active ones
    this.receiverService.receivers$.subscribe(allReceivers => {
      const activeReceivers = allReceivers.filter(r => r.is_active);
      this.receivers.set(activeReceivers);
      this.loadingReceivers.set(false);
    });
  }

  getSelectedReceiverEmail(): string {
    const receiverId = this.packageForm.get('receiver_id')?.value;
    const receiver = this.receivers().find(r => r.id === receiverId);
    return receiver?.email || '';
  }

  async onSubmit(): Promise<void> {
    if (this.packageForm.invalid) {
      Object.keys(this.packageForm.controls).forEach(key => {
        this.packageForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.createdPackage.set(null);
    this.emailWarning.set(null);

    const { receiver_id, notes } = this.packageForm.value;

    // Get the receiver's email from the selected receiver
    const receiver = this.receivers().find(r => r.id === receiver_id);
    if (!receiver) {
      this.errorMessage.set('Please select a valid receiver');
      this.isSubmitting.set(false);
      return;
    }

    const result = await this.packageService.createPackage({
      receiver_email: receiver.email,
      notes: notes?.trim() || undefined
    });

    this.isSubmitting.set(false);

    if (result.error && !result.package) {
      this.errorMessage.set(result.error);
      return;
    }

    if (result.package) {
      this.createdPackage.set(result.package);
      this.emailSent.set(result.emailSent);
      this.successMessage.set(`Package ${result.package.reference} created successfully!`);

      if (!result.emailSent && result.error) {
        this.emailWarning.set(result.error);
      }

      // Reset form for next package
      this.packageForm.reset();
    }
  }

  createAnother(): void {
    this.createdPackage.set(null);
    this.successMessage.set(null);
    this.emailSent.set(false);
    this.emailWarning.set(null);
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
