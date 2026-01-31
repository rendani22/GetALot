import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { supabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import {
  Package,
  CreatePackageDto,
  UpdatePackageDto
} from '../models/package.model';
import { environment } from '../../../environments/environment';

/**
 * Response from create-package Edge Function
 */
interface CreatePackageResponse {
  package: Package;
  email_sent: boolean;
  email_error: string | null;
}

/**
 * PackageService handles package CRUD operations.
 *
 * Key features:
 * - Create packages (warehouse/admin only)
 * - List and filter packages
 * - Update package status
 */
@Injectable({
  providedIn: 'root'
})
export class PackageService {
  private authService = inject(AuthService);

  private packagesSubject = new BehaviorSubject<Package[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  /** List of packages */
  readonly packages$ = this.packagesSubject.asObservable();

  /** Loading state */
  readonly loading$ = this.loadingSubject.asObservable();

  /** Error state */
  readonly error$ = this.errorSubject.asObservable();

  /**
   * Create a new package via Edge Function.
   * Handles email notification and audit logging.
   */
  async createPackage(dto: CreatePackageDto): Promise<{
    package: Package | null;
    emailSent: boolean;
    error: string | null;
  }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        return { package: null, emailSent: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${environment.supabase.url}/functions/v1/create-package`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify(dto)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || data.details || 'Failed to create package';
        this.errorSubject.next(errorMessage);
        return { package: null, emailSent: false, error: errorMessage };
      }

      const result = data as CreatePackageResponse;

      // Add to local list
      const currentPackages = this.packagesSubject.value;
      this.packagesSubject.next([result.package, ...currentPackages]);

      return {
        package: result.package,
        emailSent: result.email_sent,
        error: result.email_error
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create package';
      this.errorSubject.next(errorMessage);
      return { package: null, emailSent: false, error: errorMessage };
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Load all packages (with optional filters).
   */
  async loadPackages(filters?: {
    status?: string;
    search?: string;
    limit?: number;
  }): Promise<void> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    let query = supabase
      .from('packages')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.search) {
      query = query.or(`reference.ilike.%${filters.search}%,receiver_email.ilike.%${filters.search}%`);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    this.loadingSubject.next(false);

    if (error) {
      this.errorSubject.next(error.message);
      return;
    }

    this.packagesSubject.next(data || []);
  }

  /**
   * Get a single package by ID.
   */
  async getPackage(id: string): Promise<{ package: Package | null; error: string | null }> {
    const { data, error } = await supabase
      .from('packages')
      .select('*, items:package_items(id, quantity, description)')
      .eq('id', id)
      .single();

    if (error) {
      return { package: null, error: error.message };
    }

    return { package: data, error: null };
  }

  /**
   * Get a package by reference.
   */
  async getPackageByReference(reference: string): Promise<{ package: Package | null; error: string | null }> {
    const { data, error } = await supabase
      .from('packages')
      .select('*, items:package_items(id, quantity, description)')
      .eq('reference', reference.toUpperCase())
      .single();

    if (error) {
      return { package: null, error: error.message };
    }

    return { package: data, error: null };
  }

  /**
   * Update a package via Edge Function.
   * Enforces lock checks - locked packages cannot be modified.
   */
  async updatePackage(id: string, dto: UpdatePackageDto): Promise<{
    package: Package | null;
    error: string | null;
    isLocked?: boolean;
  }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        return { package: null, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${environment.supabase.url}/functions/v1/update-package`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({
            package_id: id,
            ...dto
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || data.details || 'Failed to update package';
        this.errorSubject.next(errorMessage);

        // Check if it's a lock error
        if (response.status === 403 && data.error === 'Package is locked') {
          return {
            package: null,
            error: errorMessage,
            isLocked: true
          };
        }

        return { package: null, error: errorMessage };
      }

      const updatedPackage = data.package as Package;

      // Update local list
      const currentPackages = this.packagesSubject.value;
      const updatedPackages = currentPackages.map(p =>
        p.id === id ? updatedPackage : p
      );
      this.packagesSubject.next(updatedPackages);

      return { package: updatedPackage, error: null };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update package';
      this.errorSubject.next(errorMessage);
      return { package: null, error: errorMessage };
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Check if a package has a locked POD.
   */
  async isPackageLocked(packageId: string): Promise<boolean> {
    const { data } = await supabase
      .rpc('is_pod_locked', { p_package_id: packageId });

    return data === true;
  }

  /**
   * Get the lock status details for a package.
   */
  async getPackageLockStatus(packageId: string): Promise<{
    isLocked: boolean;
    lockedAt: string | null;
    podReference: string | null;
    pdfUrl: string | null;
  } | null> {
    const { data, error } = await supabase
      .rpc('get_pod_lock_status', { p_package_id: packageId });

    if (error || !data || data.length === 0) {
      return null;
    }

    const status = data[0];
    return {
      isLocked: status.is_locked,
      lockedAt: status.locked_at,
      podReference: status.pod_reference,
      pdfUrl: status.pdf_url
    };
  }

  /**
   * Get recent packages created by current user.
   */
  async getMyRecentPackages(limit = 5): Promise<Package[]> {
    const userId = this.authService.getCurrentUserId();
    if (!userId) return [];

    const { data } = await supabase
      .from('packages')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return data || [];
  }

  /**
   * Driver picks up package for delivery.
   * Marks package as in_transit and sends "On the Way" email.
   */
  async driverPickup(packageId: string): Promise<{
    package: Package | null;
    emailSent: boolean;
    error: string | null;
  }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      // Force refresh the session to get a new valid token
      const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        console.error('Session refresh error in driverPickup:', refreshError);
        // Fall back to getting the current session
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) {
          return { package: null, emailSent: false, error: 'Session expired. Please log in again.' };
        }
      }

      const activeSession = session || (await supabase.auth.getSession()).data.session;

      if (!activeSession) {
        return { package: null, emailSent: false, error: 'Not authenticated' };
      }

      console.log('Calling driver-pickup with token:', activeSession.access_token.substring(0, 20) + '...');
      console.log('Token expires at:', new Date(activeSession.expires_at! * 1000).toISOString());
      console.log('Current time:', new Date().toISOString());

      const response = await fetch(
        `${environment.supabase.url}/functions/v1/driver-pickup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeSession.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({ package_id: packageId })
        }
      );

      let data;
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error('Failed to parse response:', responseText);
        data = { error: responseText };
      }

      console.log('driver-pickup response:', response.status, data);

      if (!response.ok) {
        const errorMessage = data.error || data.details || 'Failed to pickup package';
        this.errorSubject.next(errorMessage);
        return { package: null, emailSent: false, error: errorMessage };
      }

      const updatedPackage = data.package as Package;

      // Update local list
      const currentPackages = this.packagesSubject.value;
      const updatedPackages = currentPackages.map(p =>
        p.id === packageId ? updatedPackage : p
      );
      this.packagesSubject.next(updatedPackages);

      return {
        package: updatedPackage,
        emailSent: data.email_sent,
        error: data.email_error
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to pickup package';
      this.errorSubject.next(errorMessage);
      return { package: null, emailSent: false, error: errorMessage };
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Collection point staff receives package.
   * Marks package as ready_for_collection and sends "Ready for Collection" email.
   */
  async receiveAtCollection(packageId: string): Promise<{
    package: Package | null;
    emailSent: boolean;
    error: string | null;
  }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        return { package: null, emailSent: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${environment.supabase.url}/functions/v1/receive-at-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({ package_id: packageId })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || data.details || 'Failed to receive package';
        this.errorSubject.next(errorMessage);
        return { package: null, emailSent: false, error: errorMessage };
      }

      const updatedPackage = data.package as Package;

      // Update local list
      const currentPackages = this.packagesSubject.value;
      const updatedPackages = currentPackages.map(p =>
        p.id === packageId ? updatedPackage : p
      );
      this.packagesSubject.next(updatedPackages);

      return {
        package: updatedPackage,
        emailSent: data.email_sent,
        error: data.email_error
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to receive package';
      this.errorSubject.next(errorMessage);
      return { package: null, emailSent: false, error: errorMessage };
    } finally {
      this.loadingSubject.next(false);
    }
  }
}
