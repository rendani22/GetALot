import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StaffService } from '../../core/services/staff.service';
import { ROLE_CONFIG } from '../../core/models/staff-profile.model';

/**
 * DashboardComponent - Main authenticated landing page
 *
 * Displays staff info, role, and provides navigation based on role.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard-container">
      <header class="dashboard-header">
        <h1>POD System</h1>
        <button class="logout-btn" (click)="logout()">Sign Out</button>
      </header>

      <main class="dashboard-content">
        <div class="welcome-card">
          @if (staffService.currentProfile$ | async; as profile) {
            <div class="profile-header">
              <div class="avatar" [style.background-color]="getRoleColor(profile.role)">
                {{ profile.full_name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <h2>Welcome, {{ profile.full_name }}!</h2>
                <span class="role-badge" [style.background-color]="getRoleColor(profile.role)">
                  {{ roleConfig[profile.role].label }}
                </span>
              </div>
            </div>
            <p class="email">{{ profile.email }}</p>
          } @else {
            @if (authService.authState$ | async; as authState) {
              <h2>Welcome!</h2>
              <p>Logged in as: <strong>{{ authState.user?.email }}</strong></p>
              <p class="note">Setting up your profile...</p>
            }
          }
        </div>

        <!-- Warehouse Quick Actions (warehouse and admin) -->
        @if (staffService.hasRole('warehouse') || staffService.isAdmin()) {
          <div class="section">
            <h3>Warehouse</h3>
            <div class="action-grid">
              <a routerLink="/packages" class="action-card">
                <div class="action-icon packages">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
                <span>View Packages</span>
              </a>
              <a routerLink="/packages/create" class="action-card">
                <div class="action-icon warehouse">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <span>Create Package</span>
              </a>
              <a routerLink="/collection/scan" class="action-card">
                <div class="action-icon collection">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                  </svg>
                </div>
                <span>Scan Package</span>
              </a>
            </div>
          </div>
        }

        <!-- Admin Quick Actions -->
        @if (staffService.isAdmin()) {
          <div class="section">
            <h3>Administration</h3>
            <div class="action-grid">
              <a routerLink="/admin/staff" class="action-card">
                <div class="action-icon admin">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </div>
                <span>Manage Staff</span>
              </a>
            </div>
          </div>
        }

        <p class="info-text">
          All actions you perform are logged for accountability and audit purposes.
        </p>
      </main>
    </div>
  `,
  styles: [`
    .dashboard-container {
      min-height: 100vh;
      background: #f3f4f6;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: #1e3a5f;
      color: white;

      h1 {
        margin: 0;
        font-size: 1.25rem;
      }
    }

    .logout-btn {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      color: #1e3a5f;
      background: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;

      &:hover {
        background: #f3f4f6;
      }
    }

    .dashboard-content {
      padding: 1.5rem;
    }

    .welcome-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      margin-bottom: 1.5rem;

      .profile-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.75rem;

        .avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 1.25rem;
        }

        h2 {
          margin: 0 0 0.25rem;
          color: #1e3a5f;
          font-size: 1.125rem;
        }

        .role-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          color: white;
          font-size: 0.75rem;
          font-weight: 500;
        }
      }

      .email {
        margin: 0;
        color: #6b7280;
        font-size: 0.875rem;
      }

      .note {
        margin: 0.5rem 0 0;
        color: #9ca3af;
        font-size: 0.8125rem;
        font-style: italic;
      }
    }

    .section {
      margin-bottom: 1.5rem;

      h3 {
        margin: 0 0 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }

    .action-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 1rem;
    }

    .action-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1.25rem 1rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      text-decoration: none;
      color: #374151;
      font-size: 0.875rem;
      font-weight: 500;
      transition: transform 0.2s, box-shadow 0.2s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .action-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;

        svg {
          width: 24px;
          height: 24px;
        }

        &.packages {
          background: #fef3c7;
          color: #d97706;
        }

        &.warehouse {
          background: #dbeafe;
          color: #3b82f6;
        }

        &.collection {
          background: #d1fae5;
          color: #10b981;
        }

        &.admin {
          background: #ede9fe;
          color: #7c3aed;
        }
      }
    }

    .info-text {
      color: #6b7280;
      font-size: 0.8125rem;
      line-height: 1.5;
      text-align: center;
      margin: 0;
    }
  `]
})
export class DashboardComponent implements OnInit {
  authService = inject(AuthService);
  staffService = inject(StaffService);
  roleConfig = ROLE_CONFIG;

  async ngOnInit(): Promise<void> {
    // Profile is loaded automatically by StaffService when auth state changes
  }

  logout(): void {
    this.authService.signOut();
  }

  getRoleColor(role: string): string {
    return this.roleConfig[role as keyof typeof ROLE_CONFIG]?.color || '#6b7280';
  }
}
