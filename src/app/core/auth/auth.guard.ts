import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { firstValueFrom, filter, map, take } from 'rxjs';

/**
 * Auth guard to protect routes from unauthenticated access.
 *
 * Usage in routes:
 * { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] }
 *
 * Redirects unauthenticated users to /login with return URL stored.
 */
export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth state to finish loading
  await firstValueFrom(
    authService.authState$.pipe(
      filter(authState => !authState.loading),
      take(1)
    )
  );

  if (authService.isAuthenticated()) {
    return true;
  }

  // Store the attempted URL for redirecting after login
  router.navigate(['/login'], {
    queryParams: { returnUrl: state.url }
  });

  return false;
};

/**
 * Public guard for routes that should only be accessible to non-authenticated users.
 * (e.g., login page - redirect to dashboard if already logged in)
 */
export const publicGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth state to finish loading
  await firstValueFrom(
    authService.authState$.pipe(
      filter(authState => !authState.loading),
      take(1)
    )
  );

  if (authService.isAuthenticated()) {
    // Already logged in, redirect to dashboard
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};
