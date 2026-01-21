import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { AuthChangeEvent, Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../supabase/supabase.client';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

/**
 * AuthService handles all authentication operations using Supabase Auth.
 *
 * Key features:
 * - Reactive auth state via observables
 * - Session persistence for mobile (handled by Supabase client config)
 * - Auto-redirect on auth state changes
 * - Staff accountability: all actions tied to authenticated user ID
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private authStateSubject = new BehaviorSubject<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null
  });

  /** Observable of the current auth state */
  readonly authState$: Observable<AuthState> = this.authStateSubject.asObservable();

  /** Observable of the current user */
  get user$(): Observable<User | null> {
    return new Observable(subscriber => {
      const subscription = this.authState$.subscribe(state => {
        subscriber.next(state.user);
      });
      return () => subscription.unsubscribe();
    });
  }

  /** Observable of the current session */
  get session$(): Observable<Session | null> {
    return new Observable(subscriber => {
      const subscription = this.authState$.subscribe(state => {
        subscriber.next(state.session);
      });
      return () => subscription.unsubscribe();
    });
  }

  private authListener: { data: { subscription: Subscription } } | null = null;

  constructor(private router: Router) {
    this.initializeAuth();
  }

  /**
   * Initialize auth state by checking for existing session
   * and setting up auth state change listener.
   */
  private async initializeAuth(): Promise<void> {
    try {
      // Get current session from storage (persisted for mobile)
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        this.updateState({ loading: false, error: error.message });
        return;
      }

      this.updateState({
        user: session?.user ?? null,
        session: session,
        loading: false,
        error: null
      });

      // Listen for auth state changes (login, logout, token refresh)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event: AuthChangeEvent, session: Session | null) => {
          this.handleAuthStateChange(event, session);
        }
      );

      this.authListener = { data: { subscription: subscription as unknown as Subscription } };
    } catch (err) {
      this.updateState({ loading: false, error: 'Failed to initialize authentication' });
    }
  }

  /**
   * Handle auth state changes from Supabase.
   * This includes: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED
   */
  private handleAuthStateChange(event: AuthChangeEvent, session: Session | null): void {
    this.updateState({
      user: session?.user ?? null,
      session: session,
      loading: false,
      error: null
    });

    // Navigate based on auth state
    switch (event) {
      case 'SIGNED_IN':
        this.router.navigate(['/dashboard']);
        break;
      case 'SIGNED_OUT':
        this.router.navigate(['/login']);
        break;
      case 'TOKEN_REFRESHED':
        // Session refreshed silently, no action needed
        break;
    }
  }

  /**
   * Sign in with email and password.
   * Used by staff members to authenticate.
   *
   * @param email - Staff email address
   * @param password - Staff password
   * @returns Promise resolving to user data or error
   */
  async signIn(email: string, password: string): Promise<{ user: User | null; error: AuthError | null }> {
    this.updateState({ loading: true, error: null });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      this.updateState({ loading: false, error: error.message });
      return { user: null, error };
    }

    // State will be updated by onAuthStateChange listener
    return { user: data.user, error: null };
  }

  /**
   * Sign out the current user.
   * Clears session from storage and redirects to login.
   */
  async signOut(): Promise<void> {
    this.updateState({ loading: true, error: null });

    const { error } = await supabase.auth.signOut();

    if (error) {
      this.updateState({ loading: false, error: error.message });
    }
    // State will be updated by onAuthStateChange listener
  }

  /**
   * Check if user is currently authenticated.
   * Synchronous check for guards.
   */
  isAuthenticated(): boolean {
    return this.authStateSubject.value.session !== null;
  }

  /**
   * Get the current user's ID.
   * Used for staff accountability - tying actions to user.
   */
  getCurrentUserId(): string | null {
    return this.authStateSubject.value.user?.id ?? null;
  }

  /**
   * Get the current session for API calls.
   * Used to get access token for Edge Function calls.
   */
  getCurrentSession(): Session | null {
    return this.authStateSubject.value.session;
  }

  /**
   * Get the current access token for Edge Function authorization.
   */
  getAccessToken(): string | null {
    return this.authStateSubject.value.session?.access_token ?? null;
  }

  private updateState(partial: Partial<AuthState>): void {
    this.authStateSubject.next({
      ...this.authStateSubject.value,
      ...partial
    });
  }

  ngOnDestroy(): void {
    // Clean up auth listener on service destroy
    if (this.authListener) {
      (this.authListener.data.subscription as any)?.unsubscribe?.();
    }
  }
}
