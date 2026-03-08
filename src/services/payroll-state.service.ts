import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PayrollStateService {
  private readonly STORAGE_PREFIX = 'payroll_state_';

  saveState<T>(matricula: string, year: number, month: number, data: T): void {
    const key = `${this.STORAGE_PREFIX}${matricula}_${year}_${month}`;
    localStorage.setItem(key, JSON.stringify(data));
  }

  loadState<T>(matricula: string, year: number, month: number): T | null {
    const key = `${this.STORAGE_PREFIX}${matricula}_${year}_${month}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : null;
  }

  deleteState(matricula: string, year: number, month: number): void {
    const key = `${this.STORAGE_PREFIX}${matricula}_${year}_${month}`;
    localStorage.removeItem(key);
  }

  clearAllStates(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
}
