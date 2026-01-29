import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { supabase } from '../supabase/supabase.client';
import { AuthService } from '../auth';
import {
  ReceiverProfile,
  CreateReceiverProfileDto,
  UpdateReceiverProfileDto,
  getReceiverFullName
} from '../models/receiver-profile.model';

/**
 * ReceiverService handles receiver profile CRUD operations.
 *
 * Key features:
 * - Fetch all receivers
 * - Admin-only create/update/delete operations
 * - Search receivers by name or employee number
 */
@Injectable({
  providedIn: 'root'
})
export class ReceiverService {
  private authService = inject(AuthService);

  private receiversSubject = new BehaviorSubject<ReceiverProfile[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  /** List of all receiver profiles */
  readonly receivers$ = this.receiversSubject.asObservable();

  /** Loading state */
  readonly loading$ = this.loadingSubject.asObservable();

  /** Error state */
  readonly error$ = this.errorSubject.asObservable();

  /**
   * Load all receiver profiles.
   */
  async loadAllReceivers(): Promise<void> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const { data, error } = await supabase
      .from('receiver_profiles')
      .select('*')
      .order('surname', { ascending: true })
      .order('name', { ascending: true });

    this.loadingSubject.next(false);

    if (error) {
      this.errorSubject.next(error.message);
      return;
    }

    this.receiversSubject.next(data as ReceiverProfile[]);
  }

  /**
   * Get a single receiver by ID.
   */
  async getReceiverById(id: string): Promise<{ receiver: ReceiverProfile | null; error: string | null }> {
    const { data, error } = await supabase
      .from('receiver_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return { receiver: null, error: error.message };
    }

    return { receiver: data as ReceiverProfile, error: null };
  }

  /**
   * Search receivers by name, surname, or employee number.
   */
  async searchReceivers(query: string): Promise<ReceiverProfile[]> {
    const { data, error } = await supabase
      .from('receiver_profiles')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,surname.ilike.%${query}%,employee_number.ilike.%${query}%,email.ilike.%${query}%`)
      .order('surname', { ascending: true })
      .limit(20);

    if (error) {
      console.error('Error searching receivers:', error);
      return [];
    }

    return data as ReceiverProfile[];
  }

  /**
   * Create a new receiver profile (admin only).
   */
  async createReceiver(dto: CreateReceiverProfileDto): Promise<{ receiver: ReceiverProfile | null; error: string | null }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const userId = this.authService.getCurrentUserId();

    const { data, error } = await supabase
      .from('receiver_profiles')
      .insert({
        name: dto.name.trim(),
        surname: dto.surname.trim(),
        employee_number: dto.employee_number.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        created_by: userId
      })
      .select()
      .single();

    this.loadingSubject.next(false);

    if (error) {
      // Handle unique constraint violations
      if (error.code === '23505') {
        if (error.message.includes('employee_number')) {
          return { receiver: null, error: 'An employee with this employee number already exists' };
        }
        if (error.message.includes('email')) {
          return { receiver: null, error: 'An employee with this email already exists' };
        }
      }
      this.errorSubject.next(error.message);
      return { receiver: null, error: error.message };
    }

    // Refresh the receivers list
    await this.loadAllReceivers();

    return { receiver: data as ReceiverProfile, error: null };
  }

  /**
   * Update an existing receiver profile (admin only).
   */
  async updateReceiver(id: string, dto: UpdateReceiverProfileDto): Promise<{ receiver: ReceiverProfile | null; error: string | null }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const updateData: Record<string, unknown> = {};

    if (dto.name !== undefined) updateData['name'] = dto.name.trim();
    if (dto.surname !== undefined) updateData['surname'] = dto.surname.trim();
    if (dto.employee_number !== undefined) updateData['employee_number'] = dto.employee_number.trim();
    if (dto.email !== undefined) updateData['email'] = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) updateData['phone'] = dto.phone?.trim() || null;
    if (dto.is_active !== undefined) updateData['is_active'] = dto.is_active;

    const { data, error } = await supabase
      .from('receiver_profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    this.loadingSubject.next(false);

    if (error) {
      if (error.code === '23505') {
        if (error.message.includes('employee_number')) {
          return { receiver: null, error: 'An employee with this employee number already exists' };
        }
        if (error.message.includes('email')) {
          return { receiver: null, error: 'An employee with this email already exists' };
        }
      }
      this.errorSubject.next(error.message);
      return { receiver: null, error: error.message };
    }

    // Refresh the receivers list
    await this.loadAllReceivers();

    return { receiver: data as ReceiverProfile, error: null };
  }

  /**
   * Toggle receiver active status (admin only).
   */
  async toggleReceiverActive(id: string, isActive: boolean): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase
      .from('receiver_profiles')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    // Refresh the receivers list
    await this.loadAllReceivers();

    return { success: true, error: null };
  }

  /**
   * Delete a receiver profile (admin only).
   * Use with caution - prefer deactivating instead.
   */
  async deleteReceiver(id: string): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase
      .from('receiver_profiles')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    // Refresh the receivers list
    await this.loadAllReceivers();

    return { success: true, error: null };
  }

  /**
   * Get the full name of a receiver.
   */
  getFullName(receiver: ReceiverProfile): string {
    return getReceiverFullName(receiver);
  }
}
