import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom, filter, take } from 'rxjs';
import { AuthService } from './auth.service';
import { StaffService } from '../services/staff.service';

/**
 * Collection guard to protect routes that require collection point access.
 * Allows warehouse staff and admins to access collection features.
 */
export const collectionGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const staffService = inject(StaffService);
  const router = inject(Router);

  // Wait for auth state to finish loading
  await firstValueFrom(
    authService.authState$.pipe(
      filter(authState => !authState.loading),
      take(1)
    )
  );

  // If not authenticated, redirect to login
  if (!authService.isAuthenticated()) {
    router.navigate(['/login'], {
      queryParams: { returnUrl: state.url }
    });
    return false;
  }

  // Wait for profile to load
  await firstValueFrom(
    staffService.loading$.pipe(
      filter(loading => !loading),
      take(1)
    )
  );

  // Ensure profile is loaded
  let profile = await firstValueFrom(staffService.currentProfile$);
  if (!profile) {
    profile = await staffService.loadCurrentProfile();
  }

  // Check if user has collection access (warehouse, driver, or admin)
  if (profile?.role === 'warehouse' || profile?.role === 'driver' || profile?.role === 'admin') {
    return true;
  }

  // Not authorized, redirect to dashboard with error
  router.navigate(['/dashboard'], {
    queryParams: { error: 'unauthorized' }
  });
  return false;
};
