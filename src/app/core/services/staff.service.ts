import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { supabase } from '../supabase/supabase.client';
import { AuthService } from '../auth';
import {
  StaffProfile,
  StaffRole,
  CreateStaffProfileDto,
  UpdateStaffProfileDto
} from '../models/staff-profile.model';

/**
 * StaffService handles staff profile CRUD operations.
 *
 * Key features:
 * - Fetches current user's profile on init
 * - Admin-only create/update/delete operations
 * - Role-based access checks
 */
@Injectable({
  providedIn: 'root'
})
export class StaffService {
  private authService = inject(AuthService);

  private currentProfileSubject = new BehaviorSubject<StaffProfile | null>(null);
  private staffListSubject = new BehaviorSubject<StaffProfile[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  /** Current user's staff profile */
  readonly currentProfile$ = this.currentProfileSubject.asObservable();

  /** List of all staff profiles (for admin view) */
  readonly staffList$ = this.staffListSubject.asObservable();

  /** Loading state */
  readonly loading$ = this.loadingSubject.asObservable();

  /** Error state */
  readonly error$ = this.errorSubject.asObservable();

  constructor() {
    // Load current user's profile when auth state changes
    this.authService.authState$.subscribe(async (authState) => {
      if (authState.user && !authState.loading) {
        await this.loadCurrentProfile();
      } else if (!authState.user) {
        this.currentProfileSubject.next(null);
      }
    });
  }

  /**
   * Check if current user has admin role.
   */
  isAdmin(): boolean {
    return this.currentProfileSubject.value?.role === 'admin';
  }

  /**
   * Check if current user has a specific role.
   */
  hasRole(role: StaffRole): boolean {
    return this.currentProfileSubject.value?.role === role;
  }

  /**
   * Load the current authenticated user's staff profile.
   */
  async loadCurrentProfile(): Promise<StaffProfile | null> {
    const userId = this.authService.getCurrentUserId();
    if (!userId) return null;

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const { data, error } = await supabase
      .from('staff_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    this.loadingSubject.next(false);

    if (error) {
      // Profile might not exist yet for new users
      if (error.code === 'PGRST116') {
        this.currentProfileSubject.next(null);
        return null;
      }
      this.errorSubject.next(error.message);
      return null;
    }

    this.currentProfileSubject.next(data as StaffProfile);
    return data as StaffProfile;
  }

  /**
   * Load all staff profiles (admin only via RLS).
   */
  async loadAllStaff(): Promise<StaffProfile[]> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const { data, error } = await supabase
      .from('staff_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    this.loadingSubject.next(false);

    if (error) {
      this.errorSubject.next(error.message);
      return [];
    }

    this.staffListSubject.next(data as StaffProfile[]);
    return data as StaffProfile[];
  }

  /**
   * Create a new staff profile with auth user.
   * Admin only - creates both auth user and profile.
   *
   * Note: In production, this should be done via an Edge Function
   * to properly create the auth user with admin privileges.
   */
  async createStaff(dto: CreateStaffProfileDto): Promise<{ profile: StaffProfile | null; error: string | null }> {
    if (!this.isAdmin()) {
      return { profile: null, error: 'Only admins can create staff profiles' };
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    // Call Edge Function to create user and profile
    const { data, error } = await supabase.functions.invoke('create-staff', {
      body: dto
    });

    this.loadingSubject.next(false);

    if (error) {
      this.errorSubject.next(error.message);
      return { profile: null, error: error.message };
    }

    if (data?.error) {
      this.errorSubject.next(data.error);
      return { profile: null, error: data.error };
    }

    // Refresh staff list
    await this.loadAllStaff();

    return { profile: data.profile as StaffProfile, error: null };
  }

  /**
   * Update an existing staff profile.
   * Admin only via RLS.
   */
  async updateStaff(id: string, dto: UpdateStaffProfileDto): Promise<{ profile: StaffProfile | null; error: string | null }> {
    if (!this.isAdmin()) {
      return { profile: null, error: 'Only admins can update staff profiles' };
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const { data, error } = await supabase
      .from('staff_profiles')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    this.loadingSubject.next(false);

    if (error) {
      this.errorSubject.next(error.message);
      return { profile: null, error: error.message };
    }

    // Refresh staff list
    await this.loadAllStaff();

    return { profile: data as StaffProfile, error: null };
  }

  /**
   * Deactivate a staff profile (soft delete).
   * Admin only via RLS.
   */
  async deactivateStaff(id: string): Promise<{ success: boolean; error: string | null }> {
    const result = await this.updateStaff(id, { is_active: false });
    return { success: result.profile !== null, error: result.error };
  }

  /**
   * Reactivate a staff profile.
   * Admin only via RLS.
   */
  async reactivateStaff(id: string): Promise<{ success: boolean; error: string | null }> {
    const result = await this.updateStaff(id, { is_active: true });
    return { success: result.profile !== null, error: result.error };
  }
}
