import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { supabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { StaffService } from './staff.service';
import {
  DriverLocation,
  DriverLocationWithProfile,
  UpdateDriverLocationDto
} from '../models/driver-location.model';

/**
 * DriverLocationService handles real-time GPS tracking for drivers.
 *
 * Features:
 * - Track driver's current location using browser Geolocation API
 * - Update location to database periodically
 * - Fetch all driver locations for admin view
 * - Real-time subscription for location updates
 */
@Injectable({
  providedIn: 'root'
})
export class DriverLocationService implements OnDestroy {
  private authService = inject(AuthService);
  private staffService = inject(StaffService);

  private locationsSubject = new BehaviorSubject<DriverLocationWithProfile[]>([]);
  private trackingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private currentPositionSubject = new BehaviorSubject<GeolocationPosition | null>(null);

  private watchId: number | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private realtimeSubscription: ReturnType<typeof supabase.channel> | null = null;

  /** All driver locations (for admin) */
  readonly locations$ = this.locationsSubject.asObservable();

  /** Whether tracking is active */
  readonly tracking$ = this.trackingSubject.asObservable();

  /** Error state */
  readonly error$ = this.errorSubject.asObservable();

  /** Current position (for driver) */
  readonly currentPosition$ = this.currentPositionSubject.asObservable();

  ngOnDestroy(): void {
    this.stopTracking();
    this.unsubscribeRealtime();
  }

  /**
   * Start tracking driver's location.
   * Only available for drivers.
   */
  async startTracking(): Promise<{ success: boolean; error: string | null }> {
    if (!this.staffService.hasRole('driver')) {
      return { success: false, error: 'Only drivers can share their location' };
    }

    if (!navigator.geolocation) {
      return { success: false, error: 'Geolocation is not supported by this browser' };
    }

    return new Promise((resolve) => {
      // Request high accuracy position
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // Initial position update
          await this.updateLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading ?? undefined,
            speed: position.coords.speed ?? undefined
          });

          // Start watching position
          this.watchId = navigator.geolocation.watchPosition(
            (pos) => {
              this.currentPositionSubject.next(pos);
            },
            (error) => {
              console.error('Geolocation watch error:', error);
              this.errorSubject.next(this.getGeolocationErrorMessage(error));
            },
            {
              enableHighAccuracy: true,
              timeout: 30000,
              maximumAge: 5000
            }
          );

          // Update location to database every 10 seconds
          this.updateInterval = setInterval(async () => {
            const currentPos = this.currentPositionSubject.value;
            if (currentPos) {
              await this.updateLocation({
                latitude: currentPos.coords.latitude,
                longitude: currentPos.coords.longitude,
                accuracy: currentPos.coords.accuracy,
                heading: currentPos.coords.heading ?? undefined,
                speed: currentPos.coords.speed ?? undefined
              });
            }
          }, 10000);

          this.trackingSubject.next(true);
          this.errorSubject.next(null);
          resolve({ success: true, error: null });
        },
        (error) => {
          const errorMessage = this.getGeolocationErrorMessage(error);
          this.errorSubject.next(errorMessage);
          resolve({ success: false, error: errorMessage });
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        }
      );
    });
  }

  /**
   * Stop tracking driver's location.
   */
  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.trackingSubject.next(false);
    this.currentPositionSubject.next(null);
  }

  /**
   * Update driver's location in the database.
   */
  async updateLocation(dto: UpdateDriverLocationDto): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase.rpc('upsert_driver_location', {
        p_latitude: dto.latitude,
        p_longitude: dto.longitude,
        p_accuracy: dto.accuracy ?? null,
        p_heading: dto.heading ?? null,
        p_speed: dto.speed ?? null
      });

      if (error) {
        console.error('Error updating location:', error);
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update location';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Load all driver locations (admin only).
   */
  async loadAllLocations(): Promise<DriverLocationWithProfile[]> {
    const { data, error } = await supabase
      .from('driver_locations')
      .select(`
        *,
        driver:staff_profiles!driver_id(id, full_name, email, phone)
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading driver locations:', error);
      this.errorSubject.next(error.message);
      return [];
    }

    const locations = data as DriverLocationWithProfile[];
    this.locationsSubject.next(locations);
    return locations;
  }

  /**
   * Subscribe to real-time location updates (admin only).
   */
  subscribeToLocationUpdates(callback?: (locations: DriverLocationWithProfile[]) => void): void {
    this.unsubscribeRealtime();

    this.realtimeSubscription = supabase
      .channel('driver_locations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations'
        },
        async () => {
          // Reload all locations on any change
          const locations = await this.loadAllLocations();
          if (callback) {
            callback(locations);
          }
        }
      )
      .subscribe();
  }

  /**
   * Unsubscribe from real-time updates.
   */
  unsubscribeRealtime(): void {
    if (this.realtimeSubscription) {
      supabase.removeChannel(this.realtimeSubscription);
      this.realtimeSubscription = null;
    }
  }

  /**
   * Get drivers with active locations (within last 5 minutes).
   */
  getActiveDriverLocations(): DriverLocationWithProfile[] {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.locationsSubject.value.filter(
      loc => new Date(loc.updated_at) > fiveMinutesAgo
    );
  }

  /**
   * Check if geolocation is supported.
   */
  isGeolocationSupported(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * Get human-readable error message for geolocation errors.
   */
  private getGeolocationErrorMessage(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location permission denied. Please enable location access in your browser settings.';
      case error.POSITION_UNAVAILABLE:
        return 'Location information is unavailable. Please check your device\'s GPS settings.';
      case error.TIMEOUT:
        return 'Location request timed out. Please try again.';
      default:
        return 'An unknown error occurred while getting your location.';
    }
  }
}
