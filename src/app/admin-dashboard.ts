import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, UserProfile } from '../services/auth.service';
import { EmployeeService } from '../services/employee.service';
import { PayrollDataService } from '../services/payroll-data.service';
import { PayrollData } from '../models/payroll.model';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  templateUrl: './admin-dashboard.html'
})
export class AdminDashboardComponent {
  authService = inject(AuthService);
  employeeService = inject(EmployeeService);
  payrollDataService = inject(PayrollDataService);
  router = inject(Router);
  
  users = signal<UserProfile[]>([]);
  totalGuestLogins = signal(0);
  guestHistory = signal<{ matricula: string, date: string }[]>([]);
  Date = Date;
  Math = Math;

  showEmployeeManager = signal(false);
  showPayrollManager = signal(false);
  
  newEmployeeMatricula = signal('');
  newEmployeeName = signal('');
  employeeSearch = signal('');

  newPayrollYear = signal<number>(new Date().getFullYear() + 1);
  newPayrollKValue = signal<number>(13.80);
  newPayrollPrimaMinimaGarantizada = signal<number>(84.06);
  newPayrollBaseMaximaCotizacion = signal<number>(5101.20);
  newPayrollMeiValue = signal<number>(0.15);
  payrollFile = signal<File | null>(null);

  uploadedYears = computed(() => {
    return this.payrollDataService.dynamicDataReadOnly().map(d => ({
      year: d.year,
      kValue: d.kValue,
      primaMinimaGarantizada: d.primaMinimaGarantizada,
      baseMaximaCotizacion: d.baseMaximaCotizacion,
      meiValue: d.meiValue
    })).sort((a, b) => b.year - a.year);
  });

  registeredCount = computed(() => 
    this.users().filter(u => !u.matricula.startsWith('GUEST_')).length
  );

  guestCount = computed(() => 
    this.users().filter(u => u.matricula.startsWith('GUEST_')).length
  );

  filteredEmployees = computed(() => {
    const search = this.employeeSearch().toLowerCase();
    const all = this.employeeService.employees();
    return Object.entries(all)
      .filter(([mat, name]) => 
        mat.toLowerCase().includes(search) || 
        name.toLowerCase().includes(search)
      )
      .sort((a, b) => a[0].localeCompare(b[0])); // Sort by matricula
  });

  constructor() {
    this.loadUsers();
    this.loadGuestStats();
    this.payrollDataService.fetchDynamicData().subscribe();
  }

  loadUsers() {
    this.authService.getAllUsers().subscribe(users => {
      this.users.set(users || []);
    });
  }

  loadGuestStats() {
    this.authService.getGuestStats().subscribe(stats => {
      if (stats) {
        this.totalGuestLogins.set(stats.totalGuestLogins || 0);
        this.guestHistory.set(stats.guestHistory || []);
      } else {
        this.totalGuestLogins.set(0);
        this.guestHistory.set([]);
      }
    });
  }

  resetGuestCounter() {
    if (confirm('¿Estás seguro de que quieres reiniciar el contador de visitas de invitados a 0?')) {
      this.authService.resetGuestStats().subscribe(res => {
        if (res.success) {
          this.loadGuestStats();
          alert(res.message);
        }
      });
    }
  }

  toggleEmployeeManager() {
    this.showEmployeeManager.update(v => !v);
    if (this.showEmployeeManager()) this.showPayrollManager.set(false);
  }

  togglePayrollManager() {
    this.showPayrollManager.update(v => !v);
    if (this.showPayrollManager()) {
      this.showEmployeeManager.set(false);
    }
  }

  goHome() {
    this.showEmployeeManager.set(false);
    this.showPayrollManager.set(false);
  }

  onPayrollFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.payrollFile.set(input.files[0]);
    }
  }

  async uploadPayrollData() {
    const file = this.payrollFile();
    const year = Number(this.newPayrollYear());
    const kValue = Number(this.newPayrollKValue());
    const primaMinimaGarantizada = Number(this.newPayrollPrimaMinimaGarantizada());
    const baseMaximaCotizacion = Number(this.newPayrollBaseMaximaCotizacion());
    const meiValue = Number(this.newPayrollMeiValue());

    if (!file) {
      alert('Por favor, selecciona un archivo CSV.');
      return;
    }

    if (!year || isNaN(year)) {
      alert('Por favor, introduce un año válido.');
      return;
    }

    if (!kValue || isNaN(kValue)) {
      alert('Por favor, introduce un valor K válido.');
      return;
    }

    if (!primaMinimaGarantizada || isNaN(primaMinimaGarantizada)) {
      alert('Por favor, introduce un valor de Prima Mínima Garantizada válido.');
      return;
    }

    if (!baseMaximaCotizacion || isNaN(baseMaximaCotizacion)) {
      alert('Por favor, introduce una Base Máxima de Cotización válida.');
      return;
    }

    if (meiValue === undefined || isNaN(meiValue)) {
      alert('Por favor, introduce un valor MEI válido.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const csvText = e.target?.result as string;
        const parsedData = this.payrollDataService.parseCSV(csvText);
        
        if (parsedData.length === 0) {
          alert('El archivo CSV parece estar vacío o tiene un formato incorrecto. Asegúrate de que las cabeceras sean correctas (ej: CATEGORIA, SALARIO_BASE, etc).');
          return;
        }

        if (confirm(`¿Estás seguro de que quieres subir los datos para el año ${year} con valor K = ${kValue}, Prima Mínima = ${primaMinimaGarantizada}, Base Máxima = ${baseMaximaCotizacion} y MEI = ${meiValue}%? Se procesaron ${parsedData.length} registros.`)) {
          this.payrollDataService.saveDynamicData(year, kValue, primaMinimaGarantizada, baseMaximaCotizacion, meiValue, parsedData).subscribe({
            next: (res) => {
              if (res.success) {
                alert(res.message);
                this.payrollFile.set(null);
                const fileInput = document.getElementById('payrollUploadInput') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
                
                // Force reload of data in case we updated the current year
                this.payrollDataService.fetchDynamicData().subscribe();
              } else {
                alert('Error: ' + res.message);
              }
            },
            error: (err) => {
              console.error('Error saving payroll data:', err);
              alert('Error al guardar los datos de nómina. Consulta la consola para más detalles.');
            }
          });
        }
      } catch (err) {
        console.error('Error parsing CSV:', err);
        alert('Error al procesar el archivo CSV. Asegúrate de que el formato sea correcto.');
      }
    };
    reader.onerror = (err) => {
        console.error('File reading error:', err);
        alert('Error al leer el archivo.');
    };
    reader.readAsText(file);
  }

  async addEmployee() {
    const mat = this.newEmployeeMatricula().trim();
    const name = this.newEmployeeName().trim();
    
    if (!mat || !name) {
      alert('Por favor, introduce matrícula y nombre.');
      return;
    }

    try {
      await this.employeeService.addOrUpdateEmployee(mat, name);
      this.newEmployeeMatricula.set('');
      this.newEmployeeName.set('');
      alert('Empleado guardado correctamente.');
    } catch (err) {
      console.error(err);
      alert('Error al guardar empleado.');
    }
  }

  async deleteEmployee(matricula: string) {
    if (confirm(`¿Eliminar empleado ${matricula}?`)) {
      try {
        await this.employeeService.deleteEmployee(matricula);
      } catch (err) {
        console.error(err);
        alert('Error al eliminar empleado.');
      }
    }
  }

  deleteUser(matricula: string) {
    if (confirm(`¿Estás seguro de que quieres eliminar al usuario ${matricula}? Esta acción no se puede deshacer.`)) {
      this.authService.deleteUser(matricula).subscribe(success => {
        if (success) {
          this.loadUsers();
        } else {
          alert('No se pudo eliminar el usuario. Verifique que exista.');
        }
      });
    }
  }

  downloadGuestHistory() {
    const history = this.guestHistory();
    if (history.length === 0) {
      alert('No hay historial de invitados para descargar.');
      return;
    }

    const csvContent = "data:text/csv;charset=utf-8," 
      + "Matrícula,Fecha y Hora\n"
      + history.map(e => `${e.matricula},${new Date(e.date).toLocaleString()}`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `historial_invitados_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadDatabase() {
    this.authService.exportUsers().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Error downloading database:', err);
        alert('Error al descargar la base de datos.');
      }
    });
  }

  triggerUpload() {
    document.getElementById('dbUploadInput')?.click();
  }

  uploadDatabase(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      
      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const users = JSON.parse(e.target?.result as string);
          if (confirm(`¿Estás seguro de que quieres importar esta base de datos? Se sobrescribirán ${users.length} usuarios.`)) {
            this.authService.importUsers(users).subscribe({
              next: (response) => {
                if (response.success) {
                  alert(response.message);
                  this.loadUsers();
                } else {
                  alert('Error: ' + response.message);
                }
              },
              error: (err) => {
                console.error('Error importing database:', err);
                alert('Error al importar la base de datos.');
              }
            });
          }
        } catch (err) {
          console.error('Error parsing JSON:', err);
          alert('Error al leer el archivo. Asegúrate de que sea un JSON válido.');
        }
        // Reset input so the same file can be selected again if needed
        input.value = '';
      };
      
      reader.readAsText(file);
    }
  }

  deletePayrollYear(year: number) {
    if (confirm(`¿Estás seguro de que quieres eliminar los datos de nómina del año ${year}? Esta acción no se puede deshacer.`)) {
      this.payrollDataService.deleteDynamicData(year).subscribe({
        next: (res) => {
          if (res.success) {
            alert(res.message);
            this.payrollDataService.fetchDynamicData().subscribe();
          } else {
            alert('Error: ' + res.message);
          }
        },
        error: (err) => {
          console.error('Error deleting payroll data:', err);
          alert('Error al eliminar los datos de nómina.');
        }
      });
    }
  }

  editPayrollYear(year: number, kValue: number, primaMinimaGarantizada?: number, baseMaximaCotizacion?: number, meiValue?: number) {
    this.newPayrollYear.set(year);
    this.newPayrollKValue.set(kValue);
    if (primaMinimaGarantizada !== undefined) {
      this.newPayrollPrimaMinimaGarantizada.set(primaMinimaGarantizada);
    }
    if (baseMaximaCotizacion !== undefined) {
      this.newPayrollBaseMaximaCotizacion.set(baseMaximaCotizacion);
    }
    if (meiValue !== undefined) {
      this.newPayrollMeiValue.set(meiValue);
    }
    // Scroll to top of form
    document.querySelector('h2')?.scrollIntoView({ behavior: 'smooth' });
    alert(`Modo edición activado para el año ${year}. Sube un nuevo archivo CSV para sobrescribir los datos o cambia el valor K / Prima Mínima / Base Máxima / MEI.`);
  }

  downloadPayrollCSV(year: number) {
    const data: PayrollData[] = this.payrollDataService.getDataForYear(year);
    if (data.length === 0) {
      alert(`No hay datos disponibles para el año ${year}.`);
      return;
    }

    // Collect all unique keys from all rows to ensure we have all headers
    const allKeysSet = new Set<string>();
    data.forEach(row => Object.keys(row).forEach(key => allKeysSet.add(key)));
    const headers = Array.from(allKeysSet);
    
    // Map 'category' to 'CATEGORIA' for better compatibility with parseCSV
    const headerMapping: { [key: string]: string } = {};
    headers.forEach(key => {
        if (key === 'category') headerMapping[key] = 'CATEGORIA';
        else headerMapping[key] = key;
    });

    const csvHeaders = headers.map(h => headerMapping[h]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + csvHeaders.join(";") + "\n"
      + data.map(row => headers.map(header => {
          const val = (row as PayrollData)[header as keyof PayrollData];
          
          // Format numbers as EU style (comma as decimal)
          let formattedVal: string | number = val ?? '';
          if (typeof val === 'number') {
              formattedVal = val.toString().replace('.', ',');
          }
          
          // Escape semicolon if present
          const strVal = String(formattedVal);
          return strVal.includes(';') ? `"${strVal}"` : strVal;
        }).join(";")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_data_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
