import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {
  private http = inject(HttpClient);
  
  // Signal to hold the employee database
  employees = signal<Record<string, string>>({});

  private readonly API_URL = '/api';

  constructor() {
    this.loadEmployees();
  }

  loadEmployees() {
    this.http.get<Record<string, string>>(`${this.API_URL}/employees`).subscribe({
      next: (data) => this.employees.set(data),
      error: (err) => console.error('Error loading employees:', err)
    });
  }

  async addOrUpdateEmployee(matricula: string, nombre: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.API_URL}/employees`, { matricula, nombre }));
    this.loadEmployees(); // Reload to update signal
  }

  async deleteEmployee(matricula: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.API_URL}/employees/${matricula}`));
    this.loadEmployees(); // Reload to update signal
  }
  
  getEmployeeName(matricula: string): string | undefined {
    return this.employees()[matricula];
  }
}
