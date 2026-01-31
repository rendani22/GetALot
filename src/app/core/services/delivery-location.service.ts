import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { supabase } from '../supabase/supabase.client';
import { AuthService } from '../auth';
import {
  DeliveryLocation,
  CreateDeliveryLocationDto,
  UpdateDeliveryLocationDto
} from '../models/delivery-location.model';

/**
 * DeliveryLocationService handles delivery location CRUD operations.
 *
 * Key features:
 * - Fetch all delivery locations
 * - Admin-only create/update/delete operations
 * - Search delivery locations by name
 */
@Injectable({
  providedIn: 'root'
})
export class DeliveryLocationService {
  private authService = inject(AuthService);

  private locationsSubject = new BehaviorSubject<DeliveryLocation[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  /** List of all delivery locations */
  readonly locations$ = this.locationsSubject.asObservable();

  /** Loading state */
  readonly loading$ = this.loadingSubject.asObservable();

  /** Error state */
  readonly error$ = this.errorSubject.asObservable();

  /**
   * Load all delivery locations.
   */
  async loadAllLocations(): Promise<void> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const { data, error } = await supabase
      .from('delivery_locations')
      .select('*')
      .order('name', { ascending: true });

    this.loadingSubject.next(false);

    if (error) {
      this.errorSubject.next(error.message);
      return;
    }

    this.locationsSubject.next(data as DeliveryLocation[]);
  }

  /**
   * Get a single delivery location by ID.
   */
  async getLocationById(id: string): Promise<{ location: DeliveryLocation | null; error: string | null }> {
    const { data, error } = await supabase
      .from('delivery_locations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return { location: null, error: error.message };
    }

    return { location: data as DeliveryLocation, error: null };
  }

  /**
   * Search delivery locations by name or address.
   */
  async searchLocations(query: string): Promise<DeliveryLocation[]> {
    const { data, error } = await supabase
      .from('delivery_locations')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,address.ilike.%${query}%`)
      .order('name', { ascending: true })
      .limit(20);

    if (error) {
      console.error('Error searching delivery locations:', error);
      return [];
    }

    return data as DeliveryLocation[];
  }

  /**
   * Get all active delivery locations.
   */
  async getActiveLocations(): Promise<DeliveryLocation[]> {
    const { data, error } = await supabase
      .from('delivery_locations')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching active locations:', error);
      return [];
    }

    return data as DeliveryLocation[];
  }

  /**
   * Create a new delivery location (admin only).
   */
  async createLocation(dto: CreateDeliveryLocationDto): Promise<{ location: DeliveryLocation | null; error: string | null }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const userId = this.authService.getCurrentUserId();

    const { data, error } = await supabase
      .from('delivery_locations')
      .insert({
        name: dto.name.trim(),
        address: dto.address.trim(),
        google_maps_link: dto.google_maps_link?.trim() || null,
        created_by: userId
      })
      .select()
      .single();

    this.loadingSubject.next(false);

    if (error) {
      // Handle unique constraint violations
      if (error.code === '23505') {
        if (error.message.includes('name')) {
          return { location: null, error: 'A delivery location with this name already exists' };
        }
      }
      this.errorSubject.next(error.message);
      return { location: null, error: error.message };
    }

    // Refresh the locations list
    await this.loadAllLocations();

    return { location: data as DeliveryLocation, error: null };
  }

  /**
   * Update an existing delivery location (admin only).
   */
  async updateLocation(id: string, dto: UpdateDeliveryLocationDto): Promise<{ location: DeliveryLocation | null; error: string | null }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const updateData: Record<string, unknown> = {};

    if (dto.name !== undefined) updateData['name'] = dto.name.trim();
    if (dto.address !== undefined) updateData['address'] = dto.address.trim();
    if (dto.google_maps_link !== undefined) updateData['google_maps_link'] = dto.google_maps_link?.trim() || null;
    if (dto.is_active !== undefined) updateData['is_active'] = dto.is_active;

    const { data, error } = await supabase
      .from('delivery_locations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    this.loadingSubject.next(false);

    if (error) {
      if (error.code === '23505') {
        if (error.message.includes('name')) {
          return { location: null, error: 'A delivery location with this name already exists' };
        }
      }
      this.errorSubject.next(error.message);
      return { location: null, error: error.message };
    }

    // Refresh the locations list
    await this.loadAllLocations();

    return { location: data as DeliveryLocation, error: null };
  }

  /**
   * Toggle delivery location active status (admin only).
   */
  async toggleLocationActive(id: string, isActive: boolean): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase
      .from('delivery_locations')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    // Refresh the locations list
    await this.loadAllLocations();

    return { success: true, error: null };
  }

  /**
   * Delete a delivery location (admin only).
   * Use with caution - prefer deactivating instead.
   */
  async deleteLocation(id: string): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase
      .from('delivery_locations')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    // Refresh the locations list
    await this.loadAllLocations();

    return { success: true, error: null };
  }
}
