import { Routes } from '@angular/router';
import { authGuard, publicGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/admin.guard';
import { warehouseGuard } from './core/auth/warehouse.guard';
import { collectionGuard } from './core/auth/collection.guard';
import { driverGuard } from './core/auth/driver.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [publicGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'packages',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/packages/package-list/package-list.component').then(m => m.PackageListComponent)
      },
      {
        path: 'create',
        canActivate: [warehouseGuard],
        loadComponent: () => import('./features/packages/create-package/create-package.component').then(m => m.CreatePackageComponent)
      },
      {
        path: ':id',
        loadComponent: () => import('./features/packages/package-detail/package-detail.component').then(m => m.PackageDetailComponent)
      }
    ]
  },
  {
    path: 'driver',
    canActivate: [driverGuard],
    children: [
      {
        path: 'pickup',
        loadComponent: () => import('./features/driver/pickup-package/pickup-package.component').then(m => m.PickupPackageComponent)
      },
      {
        path: '',
        redirectTo: 'pickup',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: 'collection',
    canActivate: [collectionGuard],
    children: [
      {
        path: 'scan',
        loadComponent: () => import('./features/collection/scan-package/scan-package.component').then(m => m.ScanPackageComponent)
      },
      {
        path: 'receive',
        loadComponent: () => import('./features/collection/receive-package/receive-package.component').then(m => m.ReceivePackageComponent)
      },
      {
        path: ':id/confirm',
        loadComponent: () => import('./features/collection/collection-confirm/collection-confirm.component').then(m => m.CollectionConfirmComponent)
      },
      {
        path: '',
        redirectTo: 'scan',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      {
        path: 'staff',
        loadComponent: () => import('./features/admin/staff-management/staff-management.component').then(m => m.StaffManagementComponent)
      },
      {
        path: 'receivers',
        loadComponent: () => import('./features/admin/receiver-management/receiver-management.component').then(m => m.ReceiverManagementComponent)
      },
      {
        path: 'audit-trail',
        loadComponent: () => import('./features/admin/audit-trail/audit-trail.component').then(m => m.AuditTrailComponent)
      },
      {
        path: 'locations',
        loadComponent: () => import('./features/admin/delivery-location-management/delivery-location-management.component').then(m => m.DeliveryLocationManagementComponent)
      },
      {
        path: '',
        redirectTo: 'staff',
        pathMatch: 'full'
      }
    ]
  },
  {
    // Catch-all redirect to login
    path: '**',
    redirectTo: 'login'
  }
];
