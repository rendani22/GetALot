import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom, filter, take } from 'rxjs';
import { AuthService } from './auth.service';
import { StaffService } from '../services/staff.service';

/**
 * Admin guard to protect routes that require admin role.
 * Must be used after authGuard to ensure user is authenticated.
 */
export const adminGuard: CanActivateFn = async (route, state) => {
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

  // Check if user is admin
  if (profile?.role === 'admin') {
    return true;
  }

  // Not admin, redirect to dashboard with error
  router.navigate(['/dashboard'], {
    queryParams: { error: 'unauthorized' }
  });
  return false;
};

/**
 * Role guard factory - creates a guard for specific roles.
 * @param allowedRoles Array of roles that can access the route
 */
export function roleGuard(...allowedRoles: string[]): CanActivateFn {
  return async (route, state) => {
    const authService = inject(AuthService);
    const staffService = inject(StaffService);
    const router = inject(Router);

    // Wait for auth state
    await firstValueFrom(
      authService.authState$.pipe(
        filter(authState => !authState.loading),
        take(1)
      )
    );

    if (!authService.isAuthenticated()) {
      router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
      return false;
    }

    // Wait for profile
    await firstValueFrom(
      staffService.loading$.pipe(
        filter(loading => !loading),
        take(1)
      )
    );

    let profile = await firstValueFrom(staffService.currentProfile$);
    if (!profile) {
      profile = await staffService.loadCurrentProfile();
    }

    // Check role
    if (profile && allowedRoles.includes(profile.role)) {
      return true;
    }

    router.navigate(['/dashboard'], { queryParams: { error: 'unauthorized' } });
    return false;
  };
}
