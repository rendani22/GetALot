import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { StaffService } from '../../../core/services/staff.service';
import {
  StaffProfile,
  StaffRole,
  CreateStaffProfileDto,
  ROLE_CONFIG
} from '../../../core/models/staff-profile.model';

/**
 * StaffManagementComponent - Admin interface for managing staff profiles.
 *
 * Features:
 * - View all staff profiles
 * - Create new staff with auth credentials
 * - Update staff roles and details
 * - Activate/deactivate staff
 */
@Component({
  selector: 'app-staff-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './staff-management.component.html',
  styleUrls: ['./staff-management.component.scss']
})
export class StaffManagementComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  staffService = inject(StaffService);

  // UI State
  showCreateModal = signal(false);
  showEditModal = signal(false);
  selectedStaff = signal<StaffProfile | null>(null);
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Role config for display
  roleConfig = ROLE_CONFIG;
  roles: StaffRole[] = ['warehouse', 'driver', 'collection', 'admin'];

  // Forms
  createForm: FormGroup;
  editForm: FormGroup;

  constructor() {
    this.createForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      full_name: ['', [Validators.required, Validators.minLength(2)]],
      role: ['warehouse', Validators.required],
      phone: [''],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });

    this.editForm = this.fb.group({
      full_name: ['', [Validators.required, Validators.minLength(2)]],
      role: ['', Validators.required],
      phone: [''],
      is_active: [true]
    });
  }

  async ngOnInit(): Promise<void> {
    await this.staffService.loadAllStaff();
  }

  // Modal controls
  openCreateModal(): void {
    this.createForm.reset({ role: 'warehouse' });
    this.errorMessage.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.createForm.reset();
  }

  openEditModal(staff: StaffProfile): void {
    this.selectedStaff.set(staff);
    this.editForm.patchValue({
      full_name: staff.full_name,
      role: staff.role,
      phone: staff.phone || '',
      is_active: staff.is_active
    });
    this.errorMessage.set(null);
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.selectedStaff.set(null);
    this.editForm.reset();
  }

  // CRUD operations
  async createStaff(): Promise<void> {
    if (this.createForm.invalid) {
      Object.keys(this.createForm.controls).forEach(key => {
        this.createForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const dto: CreateStaffProfileDto = this.createForm.value;
    const { profile, error } = await this.staffService.createStaff(dto);

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.successMessage.set(`Staff member "${profile?.full_name}" created successfully`);
    this.closeCreateModal();

    // Clear success message after 3 seconds
    setTimeout(() => this.successMessage.set(null), 3000);
  }

  async updateStaff(): Promise<void> {
    const staff = this.selectedStaff();
    if (!staff || this.editForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const { profile, error } = await this.staffService.updateStaff(staff.id, this.editForm.value);

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.successMessage.set(`Staff member "${profile?.full_name}" updated successfully`);
    this.closeEditModal();

    setTimeout(() => this.successMessage.set(null), 3000);
  }

  async toggleActive(staff: StaffProfile): Promise<void> {
    const action = staff.is_active ? 'deactivate' : 'reactivate';

    if (staff.is_active) {
      const { error } = await this.staffService.deactivateStaff(staff.id);
      if (error) {
        this.errorMessage.set(error);
        return;
      }
    } else {
      const { error } = await this.staffService.reactivateStaff(staff.id);
      if (error) {
        this.errorMessage.set(error);
        return;
      }
    }

    this.successMessage.set(`Staff member ${action}d successfully`);
    setTimeout(() => this.successMessage.set(null), 3000);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  // Form validation helpers
  isFieldInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return control ? control.invalid && control.touched : false;
  }

  getRoleColor(role: StaffRole): string {
    return this.roleConfig[role]?.color || '#6b7280';
  }

  getRoleLabel(role: StaffRole): string {
    return this.roleConfig[role]?.label || role;
  }
}
