import { Routes } from '@angular/router';
import { PayrollCalculator } from './payroll-calculator';
import { LoginComponent } from './login';
import { AdminDashboardComponent } from './admin-dashboard';
import { authGuard } from '../guards/auth.guard';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

const adminGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  
  if (auth.isAuthenticated() && auth.isAdmin()) {
    return true;
  }
  
  return router.parseUrl('/login');
};

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'admin', component: AdminDashboardComponent, canActivate: [adminGuard] },
  { path: '', component: PayrollCalculator, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
