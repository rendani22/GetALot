import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PackageService } from '../../../core/services/package.service';
import { ReceiverService } from '../../../core/services/receiver.service';
import { DeliveryLocationService } from '../../../core/services/delivery-location.service';
import { Package, PackageItem, PACKAGE_STATUS_CONFIG } from '../../../core/models/package.model';
import { ReceiverProfile } from '../../../core/models/receiver-profile.model';
import { DeliveryLocation } from '../../../core/models/delivery-location.model';
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
  private deliveryLocationService = inject(DeliveryLocationService);

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

  // Delivery Locations
  deliveryLocations = signal<DeliveryLocation[]>([]);
  loadingLocations = signal(true);

  // Status config for display
  statusConfig = PACKAGE_STATUS_CONFIG;

  // Form
  packageForm: FormGroup;

  constructor() {
    this.packageForm = this.fb.group({
      receiver_id: ['', [Validators.required]],
      delivery_location_id: ['', [Validators.required]],
      po_number: ['', [Validators.required]],
      notes: [''],
      items: this.fb.array([])
    });
    // Add one empty item row by default
    this.addItem();
  }

  /** Get the items FormArray */
  get items(): FormArray {
    return this.packageForm.get('items') as FormArray;
  }

  /** Create a new item FormGroup */
  createItemFormGroup(): FormGroup {
    return this.fb.group({
      quantity: [1, [Validators.required, Validators.min(1)]],
      description: ['', [Validators.required]]
    });
  }

  /** Add a new item row */
  addItem(): void {
    this.items.push(this.createItemFormGroup());
  }

  /** Remove an item row by index */
  removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
    } else {
      // Reset the last item instead of removing
      this.items.at(0).reset({ quantity: 1, description: '' });
    }
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadReceivers(),
      this.loadDeliveryLocations()
    ]);
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

  private async loadDeliveryLocations(): Promise<void> {
    this.loadingLocations.set(true);
    const locations = await this.deliveryLocationService.getActiveLocations();
    this.deliveryLocations.set(locations);
    this.loadingLocations.set(false);
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

    const { receiver_id, delivery_location_id, po_number, notes, items } = this.packageForm.value;

    // Get the receiver's email from the selected receiver
    const receiver = this.receivers().find(r => r.id === receiver_id);
    if (!receiver) {
      this.errorMessage.set('Please select a valid receiver');
      this.isSubmitting.set(false);
      return;
    }

    // Filter out empty items
    const validItems = (items as { quantity: number; description: string }[])
      .filter(item => item.description?.trim())
      .map(item => ({
        quantity: item.quantity || 1,
        description: item.description.trim()
      }));

    const result = await this.packageService.createPackage({
      receiver_email: receiver.email,
      notes: notes?.trim() || undefined,
      items: validItems.length > 0 ? validItems : undefined,
      delivery_location_id: delivery_location_id || undefined,
      po_number: po_number?.trim() || undefined
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
    // Reset items to a single empty row
    this.items.clear();
    this.addItem();
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
