import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DeliveryLocationService } from '../../../core/services/delivery-location.service';
import {
  DeliveryLocation,
  CreateDeliveryLocationDto
} from '../../../core/models/delivery-location.model';

/**
 * DeliveryLocationManagementComponent - Admin interface for managing delivery locations.
 *
 * Features:
 * - View all delivery locations
 * - Create new delivery locations with Google Maps links
 * - Update location details
 * - Activate/deactivate locations
 */
@Component({
  selector: 'app-delivery-location-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './delivery-location-management.component.html',
  styleUrls: ['./delivery-location-management.component.scss']
})
export class DeliveryLocationManagementComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  locationService = inject(DeliveryLocationService);

  // UI State
  showCreateModal = signal(false);
  showEditModal = signal(false);
  selectedLocation = signal<DeliveryLocation | null>(null);
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Forms
  createForm: FormGroup;
  editForm: FormGroup;

  constructor() {
    this.createForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      address: ['', [Validators.required, Validators.minLength(5)]],
      google_maps_link: ['']
    });

    this.editForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      address: ['', [Validators.required, Validators.minLength(5)]],
      google_maps_link: [''],
      is_active: [true]
    });
  }

  async ngOnInit(): Promise<void> {
    await this.locationService.loadAllLocations();
  }

  // Modal controls
  openCreateModal(): void {
    this.createForm.reset();
    this.errorMessage.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.createForm.reset();
  }

  openEditModal(location: DeliveryLocation): void {
    this.selectedLocation.set(location);
    this.editForm.patchValue({
      name: location.name,
      address: location.address,
      google_maps_link: location.google_maps_link || '',
      is_active: location.is_active
    });
    this.errorMessage.set(null);
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.selectedLocation.set(null);
    this.editForm.reset();
  }

  // CRUD operations
  async createLocation(): Promise<void> {
    if (this.createForm.invalid) {
      Object.keys(this.createForm.controls).forEach(key => {
        this.createForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const dto: CreateDeliveryLocationDto = this.createForm.value;
    const { location, error } = await this.locationService.createLocation(dto);

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.successMessage.set(`Delivery location "${location?.name}" created successfully`);
    this.closeCreateModal();

    // Clear success message after 3 seconds
    setTimeout(() => this.successMessage.set(null), 3000);
  }

  async updateLocation(): Promise<void> {
    const location = this.selectedLocation();
    if (!location || this.editForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const { location: updated, error } = await this.locationService.updateLocation(location.id, this.editForm.value);

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.successMessage.set(`Delivery location "${updated?.name}" updated successfully`);
    this.closeEditModal();

    setTimeout(() => this.successMessage.set(null), 3000);
  }

  async toggleActive(location: DeliveryLocation): Promise<void> {
    const newStatus = !location.is_active;
    const { error } = await this.locationService.toggleLocationActive(location.id, newStatus);

    if (error) {
      this.errorMessage.set(error);
      setTimeout(() => this.errorMessage.set(null), 3000);
      return;
    }

    const action = newStatus ? 'activated' : 'deactivated';
    this.successMessage.set(`Delivery location "${location.name}" ${action}`);
    setTimeout(() => this.successMessage.set(null), 3000);
  }

  // Helper methods
  isFieldInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return control ? control.invalid && control.touched : false;
  }

  getInitials(location: DeliveryLocation): string {
    const words = location.name.split(' ');
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return location.name.substring(0, 2).toUpperCase();
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  openGoogleMaps(link: string | null): void {
    if (link) {
      window.open(link, '_blank');
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
