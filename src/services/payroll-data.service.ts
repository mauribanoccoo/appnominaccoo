import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PAYROLL_DATA_2025 } from '../data/payroll-data-2025';
import { PAYROLL_DATA_2026 } from '../data/payroll-data-2026';
import { PayrollData } from '../models/payroll.model';
import { Observable, tap } from 'rxjs';

export interface PayrollYearData {
  year: number;
  kValue: number;
  primaMinimaGarantizada?: number;
  baseMaximaCotizacion?: number;
  meiValue?: number;
  data: PayrollData[];
}

@Injectable({
  providedIn: 'root'
})
export class PayrollDataService {
  private http = inject(HttpClient);
  private dynamicData = signal<PayrollYearData[]>([]);
  public dynamicDataReadOnly = this.dynamicData.asReadonly();

  private readonly API_URL = '/api';

  get2025Data(): PayrollData[] {
    return PAYROLL_DATA_2025;
  }

  get2026Data(): PayrollData[] {
    return PAYROLL_DATA_2026;
  }

  fetchDynamicData(): Observable<PayrollYearData[]> {
    return this.http.get<PayrollYearData[]>(`${this.API_URL}/payroll-data`).pipe(
      tap(data => this.dynamicData.set(data))
    );
  }

  getDynamicData(): PayrollYearData[] {
    return this.dynamicData();
  }

  saveDynamicData(year: number, kValue: number, primaMinimaGarantizada: number, baseMaximaCotizacion: number, meiValue: number, data: PayrollData[]): Observable<{success: boolean, message: string}> {
    return this.http.post<{success: boolean, message: string}>(`${this.API_URL}/admin/payroll-data`, { year, kValue, primaMinimaGarantizada, baseMaximaCotizacion, meiValue, data });
  }

  deleteDynamicData(year: number): Observable<{success: boolean, message: string}> {
    return this.http.delete<{success: boolean, message: string}>(`${this.API_URL}/admin/payroll-data/${year}`);
  }

  getDataForYear(year: number): PayrollData[] {
    const dynamic = this.dynamicData().find(d => d.year === year);
    if (dynamic) return dynamic.data;

    if (year === 2025) return this.get2025Data();
    if (year === 2026) return this.get2026Data();
    
    // Fallback to 2026 if year not found
    return this.get2026Data();
  }

  getKValue(year: number, month: number): number {
    const dynamic = this.dynamicData().find(d => d.year === year);
    if (dynamic) {
      if (month === 1) {
        // In January, use previous year's K value
        const prevYear = year - 1;
        return this.getKValue(prevYear, 12);
      }
      return dynamic.kValue;
    }

    if (year === 2025) return 13.46;
    if (year === 2026 && month === 1) return 13.46;
    if (year === 2026) return 13.80;
    
    return 13.80; // Fallback
  }

  getBaseMaximaCotizacion(year: number): number {
    const dynamic = this.dynamicData().find(d => d.year === year);
    if (dynamic && dynamic.baseMaximaCotizacion !== undefined) {
      return dynamic.baseMaximaCotizacion;
    }
    return 5101.20; // Default fallback
  }

  getPrimaMinimaGarantizada(year: number): number {
    const dynamic = this.dynamicData().find(d => d.year === year);
    if (dynamic && dynamic.primaMinimaGarantizada !== undefined) {
      return dynamic.primaMinimaGarantizada;
    }
    if (year === 2025) return 82.01; 
    if (year === 2026) return 84.06;
    
    return 84.06; // Fallback
  }

  getMeiValue(year: number): number {
    const dynamic = this.dynamicData().find(d => d.year === year);
    if (dynamic && dynamic.meiValue !== undefined) {
      return dynamic.meiValue;
    }
    if (year === 2025) return 0.14;
    if (year === 2026) return 0.15;
    
    // Default progression if not specified
    if (year > 2026) {
      const yearDiff = year - 2026;
      return Math.min(0.16 + (yearDiff * 0.02), 0.60);
    }
    
    return 0.15; // Fallback for 2026+
  }

  getAvailableYears(): number[] {
    const baseYears = [2025, 2026];
    const dynamicYears = this.dynamicData().map(d => d.year);
    return Array.from(new Set([...baseYears, ...dynamicYears])).sort((a, b) => a - b);
  }

