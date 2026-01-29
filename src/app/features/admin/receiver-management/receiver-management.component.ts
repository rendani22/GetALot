import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ReceiverService } from '../../../core/services/receiver.service';
import {
  ReceiverProfile,
  CreateReceiverProfileDto
} from '../../../core/models/receiver-profile.model';

/**
 * ReceiverManagementComponent - Admin interface for managing receiver profiles.
 *
 * Features:
 * - View all receiver profiles
 * - Create new receivers
 * - Update receiver details
 * - Activate/deactivate receivers
 */
@Component({
  selector: 'app-receiver-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './receiver-management.component.html',
  styleUrls: ['./receiver-management.component.scss']
})
export class ReceiverManagementComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  receiverService = inject(ReceiverService);

  // UI State
  showCreateModal = signal(false);
  showEditModal = signal(false);
  selectedReceiver = signal<ReceiverProfile | null>(null);
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  searchQuery = signal('');

  // Forms
  createForm: FormGroup;
  editForm: FormGroup;

  constructor() {
    this.createForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      surname: ['', [Validators.required, Validators.minLength(2)]],
      employee_number: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['']
    });

    this.editForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      surname: ['', [Validators.required, Validators.minLength(2)]],
      employee_number: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      is_active: [true]
    });
  }

  async ngOnInit(): Promise<void> {
    await this.receiverService.loadAllReceivers();
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

  openEditModal(receiver: ReceiverProfile): void {
    this.selectedReceiver.set(receiver);
    this.editForm.patchValue({
      name: receiver.name,
      surname: receiver.surname,
      employee_number: receiver.employee_number,
      email: receiver.email,
      phone: receiver.phone || '',
      is_active: receiver.is_active
    });
    this.errorMessage.set(null);
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.selectedReceiver.set(null);
    this.editForm.reset();
  }

  // CRUD operations
  async createReceiver(): Promise<void> {
    if (this.createForm.invalid) {
      Object.keys(this.createForm.controls).forEach(key => {
        this.createForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const dto: CreateReceiverProfileDto = this.createForm.value;
    const { receiver, error } = await this.receiverService.createReceiver(dto);

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.successMessage.set(`Receiver "${receiver?.name} ${receiver?.surname}" created successfully`);
    this.closeCreateModal();

    // Clear success message after 3 seconds
    setTimeout(() => this.successMessage.set(null), 3000);
  }

  async updateReceiver(): Promise<void> {
    const receiver = this.selectedReceiver();
    if (!receiver || this.editForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const { receiver: updated, error } = await this.receiverService.updateReceiver(receiver.id, this.editForm.value);

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.successMessage.set(`Receiver "${updated?.name} ${updated?.surname}" updated successfully`);
    this.closeEditModal();

    setTimeout(() => this.successMessage.set(null), 3000);
  }

  async toggleActive(receiver: ReceiverProfile): Promise<void> {
    const newStatus = !receiver.is_active;
    const { error } = await this.receiverService.toggleReceiverActive(receiver.id, newStatus);

    if (error) {
      this.errorMessage.set(error);
      setTimeout(() => this.errorMessage.set(null), 3000);
      return;
    }

    const action = newStatus ? 'activated' : 'deactivated';
    this.successMessage.set(`Receiver "${receiver.name} ${receiver.surname}" ${action}`);
    setTimeout(() => this.successMessage.set(null), 3000);
  }

  // Helper methods
  isFieldInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return control ? control.invalid && control.touched : false;
  }

  getInitials(receiver: ReceiverProfile): string {
    return `${receiver.name.charAt(0)}${receiver.surname.charAt(0)}`.toUpperCase();
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
