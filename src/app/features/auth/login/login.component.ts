import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * LoginComponent - Staff authentication page
 *
 * Mobile-first design optimized for touch input.
 * All staff actions require authentication for accountability.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loginForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.loginForm.controls).forEach(key => {
        this.loginForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;

    const { user, error } = await this.authService.signIn(email, password);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(this.getErrorMessage(error.message));
      return;
    }

    // Navigate to return URL or dashboard
    const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
    this.router.navigate([returnUrl]);
  }

  /**
   * Convert Supabase error codes to user-friendly messages
   */
  private getErrorMessage(errorCode: string): string {
    const errorMessages: Record<string, string> = {
      'Invalid login credentials': 'Invalid email or password. Please try again.',
      'Email not confirmed': 'Please verify your email address before logging in.',
      'User not found': 'No account found with this email address.',
      'Too many requests': 'Too many login attempts. Please try again later.',
    };

    return errorMessages[errorCode] || 'An error occurred. Please try again.';
  }

  // Getters for template validation
  get emailInvalid(): boolean {
    const control = this.loginForm.get('email');
    return control ? control.invalid && control.touched : false;
  }

  get passwordInvalid(): boolean {
    const control = this.loginForm.get('password');
    return control ? control.invalid && control.touched : false;
  }
}