  public parseCSV(csvText: string): PayrollData[] {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    let separator = ',';
    
    // Detect separator based on first line
    // If it contains semicolon, assume it's the separator (common in EU)
    if (lines[0].indexOf(';') > -1) {
      separator = ';';
    }

    // Helper to split CSV line respecting quotes
    const splitLine = (line: string, sep: string): string[] => {
      if (sep === ';') return line.split(';');
      
      // Regex to split by comma ONLY if an even number of quotes follow it
      // This allows "1.200,50" to stay together
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      return line.split(regex);
    };

    const headerRaw = splitLine(lines[0], separator);
    const headers = headerRaw.map(h => this.normalizeKey(h));

    const result: PayrollData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const currentLine = splitLine(lines[i], separator);
      
      // Allow loose length matching (some rows might have empty trailing cols)
      if (currentLine.length > 0) { 
        const obj: Partial<PayrollData> = {};
        let hasCategory = false;
        
        headers.forEach((header, index) => {
          let value = currentLine[index]?.trim();
          
          // Remove wrapping quotes if present
          if (value && value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
            // If double quotes were escaped as "", fix them
            value = value.replace(/""/g, '"');
          }

          // Identify Category
          if (header === 'CATEGORY' || header === 'CATEGORIA' || header.includes('CATEGORIA') || header === 'PUESTO') {
            if (value) {
               obj['category'] = value;
               hasCategory = true;
            }
          } else if (header) {
            // Parse Number for other fields
            obj[header] = this.parseNumber(value);
          }
        });

        if (hasCategory) {
          // Normalization logic for 0 Quinquenio to ensure compatibility with both old and new CSV formats
          // If TOXICO_0_QUIN is missing but PLUS_TOXICO exists, map it.
          if (obj['TOXICO_0_QUIN'] === undefined && obj['PLUS_TOXICO'] !== undefined) {
             obj['TOXICO_0_QUIN'] = obj['PLUS_TOXICO'];
          }
          // If PLUS_NOCTURNO_0_QUIN is missing but PLUS_TRABAJO_NOCTURNO exists, map it.
          if (obj['PLUS_NOCTURNO_0_QUIN'] === undefined && obj['PLUS_TRABAJO_NOCTURNO'] !== undefined) {
             obj['PLUS_NOCTURNO_0_QUIN'] = obj['PLUS_TRABAJO_NOCTURNO'];
          }

          result.push(obj as PayrollData);
        }
      }
    }

    return result;
  }

  public normalizeKey(key: string): string {
    if (!key) return '';
    return key
      .replace(/^\ufeff/, '') // Remove BOM (Byte Order Mark) explicitly
      .trim()
      .toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^A-Z0-9]/g, '_') // Replace non-alphanumeric chars with _
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, ''); // Trim leading/trailing underscores
  }

  private parseNumber(value: string): number | string {
    if (!value) return 0;
    
    // Cleanup currency symbols and generic whitespace
    // Keep dots, commas, and digits.
    const clean = value.replace(/[€$£\s]/g, '');
    
    if (!clean) return 0;

    // EU Format Check: 1.234,56
    // If it has a comma, and that comma is after any dots (or there are no dots), treat comma as decimal.
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');

    if (lastComma > -1 && lastComma > lastDot) {
      // It uses comma as decimal (EU style)
      // Remove dots (thousands) -> Replace comma with dot -> Parse
      const normalized = clean.replace(/\./g, '').replace(',', '.');
      return parseFloat(normalized) || 0;
    }

    // US/Standard Format Check: 1,234.56
    if (lastDot > -1 && lastDot > lastComma) {
       // Check if it's actually thousands separator without decimals (1.200) in EU style
       // If strict group of 3 follows the dot, and it's the only dot structure... 
       // Actually, in this specific context (Spanish Payroll), 1.200 is likely 1200, not 1.2
       // But 12.50 is 12.5.
       
       // Heuristic: If we have multiple dots (1.200.000), it's thousands.
       if ((clean.match(/\./g) || []).length > 1) {
          return parseFloat(clean.replace(/\./g, '')) || 0;
       }

       // Single dot case (1.200 vs 1.2)
       // If it has 3 digits exactly after dot (1.200), treat as 1200
       if (/\.\d{3}$/.test(clean)) {
         return parseFloat(clean.replace(/\./g, '')) || 0;
       }
       
       return parseFloat(clean) || 0;
    }

    // Integer or simple format
    return parseFloat(clean) || 0;
  }
}