import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, of, catchError } from 'rxjs';

export interface UserProfile {
  matricula: string;
  contrasena: string;
  categoria: string;
  porcentualidad: number;
  mesIngreso: number;
  anoAntiguedad: number;
  cobraFlexibilidad?: boolean;
  plusMando?: boolean;
  plusPersonal?: boolean;
  securityQuestion?: string;
  securityAnswer?: string;
  failedAttempts?: number;
  lockoutUntil?: number;
  expiresAt?: number;
  registrationDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private readonly CURRENT_USER_KEY = 'app_current_user';
  private readonly API_URL = '/api';

  // Super user is now handled on the server, but we keep the matricula for isAdmin check
  private readonly SUPER_USER_MATRICULA = 'MauricioAlfaro';

  currentUser = signal<UserProfile | null>(this.getStoredCurrentUser());

  constructor() {}

  getAllUsers(): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${this.API_URL}/users`);
  }

  deleteUser(matricula: string): Observable<boolean> {
    return this.http.delete<{success: boolean}>(`${this.API_URL}/users/${matricula}`).pipe(
      map(response => response.success),
      catchError(() => of(false))
    );
  }

  private getStoredCurrentUser(): UserProfile | null {
    const userJson = localStorage.getItem(this.CURRENT_USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  }

  login(matricula: string, contrasena: string): Observable<{ success: boolean, message?: string }> {
    return this.http.post<{ success: boolean, user?: UserProfile, message?: string }>(`${this.API_URL}/login`, { matricula, contrasena }).pipe(
      tap(response => {
        if (response.success && response.user) {
          this.setCurrentUser(response.user);
        }
      }),
      catchError(() => of({ success: false, message: 'Error de conexión con el servidor.' }))
    );
  }

  guestLogin(): Observable<{ success: boolean, message?: string }> {
    return this.http.post<{ success: boolean, user?: UserProfile, message?: string }>(`${this.API_URL}/guest-login`, {}).pipe(
      tap(response => {
        if (response.success && response.user) {
          this.setCurrentUser(response.user);
        }
      }),
      catchError(() => of({ success: false, message: 'Error al iniciar como invitado.' }))
    );
  }

  isAdmin(): boolean {
    return this.currentUser()?.matricula === this.SUPER_USER_MATRICULA;
  }

  getSecurityQuestion(matricula: string): Observable<string | null> {
    return this.http.get<{question: string}>(`${this.API_URL}/security-question/${matricula}`).pipe(
      map(res => res.question),
      catchError(() => of(null))
    );
  }

  resetPassword(matricula: string, answer: string, newPassword: string): Observable<{ success: boolean, message: string }> {
    return this.http.post<{ success: boolean, message: string }>(`${this.API_URL}/reset-password`, { matricula, answer, newPassword }).pipe(
      catchError(() => of({ success: false, message: 'Error al restablecer la contraseña.' }))
    );
  }

  register(profile: UserProfile): Observable<{ success: boolean, message?: string }> {
    return this.http.post<{ success: boolean, user?: UserProfile, message?: string }>(`${this.API_URL}/register`, profile).pipe(
      map(response => {
        if (response.success && response.user) {
          this.setCurrentUser(response.user);
          return { success: true };
        }
        return { success: false, message: response.message || 'Error al registrar.' };
      }),
      catchError(() => of({ success: false, message: 'Error de conexión.' }))
    );
  }

  exportUsers(): Observable<Blob> {
    return this.http.get(`${this.API_URL}/admin/export-users`, { responseType: 'blob' });
  }

  importUsers(users: UserProfile[]): Observable<{ success: boolean, message: string }> {
    return this.http.post<{ success: boolean, message: string }>(`${this.API_URL}/admin/import-users`, users);
  }

  getGuestStats(): Observable<{ totalGuestLogins: number, guestHistory?: { matricula: string, date: string }[] }> {
    return this.http.get<{ totalGuestLogins: number, guestHistory?: { matricula: string, date: string }[] }>(`${this.API_URL}/admin/guest-stats`);
  }

  resetGuestStats(): Observable<{ success: boolean, message: string }> {
    return this.http.post<{ success: boolean, message: string }>(`${this.API_URL}/admin/reset-guest-stats`, {});
  }

  updateProfile(profile: UserProfile): void {
    // For now, update local state. In a real app, we'd PUT to the server.
    // Since the requirement is mostly about admin seeing users, and users don't update their profile often in this app context (except maybe password reset which is handled),
    // we might skip full profile update implementation or add it if needed.
    // But let's at least update the current user signal if it matches.
    if (this.currentUser()?.matricula === profile.matricula) {
      this.setCurrentUser(profile);
    }
  }

  logout(): void {
    localStorage.removeItem(this.CURRENT_USER_KEY);
    this.currentUser.set(null);
  }

  private setCurrentUser(user: UserProfile): void {
    localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }
}
