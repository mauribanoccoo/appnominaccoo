import { Component, ChangeDetectionStrategy, signal, inject, computed, OnInit, effect, ElementRef, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PayrollDataService } from '../services/payroll-data.service';
import { PayrollStateService } from '../services/payroll-state.service';
import { PayrollData, PayrollForm, CalculationResult } from '../models/payroll.model';
import { CurrencyFormatPipe } from '../pipes/currency-format.pipe';
import { AuthService } from '../services/auth.service';
import { animate, stagger } from 'motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EmployeeService } from '../services/employee.service';

// Label mapping for UI based on requirements
const LABEL_MAP: {[key: string]: string} = {
  category: 'Categoría', // Mapping for the internal category key
  CATEGORY: 'Categoría',
  SALARIO_BASE: 'Salario Base',
  FLEXIBILIDAD: 'Flexibilidad',
  PLUS_TOXICO: 'Plus Toxico',
  PLUS_CONVENIO: 'Plus Convenio',
  TURNO_NOCHE: 'Trabajo Turno de Noche',
  PLUS_ROTACION: 'Plus de Rotación',
  PLUS_TRABAJO_NOCTURNO: 'Plus Trabajo Nocturno',
  PLUS_NOCHE_TRABAJADA: 'Plus Noche Trabajada',
  ANTIGUEDAD: 'Antigüedad',
  PAGA_SEPTIEMBRE: 'Paga Extra Septiembre',
  PAGA_ABRIL: 'Paga Extra Abril',
  FORMACION: 'Horas de Formación',
  HORAS_EXTRA_LABORABLES: 'Horas Extras Laborables',
  HORAS_EXTRA_FESTIVA: 'Horas Extras Festivas',
  INHABIL_SABADO_M: 'Inhábil Sábado de Mañana',
  INHABIL_SABADO_T: 'Inhábil Sábado de Tarde',
  INHABIL_SABADO_N: 'Inhábil Sábado de Noche',
  INHABIL_DOMINGO_M: 'Inhábil Domingo de Mañana',
  INHABIL_DOMINGO_T: 'Inhábil Domingo de Tarde',
  INHABIL_DOMINGO_N: 'Inhábil Domingo de Noche',
  PLUS_MANDO: 'Plus de Mando',
  PLUS_PERSONAL: 'Plus Personal',
  DIA_FIN_SEMANA: 'Día Trabajado en fin de semana',
  PLUS_4_TURNO: 'Trabajo fin semana (4°Turno)'
};

const EXCLUDED_CATEGORIES_ANTIGUEDAD = [
  'DIRECTO_O.D.F.',
  'DIRECTO_A000',
  'DIRECTO_B000',
  'DIRECTO_B001',
  'DIRECTO_B002',
  'DIRECTO_B003',
  'INDIRECTO_A000',
  'INDIRECTO_B000',
  'INDIRECTO_B001',
  'INDIRECTO_B002',
  'INDIRECTO_B003',
  'INDIRECTO_C000',
  'INDIRECTO_C001',
  'INDIRECTO_C002',
  'INDIRECTO_C003',
  'INDIRECTO_D000',
  'INDIRECTO_E000',
  'INDIRECTO_F000',
];

interface BreakdownRow {
  concept: string;
  formula: string; // Representation of the calculation
  value: number;
}

@Component({
  selector: 'app-payroll-calculator',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, CurrencyFormatPipe],
  templateUrl: './payroll-calculator.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollCalculator implements OnInit {
  private fb: FormBuilder = inject(FormBuilder);
  public payrollDataService = inject(PayrollDataService);
  private payrollStateService = inject(PayrollStateService);
  private authService = inject(AuthService);
  private employeeService = inject(EmployeeService);
  private router = inject(Router);
  private resultsList = viewChild<ElementRef>('resultsList');

  // Expose LABEL_MAP to template
  labelMap = LABEL_MAP;

  payrollData = signal<PayrollData[]>([]);
  payrollData2025 = signal<PayrollData[]>([]);

  isCustomData = signal<boolean>(false);

  // Computed signal to filter out unwanted rows from both Dropdown and Table
  filteredPayrollData = computed(() => {
    const form = this.formValues() as PayrollForm;
    const year = Number(form.calculationYear) || 2026;
    
    let data: PayrollData[] = [];
    if (this.isCustomData()) {
      data = this.payrollData();
    } else {
      data = this.payrollDataService.getDataForYear(year);
    }

    return data.filter(d => {
      if (!d.category) return false;
      const upper = d.category.toUpperCase().trim();
      return upper !== 'CATEGORIA' && 
             upper !== 'CATEGORY' && 
             upper !== 'PLUS TRABAJO NOCTURNO' &&
             upper !== 'PLUS TRABAJO NOCTURNO 2026';
    });
  });

  // Use Set to ensure categories are unique and derived from filtered data
  categories = computed(() => {
    const cats = this.filteredPayrollData().map(d => d.category);
    return [...new Set(cats)];
  });

  availableYears = computed(() => {
    return this.payrollDataService.getAvailableYears().filter(y => y !== 2025);
  });

  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);

  // State for toggling the data table view - VISIBLE BY DEFAULT
  showData = signal<boolean>(true);
  
  // State for showing detailed breakdown
  showNocturnidadDetails = signal<boolean>(false);
  showToxicoDetails = signal<boolean>(false);
  showPrimaPaiDetails = signal<boolean>(false);
  
  // State for showing user guide
  showGuide = signal<boolean>(false);

  welcomeMessage = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return '';
    
    const name = this.employeeService.employees()[user.matricula];
    if (name) {
      return `Hola, ${name}, gracias por confiar en CC.OO.`;
    }
    return `Hola, ${user.matricula}, gracias por confiar en CC.OO.`;
  });

  readonly PRIMA_ALLOWED_CATEGORIES = [
    'DIRECTO_O.D.F.',
    'DIRECTO_A000',
    'DIRECTO_B000',
    'DIRECTO_B001',
    'DIRECTO_B002',
    'DIRECTO_B003',
    'DIRECTO_B101',
    'DIRECTO_B102',
    'DIRECTO_B103',
    'DIRECTO_B201',
    'DIRECTO_B202',
    'DIRECTO_B203'
  ];

  isPrimaDetailsAllowed = computed(() => {
    const form = this.formValues() as PayrollForm;
    if (!form.category) return false;
    return this.PRIMA_ALLOWED_CATEGORIES.includes(form.category) && form.flexibsn === 'SI';
  });

  isEligibleForPlus4Turno = computed(() => {
    const form = this.formValues() as PayrollForm;
    if (!form.entryYear || !form.entryMonth) return true;
    // Condition: Hidden if entryYear >= 2005
    // "mayor o igual a mes 1 y el año 2005"
    return form.entryYear < 2005;
  });

  currentK = computed(() => {
    const form = this.formValues() as PayrollForm;
    const year = Number(form.calculationYear);
    const month = Number(form.calculationMonth);

    return this.payrollDataService.getKValue(year, month);
  });

  currentPrimaMinimaGarantizada = computed(() => {
    const form = this.formValues() as PayrollForm;
    const year = Number(form.calculationYear);

    return this.payrollDataService.getPrimaMinimaGarantizada(year);
  });
  
  // Computes headers dynamically for the table view based on filtered data
  dataHeaders = computed(() => {
    const data = this.filteredPayrollData();
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]);
  });

  months = [
    { value: 1, name: 'Enero' }, { value: 2, name: 'Febrero' },
    { value: 3, name: 'Marzo' }, { value: 4, name: 'Abril' },
    { value: 5, name: 'Mayo' }, { value: 6, name: 'Junio' },
    { value: 7, name: 'Julio' }, { value: 8, name: 'Agosto' },
    { value: 9, name: 'Septiembre' }, { value: 10, name: 'Octubre' },
    { value: 11, name: 'Noviembre' }, { value: 12, name: 'Diciembre' },
  ];

  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;
  defaultCalculationMonth = (() => {
    const d = new Date();
    d.setDate(0); // last day of previous month
    return d.getMonth() + 1;
  })();

  payrollForm = this.fb.group({
    calculationYear: [new Date().getFullYear(), Validators.required],
    calculationMonth: [this.defaultCalculationMonth, Validators.required],
    category: ['', Validators.required],
    porcent: [100, [Validators.required, Validators.min(0), Validators.max(100)]],
    entryYear: [this.currentYear, [Validators.required, Validators.min(1980), Validators.max(this.currentYear + 2)]],
    entryMonth: [1, [Validators.required]],
    flexib: [null as number | null, [Validators.min(0), Validators.max(31)]],
    flexibsn: ['SI' as 'SI' | 'NO' | null, Validators.required],
    TardeTrab: [null as number | null, [Validators.min(0), Validators.max(31)]],
    NocheTrab: [null as number | null, [Validators.min(0), Validators.max(31)]],
    InhabilSM: [null as number | null, [Validators.min(0), Validators.max(10)]],
    InhabilST: [null as number | null, [Validators.min(0), Validators.max(10)]],
    InhabilSN: [null as number | null, [Validators.min(0), Validators.max(10)]],
    InhabilDM: [null as number | null, [Validators.min(0), Validators.max(10)]],
    InhabilDT: [null as number | null, [Validators.min(0), Validators.max(10)]],
    InhabilDN: [null as number | null, [Validators.min(0), Validators.max(10)]],
    HEnoFest: [null as number | null, [Validators.min(0), Validators.max(10)]],
    HEFest: [null as number | null, [Validators.min(0), Validators.max(10)]],
    HComplem: [null as number | null, [Validators.min(0), Validators.max(200)]],
    HFormacion: [null as number | null, [Validators.min(0), Validators.max(100)]],
    SabadoTraba: [null as number | null, [Validators.min(0), Validators.max(10)]],
    DomingoTraba: [null as number | null, [Validators.min(0), Validators.max(10)]],
    Plus4Turno: [false, Validators.required],
    PlusMando: [false, Validators.required],
    PlusPersonal: [false, Validators.required],
    PagaAbril: [false, Validators.required],
    PagaSeptiem: [false, Validators.required],
    PrimaPai: [null as string | null],
    PrimaProdFormula: [null as string | null],
    PrimaCarenteIncentivos: [null as number | null, [Validators.min(0)]],
    PrimaAprovechamiento: [null as number | null, [Validators.min(0), Validators.max(1000)]],
    // New fields for Prima/PAI breakdown
    Rendimiento: [null as number | null, [Validators.min(0), Validators.max(100)]],
    Rx: [null as number | null],
    Presencia: [null as number | null],
    HigPers: [null as number | null],
    LimpMaq: [null as number | null],
    HorasVerdes: [null as number | null],
    HorasRojas: [null as number | null],
    irpf: [22, [Validators.min(0), Validators.max(100)]],
    Prestamos: [null as number | null, [Validators.min(0)]],
  });

  formValues = toSignal(this.payrollForm.valueChanges, { initialValue: this.payrollForm.getRawValue() });
  
  // Computed signal for category to isolate changes
  selectedCategory = computed(() => (this.formValues() as PayrollForm).category);

  constructor() {
    // Enforce positive values for specific fields
    ['Prestamos', 'PrimaCarenteIncentivos', 'PrimaAprovechamiento'].forEach(field => {
      this.payrollForm.get(field)?.valueChanges.subscribe(val => {
        if (val !== null && val < 0) {
          this.payrollForm.get(field)?.setValue(0, { emitEvent: false });
        }
      });
    });

    effect(() => {
      const results = this.devengos();
      const listEl = this.resultsList()?.nativeElement;
      if (listEl && results.length > 0) {
        const items = listEl.querySelectorAll('li');
        if (items.length > 0) {
          animate(
            items,
            { opacity: [0, 1], x: [-10, 0] },
            { delay: stagger(0.05), duration: 0.4, ease: 'easeOut' }
          );
        }
      }
    });

    // Effect to hide PrimaPai details on category change
    effect(() => {
      const category = this.selectedCategory();
      if (category) {
        // Use untracked to avoid any potential loops, though not strictly necessary here if just setting
        // But since we don't import untracked, just setting is fine as long as we don't read it
        this.showPrimaPaiDetails.set(false);
        this.clearPrimaProdDetails();
      }
    });

    // Effect for Prima/PAI calculation
    effect(() => {
      const form = this.formValues() as PayrollForm;
      
      // Only calculate if details are shown (or maybe always if flexibsn is SI?)
      // The requirement says: "Si Flexibilidad es SI, entonces: [calculation]. Si Flexibilidad es NO, el resultado queda vacío."
      
      if (form.flexibsn === 'NO') {
        // If Flex is NO, clear PrimaProdFormula if it has a value
        if (form.PrimaProdFormula !== null && form.PrimaProdFormula !== '' && form.PrimaProdFormula !== '0' && form.PrimaProdFormula !== '0.00') {
           this.payrollForm.controls.PrimaProdFormula.setValue(null, { emitEvent: false });
        }
        // Also hide details
        if (this.showPrimaPaiDetails()) {
            this.showPrimaPaiDetails.set(false);
        }
        return;
      }

      // If Flex is SI, calculate based on inputs
      // Check if any of the inputs have values to trigger calculation
      
      const hasInputs = form.Rendimiento !== null || form.Rx !== null || form.Presencia !== null;
      
      if (hasInputs) {
        const rendimiento = Number(form.Rendimiento || 0);
        const rx = Number(form.Rx || 0);
        const presencia = Number(form.Presencia || 0);
        const higPers = Number(form.HigPers || 0);
        const limpMaq = Number(form.LimpMaq || 0);
        const horasVerdes = Number(form.HorasVerdes || 0);
        const horasRojas = Number(form.HorasRojas || 0);
        const K = this.currentK();

        // 1. (Rendimiento * 1.55) - 1
        // 2. * Rx
        // 3. + 37
        const part1 = (((rendimiento * 1.55) - 1) * rx) + 37;

        // 4. (Presencia - Hig - Limp - Verdes - Rojas)
        // 5. / 1000
        // 6. * K
        const factorAjuste = presencia - higPers - limpMaq - horasVerdes - horasRojas;
        const part2 = (factorAjuste / 1000) * K;

        // 7. Part1 * Part2
        let result = part1 * part2;

        // Ensure result is valid number and not negative
        if (isNaN(result)) {
            result = 0;
        }
        if (result < 0) {
            result = 0;
        }

        // Update form control if value is different or if it was null
        const valStr = form.PrimaProdFormula ? String(form.PrimaProdFormula) : '';
        const currentVal = valStr ? Number(valStr.replace(',', '.')) : null;
        if (currentVal === null || currentVal === undefined || Math.abs(currentVal - result) > 0.01) {
            this.payrollForm.controls.PrimaProdFormula.setValue(result.toFixed(2), { emitEvent: true });
        }
      } else {
        // If no inputs, clear formula result
        if (form.PrimaProdFormula !== null) {
             this.payrollForm.controls.PrimaProdFormula.setValue(null, { emitEvent: true });
        }
      }
    }, { allowSignalWrites: true });

    // Effect to handle mutual exclusion between Inhabil days/Extra Hours and Sabado/Domingo Traba
    // REMOVED: User requested to unlock these fields always
    /*
    effect(() => {
      const form = this.formValues() as PayrollForm;
      const hasInhabilOrExtras = (
        (Number(form.InhabilSM) || 0) > 0 ||
        (Number(form.InhabilST) || 0) > 0 ||
        (Number(form.InhabilSN) || 0) > 0 ||
        (Number(form.InhabilDM) || 0) > 0 ||
        (Number(form.InhabilDT) || 0) > 0 ||
        (Number(form.InhabilDN) || 0) > 0 ||
        (Number(form.HEnoFest) || 0) > 0 ||
        (Number(form.HEFest) || 0) > 0
      );

      const sabadoCtrl = this.payrollForm.get('SabadoTraba');
      const domingoCtrl = this.payrollForm.get('DomingoTraba');

      if (hasInhabilOrExtras) {
        if (sabadoCtrl?.enabled) sabadoCtrl.disable({ emitEvent: true });
        if (domingoCtrl?.enabled) domingoCtrl.disable({ emitEvent: true });
      } else {
        if (sabadoCtrl?.disabled) sabadoCtrl.enable({ emitEvent: true });
        if (domingoCtrl?.disabled) domingoCtrl.enable({ emitEvent: true });
      }
    }, { allowSignalWrites: true });
    */
  }

  ngOnInit() {
    this.payrollDataService.fetchDynamicData().subscribe(() => {
      const availableYears = this.payrollDataService.getAvailableYears();
      const latestYear = availableYears.length > 0 ? Math.max(...availableYears) : new Date().getFullYear();
      
      const user = this.authService.currentUser();
      if (user) {
        this.payrollForm.patchValue({
          calculationYear: latestYear,
          category: user.categoria,
          porcent: user.porcentualidad,
          entryMonth: user.mesIngreso,
          entryYear: user.anoAntiguedad,
          flexibsn: user.cobraFlexibilidad !== false ? 'SI' : 'NO',
          PlusMando: user.plusMando || false,
          PlusPersonal: user.plusPersonal || false
        });
      } else {
        const currentYearData = this.payrollDataService.getDataForYear(latestYear);
        if (currentYearData[0]?.category) {
          this.payrollForm.patchValue({
            calculationYear: latestYear,
            category: currentYearData[0].category
          });
        }
      }
      this.isLoading.set(false);

      // Auto-load state when year or month changes
      this.payrollForm.get('calculationYear')?.valueChanges.subscribe(() => this.loadSavedState());
      this.payrollForm.get('calculationMonth')?.valueChanges.subscribe(() => this.loadSavedState());

      // Initial load
      this.loadSavedState();
    });

    // Auto-correct invalid values (negative numbers and future entry years)
    this.payrollForm.valueChanges.subscribe(values => {
      let needsUpdate = false;
      const updates: Partial<PayrollForm> = {};

      const numericFields = [
        'flexib', 'TardeTrab', 'NocheTrab', 'SabadoTraba', 'DomingoTraba',
        'InhabilSM', 'InhabilST', 'InhabilSN', 'InhabilDM', 'InhabilDT', 'InhabilDN',
        'HEnoFest', 'HEFest', 'HFormacion', 'HComplem',
        'PrimaAprovechamiento', 'PrimaCarenteIncentivos',
        'Rendimiento', 'Rx', 'Presencia', 'HigPers', 'LimpMaq', 'HorasVerdes', 'HorasRojas'
      ];

      for (const field of numericFields) {
        const val = values[field as keyof typeof values];
        if (val !== null && val !== undefined) {
          const numVal = Number(val);
          if (numVal < 0) {
            (updates as Record<string, number | string | boolean | null>)[field] = 0;
            needsUpdate = true;
          }
        }
      }

      if (values.entryYear !== null && values.entryYear !== undefined) {
        if (values.entryYear > this.currentYear) {
          updates.entryYear = this.currentYear;
          needsUpdate = true;
        }
      }

      if (values.PrimaPai !== null && values.PrimaPai !== undefined && values.PrimaPai !== '') {
        const numVal = Number(String(values.PrimaPai).replace(',', '.'));
        if (!isNaN(numVal) && numVal < 0) {
          updates.PrimaPai = '0';
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        this.payrollForm.patchValue(updates, { emitEvent: true });
      }
    });
  }

  onCsvUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const newData = this.payrollDataService.parseCSV(text);
        if (newData.length > 0) {
          this.payrollData.set(newData);
          this.isCustomData.set(true);
          
          // Try to keep current category if exists in new data, else reset
          const currentCat = this.payrollForm.controls.category.value;
          const newCats = newData.map(d => d.category);
          const uniqueCats = [...new Set(newCats)];
          
          if (currentCat && !uniqueCats.includes(currentCat)) {
               if (uniqueCats.length > 0) {
                   this.payrollForm.controls.category.setValue(uniqueCats[0]);
               }
          } else if (!currentCat && uniqueCats.length > 0) {
              this.payrollForm.controls.category.setValue(uniqueCats[0]);
          }
        }
      }
    };
    reader.readAsText(file);
    // Reset input value to allow re-uploading same file if needed
    input.value = '';
  }

  downloadPdf() {
    const doc = new jsPDF();
    const form = this.formValues();
    const devengos = this.devengos();
    const deducciones = this.deducciones();
    const totalBruto = this.totalBruto();
    const totalNeto = this.totalNeto();

    // Title
    doc.setFontSize(18);
    doc.setTextColor(220, 38, 38); // Red-600
    doc.text('Calculadora de Nómina - Resumen', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generado el: ${new Date().toLocaleDateString()}`, 14, 28);

    // Worker Data
    const workerData: string[][] = [];

    const user = this.authService.currentUser();
    if (user) {
      const name = this.employeeService.employees()[user.matricula];
      if (name) {
        workerData.push(['Nombre', name]);
      }
      workerData.push(['Matrícula', user.matricula]);
    }

    workerData.push(
      ['Categoría', form.category || '-'],
      ['Porcentualidad', `${form.porcent}%`],
      ['Fecha Nómina', `${form.calculationMonth}/${form.calculationYear}`],
      ['Fecha Ingreso', `${form.entryMonth}/${form.entryYear}`],
      ['Flexibilidad', `${form.flexibsn} (${form.flexib || 0} días)`],
      ['Turnos', `Tarde: ${form.TardeTrab||0} | Noche: ${form.NocheTrab||0} | Sáb: ${form.SabadoTraba||0} | Dom: ${form.DomingoTraba||0}`],
      ['Inhábiles', `SM:${form.InhabilSM||0} ST:${form.InhabilST||0} SN:${form.InhabilSN||0} DM:${form.InhabilDM||0} DT:${form.InhabilDT||0} DN:${form.InhabilDN||0}`],
      ['Horas Extras', `Lab: ${form.HEnoFest||0} | Fest: ${form.HEFest||0} | Formación: ${form.HFormacion||0} | Comp: ${form.HComplem||0}`],
      ['Pluses', [
        form.PlusMando ? 'Mando' : '',
        form.PlusPersonal ? 'Personal' : '',
        form.Plus4Turno ? 'Fin semana (4°Turno)' : '',
        form.PagaAbril ? 'Paga Abril' : '',
        form.PagaSeptiem ? 'Paga Septiembre' : ''
      ].filter(Boolean).join(', ') || 'Ninguno'],
      ['Primas Manuales', `P.Directa: ${form.PrimaPai||0}€ | PAI: ${form.PrimaAprovechamiento||0}€ | Carente: ${form.PrimaCarenteIncentivos||0}€`],
      ['IRPF', `${form.irpf || 0}%`]
    );

    if (form.flexibsn === 'SI' && (form.Rendimiento || form.Rx || form.Presencia || form.PrimaProdFormula)) {
      workerData.push(['Datos Fórmula Prima', `Rend: ${form.Rendimiento||0}% | Rx: ${form.Rx||0} | Pres: ${form.Presencia||0} | Hig: ${form.HigPers||0} | Limp: ${form.LimpMaq||0} | V: ${form.HorasVerdes||0} | R: ${form.HorasRojas||0}`]);
      workerData.push(['Resultado Fórmula', `${form.PrimaProdFormula || 0} €`]);
    }

    autoTable(doc, {
      startY: 35,
      head: [['Datos del Trabajador', 'Valor']],
      body: workerData,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38] },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
    });

    // Devengos
    let finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    
    const devengosBody = devengos.map(d => [d.label, d.value.toFixed(2)]);
    devengosBody.push(['Total Bruto', totalBruto.toFixed(2)]);

    autoTable(doc, {
      startY: finalY,
      head: [['Devengos (Bruto)', 'Importe (€)']],
      body: devengosBody,
      theme: 'striped',
      headStyles: { fillColor: [75, 85, 99] }, // Gray
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 1: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === devengosBody.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });

    finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    // Deducciones
    const deduccionesData = deducciones.map(d => [d.label, d.value.toFixed(2)]);
    deduccionesData.push(['IRPF', this.irpfValue().toFixed(2)]);
    
    if (form.Prestamos && form.Prestamos > 0) {
      deduccionesData.push(['Préstamos o Anticipos', form.Prestamos.toFixed(2)]);
    }
    
    const totalDeduccionesVal = this.totalDeducciones();
    deduccionesData.push(['Total Deducciones', totalDeduccionesVal.toFixed(2)]);

    autoTable(doc, {
      startY: finalY,
      head: [['Deducciones', 'Importe (€)']],
      body: deduccionesData,
      theme: 'striped',
      headStyles: { fillColor: [75, 85, 99] },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 1: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === deduccionesData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });

    finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

    // Totals
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.text(`Total Líquido a Percibir: ${totalNeto.toFixed(2)} €`, pageWidth - 14, finalY, { align: 'right' });

    doc.save(`Nomina_${form.category}_${form.calculationMonth}_${form.calculationYear}.pdf`);
  }

  getDefaultState(year: number, month: number) {
    const user = this.authService.currentUser();
    return {
      calculationYear: year,
      calculationMonth: month,
      category: user ? user.categoria : (this.categories().length > 0 ? this.categories()[0] : ''),
      porcent: user ? user.porcentualidad : 100,
      entryYear: user ? user.anoAntiguedad : this.currentYear,
      entryMonth: user ? user.mesIngreso : 1,
      flexib: null,
      flexibsn: (user ? (user.cobraFlexibilidad !== false ? 'SI' : 'NO') : 'SI') as 'SI' | 'NO',
      TardeTrab: null,
      NocheTrab: null,
      InhabilSM: null,
      InhabilST: null,
      InhabilSN: null,
      InhabilDM: null,
      InhabilDT: null,
      InhabilDN: null,
      HEnoFest: null,
      HEFest: null,
      HComplem: null,
      HFormacion: null,
      SabadoTraba: null,
      DomingoTraba: null,
      Plus4Turno: false,
      PlusMando: user ? (user.plusMando || false) : false,
      PlusPersonal: user ? (user.plusPersonal || false) : false,
      PagaAbril: false,
      PagaSeptiem: false,
      PrimaPai: null,
      PrimaAprovechamiento: null,
      Rendimiento: null,
      Rx: null,
      Presencia: null,
      HigPers: null,
      LimpMaq: null,
      HorasVerdes: null,
      HorasRojas: null,
      PrimaCarenteIncentivos: null,
      Prestamos: null,
      irpf: 22
    };
  }

  clearForm() {
    if (confirm('¿Estás seguro de que quieres limpiar todos los campos del formulario?')) {
      const year = Number(this.payrollForm.get('calculationYear')?.value) || new Date().getFullYear();
      const month = Number(this.payrollForm.get('calculationMonth')?.value) || this.defaultCalculationMonth;
      this.payrollForm.reset(this.getDefaultState(year, month));
      this.showNocturnidadDetails.set(false);
      this.showToxicoDetails.set(false);
      this.showPrimaPaiDetails.set(false);
    }
  }

  // New computed signal for the Excel-like breakdown
  nocturnidadBreakdown = computed<BreakdownRow[]>(() => {
    const form = this.formValues() as PayrollForm;
    const isJanuary = Number(form.calculationMonth) === 1;
    const year = form.calculationYear || 2026;

    let currentYearData: PayrollData | undefined;
    if (this.isCustomData()) {
      currentYearData = this.payrollData().find(d => d.category === form.category);
    } else {
      currentYearData = this.payrollDataService.getDataForYear(year).find(d => d.category === form.category);
    }

    if (!form || !form.category || !currentYearData) {
      return [];
    }

    let data: PayrollData | undefined = currentYearData;
    if (isJanuary && year > 2025 && !this.isCustomData()) {
      const prevYearData = this.payrollDataService.getDataForYear(year - 1).find(d => d.category === form.category);
      if (prevYearData && currentYearData) {
        data = { 
          ...prevYearData, 
          SALARIO_BASE: currentYearData.SALARIO_BASE, 
          PLUS_CONVENIO: currentYearData.PLUS_CONVENIO, 
          ANTIGUEDAD: currentYearData.ANTIGUEDAD 
        };
      }
    }
    if (!data) return [];

    const getVal = (keyOrKeys: string | string[]): number => {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      for (const key of keys) {
        if (typeof data[key] === 'number') return data[key] as number;
        const normKey = this.payrollDataService.normalizeKey(key);
        if (typeof data[normKey] === 'number') return data[normKey] as number;
      }
      return 0;
    };

    let quinquenios = 0;
    let yearsOfService = form.calculationYear - form.entryYear;
    if (form.calculationMonth < form.entryMonth) yearsOfService--;
    if (yearsOfService >= 0) quinquenios = Math.floor(yearsOfService / 5);

    // --- Factors ---
    const pNocheTrabajada = getVal('PLUS_NOCHE_TRABAJADA');
    const pTurnoNoche = getVal('TURNO_NOCHE');
    
    const qIndexNocturno = Math.min(quinquenios, 8);
    const nocturnoKey = `PLUS_NOCTURNO_${qIndexNocturno}_QUIN`;
    let pTrabajoNocturno = getVal([nocturnoKey]);
    if (pTrabajoNocturno === 0) {
        pTrabajoNocturno = getVal(['PLUS_NOCTURNO_0_QUIN', 'PLUS_TRABAJO_NOCTURNO']);
    }

    const rows: BreakdownRow[] = [];

    // 1. Plus Noche Trabajada
    if (form.NocheTrab > 0) {
      const val = form.NocheTrab * pNocheTrabajada;
      rows.push({
        concept: 'Plus Noche Trabajada',
        formula: `${form.NocheTrab} días × ${pNocheTrabajada}€`,
        value: val
      });
    }

    // 2. Turno Noche (Por Noches)
    if (form.NocheTrab > 0) {
      const val = form.NocheTrab * pTurnoNoche * 7.72;
      rows.push({
        concept: 'Turno Noche (Noches)',
        formula: `${form.NocheTrab} días × ${pTurnoNoche}€ × 7.72h`,
        value: val
      });
    }

    // 3. Plus Trabajo Nocturno (Using Flexibilidad as requested)
    if (form.NocheTrab > 0) {
      const val = form.NocheTrab * pTrabajoNocturno * 7.88;
      rows.push({
        concept: `Plus Trabajo Nocturno (${quinquenios} Quin.)`,
        formula: `${form.NocheTrab} dias × ${pTrabajoNocturno}€ × 7.88h`,
        value: val
      });
    }

    // 4. Turno Noche (Por Tardes)
    if (form.TardeTrab > 0) {
      const val = (form.TardeTrab * pTurnoNoche) / 6;
      rows.push({
        concept: 'Turno Noche (Tardes)',
        formula: `(${form.TardeTrab} días × ${pTurnoNoche}€) / 6`,
        value: val
      });
    }

    return rows;
  });

  // New computed signal for Plus Toxico breakdown
  toxicoBreakdown = computed<BreakdownRow[]>(() => {
    const form = this.formValues() as PayrollForm;
    const isJanuary = Number(form.calculationMonth) === 1;
    const year = form.calculationYear || 2026;

    let currentYearData: PayrollData | undefined;
    if (this.isCustomData()) {
      currentYearData = this.payrollData().find(d => d.category === form.category);
    } else {
      currentYearData = this.payrollDataService.getDataForYear(year).find(d => d.category === form.category);
    }

    if (!form || !form.category || !currentYearData) {
      return [];
    }

    let data: PayrollData | undefined = currentYearData;
    if (isJanuary && year > 2025 && !this.isCustomData()) {
      const prevYearData = this.payrollDataService.getDataForYear(year - 1).find(d => d.category === form.category);
      if (prevYearData && currentYearData) {
        data = { 
          ...prevYearData, 
          SALARIO_BASE: currentYearData.SALARIO_BASE, 
          PLUS_CONVENIO: currentYearData.PLUS_CONVENIO, 
          ANTIGUEDAD: currentYearData.ANTIGUEDAD 
        };
      }
    }
    if (!data) return [];

    const getVal = (keyOrKeys: string | string[]): number => {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      for (const key of keys) {
        if (typeof data[key] === 'number') return data[key] as number;
        const normKey = this.payrollDataService.normalizeKey(key);
        if (typeof data[normKey] === 'number') return data[normKey] as number;
      }
      return 0;
    };

    const diasFlexibilidad = Number(form.flexib) || 0;
    if (diasFlexibilidad <= 0) return [];

    let quinquenios = 0;
    let yearsOfService = form.calculationYear - form.entryYear;
    if (form.calculationMonth < form.entryMonth) yearsOfService--;
    if (yearsOfService >= 0) quinquenios = Math.floor(yearsOfService / 5);

    const qIndex = Math.min(quinquenios, 8);
    const toxicoKey = `TOXICO_${qIndex}_QUIN`;
    
    let valorToxico = getVal([toxicoKey]);
    if (valorToxico === 0) {
       valorToxico = getVal(['TOXICO_0_QUIN', 'PLUS_TOXICO', 'TOXICO', 'P_TOXICO']);
    }
    
    const totalToxico = diasFlexibilidad * 7.883 * valorToxico;

    if (totalToxico <= 0) return [];

    return [{
      concept: `Plus Tóxico (${quinquenios} Quinquenios)`,
      formula: `${diasFlexibilidad} días flex × ${valorToxico}€/h × 7.883h`,
      value: totalToxico
    }];
  });

  devengos = computed<CalculationResult[]>(() => {
    const form = this.formValues() as PayrollForm;
    const isJanuary = Number(form.calculationMonth) === 1;
    const year = form.calculationYear || 2026;

    let currentYearData: PayrollData | undefined;
    if (this.isCustomData()) {
      currentYearData = this.payrollData().find(d => d.category === form.category);
    } else {
      currentYearData = this.payrollDataService.getDataForYear(year).find(d => d.category === form.category);
    }

    // Helper to extract Prima value
    const getPrimaVal = () => {
        if (form.PrimaProdFormula && String(form.PrimaProdFormula) !== '') {
             const v = Number(String(form.PrimaProdFormula).replace(',', '.'));
             return (!isNaN(v) && v >= 0) ? v : 0;
        }
        if (form.PrimaPai && String(form.PrimaPai) !== '') {
             const v = Number(String(form.PrimaPai).replace(',', '.'));
             return (!isNaN(v) && v >= 0) ? v : 0;
        }
        return 0;
    };

    if (!form || !form.category || !currentYearData) {
       const val = getPrimaVal();
       if (val > 0) {
          return [{ label: 'Prima Productividad (Directa)', value: val }];
       }
       return [];
    }

    let data: PayrollData | undefined = currentYearData;
    if (isJanuary && year > 2025 && !this.isCustomData()) {
      const prevYearData = this.payrollDataService.getDataForYear(year - 1).find(d => d.category === form.category);
      if (prevYearData && currentYearData) {
        data = { 
          ...prevYearData, 
          SALARIO_BASE: currentYearData.SALARIO_BASE, 
          PLUS_CONVENIO: currentYearData.PLUS_CONVENIO, 
          ANTIGUEDAD: currentYearData.ANTIGUEDAD 
        };
      }
    }
    if (!data) {
       const val = getPrimaVal();
       if (val > 0) {
          return [{ label: 'Prima Productividad (Directa)', value: val }];
       }
       return [];
    }

    // Helper to get value using normalized keys from service to match CSV headers reliably
    // Accepts a single key or an array of fallback keys
    const getVal = (keyOrKeys: string | string[]): number => {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      
      for (const key of keys) {
        // 1. Try exact match
        if (typeof data[key] === 'number') return data[key] as number;
        
        // 2. Try normalized match
        const normKey = this.payrollDataService.normalizeKey(key);
        if (typeof data[normKey] === 'number') return data[normKey] as number;
      }
      return 0;
    };
    
    const results: CalculationResult[] = [];
    const porcentFactor = (form.porcent || 0) / 100;



    // Calculate Years of Service / Quinquenios FIRST
    let quinquenios = 0;
    let yearsOfService = form.calculationYear - form.entryYear;
    if (form.calculationMonth < form.entryMonth) {
      yearsOfService--;
    }
    if (yearsOfService >= 0) {
      quinquenios = Math.floor(yearsOfService / 5);
    }

    // --- 5.1 DEVENGOS (CALCULATION LOGIC) ---

    // 1. Salario Base
    const salarioBase = (data['SALARIO_BASE'] as number || 0) * porcentFactor;
    results.push({ label: LABEL_MAP['SALARIO_BASE'] || 'Salario Base', value: salarioBase });

    // 2. Plus Convenio
    const plusConvenio = (data['PLUS_CONVENIO'] as number || 0) * porcentFactor;
    if (plusConvenio > 0) {
      results.push({ label: LABEL_MAP['PLUS_CONVENIO'] || 'Plus Convenio', value: plusConvenio });
    }

    // 3. Antigüedad (Moved up to be after Plus Convenio)
    let valorAntiguedad = 0; // Variable to store calculated seniority for Paga Abril
    let valorAntiguedadSinPorcentualidad = 0;

    const isExcluded = EXCLUDED_CATEGORIES_ANTIGUEDAD.some(c => 
      (c && form.category && c.toUpperCase() === form.category.toUpperCase()) || 
      (c && data.category && c.toUpperCase() === data.category.toUpperCase())
    );

    if (!isExcluded) {
        if (quinquenios > 0) {
          let antiguedadBase = (data.ANTIGUEDAD || 0);
          // If specific column is missing or 0, usually implies it's calculated on Base Salary
          if (antiguedadBase === 0) {
             antiguedadBase = (data.SALARIO_BASE || 0);
          }

          // Calculate and store in local variable
          // 5% per quinquenio on the base
          valorAntiguedadSinPorcentualidad = antiguedadBase * (quinquenios * 0.05);
          valorAntiguedad = valorAntiguedadSinPorcentualidad * porcentFactor;
          
          if (valorAntiguedad > 0) {
            results.push({ label: `Antigüedad (${quinquenios} Quinquenios)`, value: valorAntiguedad });
          }
        }
    }
    
    // Flexibilidad
    // Ensure form.flexib is treated as a number
    const diasFlexibilidad = Number(form.flexib) || 0;

    if (form.flexibsn === 'SI' && diasFlexibilidad > 0) {
      const flexVal = getVal('FLEXIBILIDAD');
      if (flexVal > 0) {
        results.push({ label: `Comp. Flexibilidad (${diasFlexibilidad} días trabaj.)`, value: flexVal * diasFlexibilidad });
      }
    }

    // Plus Tóxico (Updated Logic: Depends on Quinquenios and Flexibilidad Days now)
    // Formerly calculated on DiasTrabajados
    
    if (form.flexibsn === 'SI' && diasFlexibilidad > 0) {
      // Determine which column to read: TOXICO_0_QUIN, TOXICO_1_QUIN, etc.
      // Cap at 8 Quinquenios as per table
      const qIndex = Math.min(quinquenios, 8);
      const toxicoKey = `TOXICO_${qIndex}_QUIN`;
      
      let valorToxico = getVal([toxicoKey]);
      
      // Fallback: If no value for this quinquenio level, try to fallback to base (0 QUIN)
      // This handles categories like DIRECTO_O.D.F which only have value in column 0
      if (valorToxico === 0) {
         valorToxico = getVal(['TOXICO_0_QUIN', 'PLUS_TOXICO', 'TOXICO', 'P_TOXICO']);
      }
      
      // Fórmula: Días (Flexibilidad) * 7.883 (horas) * Valor CSV Plus Toxico (hora)
      const totalToxico = diasFlexibilidad * 7.883 * valorToxico;
      
      if (totalToxico > 0) {
        results.push({ label: `${LABEL_MAP['PLUS_TOXICO'] || 'Plus Toxico'}`, value: totalToxico });
      }
    }

    // Plus Rotación
    // Calculated per day of flexibility/work as it is a daily additive for rotating personnel
    // UPDATED: Show ONLY if flexibsn is 'SI'
    // UPDATED: Subtract NocheTrab days from the calculation days
    const plusRotacion = getVal(['PLUS_ROTACION', 'ROTACION']);
    const diasRotacion = Math.max(0, diasFlexibilidad - (form.NocheTrab || 0));

    if (form.flexibsn === 'SI' && diasRotacion > 0 && plusRotacion > 0) {
       results.push({ label: LABEL_MAP['PLUS_ROTACION'], value: plusRotacion * diasRotacion *7.88});
    }
    
    // Paga Abril
    // Logic: Base Value + (Antiguedad * 0.48)
    if (form.PagaAbril && this.isEligibleForPlus4Turno()) {
       const baseVal = getVal('PAGA_ABRIL');
       const totalPagaAbril = baseVal + (valorAntiguedad * 0.48);
       
       if (totalPagaAbril > 0) {
         results.push({ label: LABEL_MAP['PAGA_ABRIL'], value: totalPagaAbril });
       }
    }

    // Paga Septiembre
    if (form.PagaSeptiem && this.isEligibleForPlus4Turno()) {
       const val = getVal('PAGA_SEPTIEMBRE');
       if (val > 0) results.push({ label: LABEL_MAP['PAGA_SEPTIEMBRE'], value: val });
    }

    // 5. Nocturnidad
    const pNocheTrabajada = getVal('PLUS_NOCHE_TRABAJADA');
    const pTurnoNoche = getVal('TURNO_NOCHE');
    
    // Prepare Plus Trabajo Nocturno (Included in Nocturnidad Total now)
    const qIndexNocturno = Math.min(quinquenios, 8);
    const nocturnoKey = `PLUS_NOCTURNO_${qIndexNocturno}_QUIN`;
    let pTrabajoNocturno = getVal([nocturnoKey]);
    
    if (pTrabajoNocturno === 0) {
        // Fallback to legacy column or 0 QUIN if specific is missing
        pTrabajoNocturno = getVal(['PLUS_NOCTURNO_0_QUIN', 'PLUS_TRABAJO_NOCTURNO']);
    }

    let nocturnidadTotal = 0;
    
    // 5.1 Plus Noche Trabajada + Turno Noche (Noches)
    if (form.NocheTrab > 0) {
      nocturnidadTotal += form.NocheTrab * pNocheTrabajada;
      nocturnidadTotal += form.NocheTrab * pTurnoNoche * 7.72;
      nocturnidadTotal += form.NocheTrab * pTrabajoNocturno * 7.88;
    }
    
    // 5.3 Turno Noche (Tardes)
    if (form.TardeTrab > 0) {
      nocturnidadTotal += (form.TardeTrab * pTurnoNoche) / 6;
    }

    if (nocturnidadTotal > 0) {
      results.push({ label: 'Nocturnidad', value: nocturnidadTotal });
    }

    // 6. Inhábiles
    const inhabilMap = [
      { count: form.InhabilSM, key: 'INHABIL_SABADO_M', label: LABEL_MAP['INHABIL_SABADO_M'] },
      { count: form.InhabilST, key: 'INHABIL_SABADO_T', label: LABEL_MAP['INHABIL_SABADO_T'] },
      { count: form.InhabilSN, key: 'INHABIL_SABADO_N', label: LABEL_MAP['INHABIL_SABADO_N'] },
      { count: form.InhabilDM, key: 'INHABIL_DOMINGO_M', label: LABEL_MAP['INHABIL_DOMINGO_M'] },
      { count: form.InhabilDT, key: 'INHABIL_DOMINGO_T', label: LABEL_MAP['INHABIL_DOMINGO_T'] },
      { count: form.InhabilDN, key: 'INHABIL_DOMINGO_N', label: LABEL_MAP['INHABIL_DOMINGO_N'] },
    ];

    for (const item of inhabilMap) {
      if (item.count > 0) {
        const price = getVal(item.key);
        if (price > 0 && item.label) {
          results.push({ label: item.label, value: price * item.count });
        }
      }
    }

    // 7. Fin de Semana
    const priceFinSemana = getVal('DIA_FIN_SEMANA');
    
    if (form.SabadoTraba > 0 && priceFinSemana > 0) {
      results.push({ label: `Sáb. Trabaj. estando fin semana (4°Turno) (${form.SabadoTraba} ${form.SabadoTraba === 1 ? 'día' : 'días'})`, value: form.SabadoTraba * priceFinSemana });
    }

    if (form.DomingoTraba > 0 && priceFinSemana > 0) {
      results.push({ label: `Dom. Trabaj. estando fin semana (4°Turno) (${form.DomingoTraba} ${form.DomingoTraba === 1 ? 'día' : 'días'})`, value: form.DomingoTraba * priceFinSemana });
    }

    // 8. Horas Extras
    if (form.HEnoFest > 0) {
      const price = getVal('HORAS_EXTRA_LABORABLES');
      const val = form.HEnoFest * price * 8; 
      results.push({ label: `Horas Extras Laborables (${form.HEnoFest} ${form.HEnoFest === 1 ? 'día' : 'días'})`, value: val });
    }
    if (form.HEFest > 0) {
      const price = getVal('HORAS_EXTRA_FESTIVA');
      const val = form.HEFest * price * 8; 
      results.push({ label: `Horas Extras Festivas (${form.HEFest} ${form.HEFest === 1 ? 'día' : 'días'})`, value: val });
    }
    
    // 9. Formación
    if (form.HFormacion > 0 && form.category !== 'DIRECTO_O.D.F.') {
       let price = getVal('FORMACION');
       
       // Special rule: For Indirect categories starting with D, E, F, price is 13.43
       // For Indirect categories starting with A, B, C, price is 10.99
       if (form.category && form.category.startsWith('INDIRECTO')) {
          const suffix = form.category.replace('INDIRECTO_', '');
          if (suffix.startsWith('D') || suffix.startsWith('E') || suffix.startsWith('F')) {
             price = 13.43;
          } else if (suffix.startsWith('A') || suffix.startsWith('B') || suffix.startsWith('C')) {
             price = 10.99;
          }
       }
       
       results.push({ label: `Horas de Formación (${form.HFormacion}h)`, value: price * form.HFormacion });
    }

    // Horas Complementarias
    if (form.HComplem > 0 && form.porcent !== 100) {
      const rawSalarioBase = getVal(['SALARIO_BASE', 'SALARIO', 'SUELDO_BASE', 'SUELDO', 'BASE', 'S_BASE']);
      const rawPlusConvenio = getVal(['PLUS_CONVENIO', 'CONVENIO', 'PLUS_DE_CONVENIO', 'P_CONVENIO']);
      
      if (porcentFactor > 0) {
        const baseCalculo = rawSalarioBase + rawPlusConvenio + valorAntiguedadSinPorcentualidad;
        const valorHora = ((baseCalculo * 14) / (1680 * porcentFactor));
        const totalHComplem = 7.88 * valorHora * form.HComplem;
        
        if (totalHComplem > 0) {
          results.push({ label: `Horas Complementarias (${form.HComplem} ${form.HComplem === 1 ? 'día' : 'días'})`, value: totalHComplem });
        }
      }
    }

    // 4. Pluses (Moved to the end)
    
    // Plus Mando
    if (form.PlusMando) {
      const val = getVal('PLUS_MANDO');
      if (val > 0) results.push({ label: LABEL_MAP['PLUS_MANDO'], value: val });
    }

    // Plus Personal
    if (form.PlusPersonal) {
      const val = getVal('PLUS_PERSONAL');
      if (val > 0) results.push({ label: LABEL_MAP['PLUS_PERSONAL'], value: val });
    }

    // Trabajo fin semana (4°Turno)
    if (form.Plus4Turno && this.isEligibleForPlus4Turno()) {
       const val = getVal('PLUS_4_TURNO');
       if (val > 0) results.push({ label: LABEL_MAP['PLUS_4_TURNO'], value: val });
    }

    // 10. Prima Directa
    // Check PrimaProdFormula first (calculated), then PrimaPai (manual)
    // EXCEPTION: For INDIRECTO categories, ignore formula and use manual value only
    let primaDirectaVal = 0;
    let hasPrimaDirecta = false;
    
    const isIndirect = form.category?.startsWith('INDIRECTO');

    if (!isIndirect && form.PrimaProdFormula !== null && form.PrimaProdFormula !== undefined && String(form.PrimaProdFormula) !== '') {
        const valStr = String(form.PrimaProdFormula);
        const val = Number(valStr.replace(',', '.'));
        if (!isNaN(val) && val >= 0) {
            primaDirectaVal = val;
            hasPrimaDirecta = true;
        }
    } 
    
    // If no formula value (or ignored because indirect), check manual
    if (!hasPrimaDirecta && form.PrimaPai !== null && form.PrimaPai !== undefined && String(form.PrimaPai) !== '') {
        const valStr = String(form.PrimaPai);
        const val = Number(valStr.replace(',', '.'));
        if (!isNaN(val) && val >= 0) {
            primaDirectaVal = val;
            hasPrimaDirecta = true;
        }
    }

    if (hasPrimaDirecta) {
        results.push({ label: 'Prima Productividad (Directa)', value: primaDirectaVal });
    }

    // 11. Prima Aprovechamiento Inversion (PAI)
    if (form.PrimaAprovechamiento > 0) {
      const label = form.category?.startsWith('INDIRECTO') ? 'PAI/Prima PO/Mantenimiento' : 'Prima Aprovechamiento Inversion (PAI)';
      results.push({ label: label, value: form.PrimaAprovechamiento });
    }

    // 12. Prima Carente Incentivos
    if (form.PrimaCarenteIncentivos && form.PrimaCarenteIncentivos > 0) {
      results.push({ label: 'Prima Carente Incentivos', value: form.PrimaCarenteIncentivos });
    }

    return results;
  });

  totalBruto = computed(() => {
    return this.devengos().reduce((sum, item) => sum + item.value, 0);
  });

  baseCotizacion = computed(() => {
    const devengosList = this.devengos();
    const form = this.formValues() as PayrollForm;
    
    // 1. Remuneración Mensual = Total Bruto - Pagas Extras (if any)
    let remuneracionMensual = this.totalBruto();
    
    const labelPagaAbril = LABEL_MAP['PAGA_ABRIL'] || 'Paga Extra Abril';
    const labelPagaSept = LABEL_MAP['PAGA_SEPTIEMBRE'] || 'Paga Extra Septiembre';
    
    const pagaAbril = devengosList.find(d => d.label === labelPagaAbril);
    if (pagaAbril) remuneracionMensual -= pagaAbril.value;
    
    const pagaSept = devengosList.find(d => d.label === labelPagaSept);
    if (pagaSept) remuneracionMensual -= pagaSept.value;
    
    // 2. Prorrata Pagas Extras
    const labelSalario = LABEL_MAP['SALARIO_BASE'] || 'Salario Base';
    const labelConvenio = LABEL_MAP['PLUS_CONVENIO'] || 'Plus Convenio';
    
    const salario = devengosList.find(d => d.label === labelSalario)?.value || 0;
    const convenio = devengosList.find(d => d.label === labelConvenio)?.value || 0;
    const antiguedad = devengosList.find(d => d.label.startsWith('Antigüedad'))?.value || 0;
    const primaMinima = this.currentPrimaMinimaGarantizada();
    
    // Formula: ((Salario Base + Plus Convenio + Antigüedad + prima minima garantizada) * 2) + paga extra abril + paga extra septiembre) / 12
    // Condition for adding pagas extras: antiguedad anterior al 01/2005 (entryYear < 2005)
    
    let prorrata = ((salario + convenio + antiguedad + primaMinima) * 2);
    
    if (form.entryYear < 2005) {
       // Paga extra abril: Salario Base + Plus Convenio + (Antigüedad * 0.48) 
       const pagaAbrilValue = salario + convenio + (antiguedad * 0.48) ;
       // Paga extra septiembre: Salario Base + Plus Convenio + Antigüedad 
       const pagaSeptValue = salario + convenio + antiguedad ;
       
       prorrata += pagaAbrilValue + pagaSeptValue;
    }
    
    prorrata = prorrata / 12;
    
    let base = remuneracionMensual + prorrata;
    
    const maxBase = this.payrollDataService.getBaseMaximaCotizacion(form.calculationYear);
    if (base > maxBase) {
      base = maxBase;
    }
    
    return base;
  });

  deducciones = computed<CalculationResult[]>(() => {
    const base = this.baseCotizacion();
    if (base <= 0) return [];

    const form = this.formValues() as PayrollForm;
    const results: CalculationResult[] = [];

    // 1. Contingencias Comunes (4.70%)
    const cc = base * 0.047;
    results.push({ label: 'Contingencias Comunes (4.70%)', value: cc });

    // 2. Desempleo (1.55%)
    const desempleo = base * 0.0155;
    results.push({ label: 'Desempleo (1.55%)', value: desempleo });

    // 3. Formación Profesional (0.10%)
    const fp = base * 0.001;
    results.push({ label: 'Formación Profesional (0.10%)', value: fp });

    // 4. MEI (Mecanismo Equidad Intergeneracional)
    const meiPercent = this.payrollDataService.getMeiValue(form.calculationYear);
    const meiRate = meiPercent / 100;
    const meiLabel = `Mecanismo Equidad Intergeneracional (MEI) (${meiPercent.toFixed(2)}%)`;
    const mei = base * meiRate;
    results.push({ label: meiLabel, value: mei });

    return results;
  });

  irpfValue = computed(() => {
    const bruto = this.totalBruto();
    const form = this.formValues() as PayrollForm;
    const irpfRate = (form.irpf || 0) / 100;
    return bruto * irpfRate;
  });

  totalDeducciones = computed(() => {
    const form = this.formValues() as PayrollForm;
    const prestamos = Number(form.Prestamos) || 0;
    return this.deducciones().reduce((sum, item) => sum + item.value, 0) + this.irpfValue() + prestamos;
  });

  totalNeto = computed(() => {
    return this.totalBruto() - this.totalDeducciones();
  });

  clearPrimaProdDetails() {
    this.payrollForm.patchValue({
      Rendimiento: null,
      Rx: null,
      Presencia: null,
      HigPers: null,
      LimpMaq: null,
      HorasVerdes: null,
      HorasRojas: null
    });
  }

  saveData(showConfirm = true) {
    const user = this.authService.currentUser();
    if (!user) return;

    if (!showConfirm || confirm('¿Quieres guardar los datos actuales?')) {
      const form = this.payrollForm.getRawValue() as PayrollForm;
      this.payrollStateService.saveState(
        user.matricula,
        Number(form.calculationYear),
        Number(form.calculationMonth),
        form
      );
    }
  }

  loadSavedState() {
    const user = this.authService.currentUser();
    if (!user) return;

    const year = Number(this.payrollForm.get('calculationYear')?.value);
    const month = Number(this.payrollForm.get('calculationMonth')?.value);

    const saved = this.payrollStateService.loadState<Partial<PayrollForm>>(user.matricula, year, month);
    if (saved) {
      this.payrollForm.patchValue(saved, { emitEvent: false });
    } else {
      // If no saved state, reset to defaults for this month/year
      
      // If guest, preserve current category and seniority values from the form
      if (user.matricula.startsWith('GUEST_')) {
          const currentForm = this.payrollForm.getRawValue();
          const defaultState = this.getDefaultState(year, month);
          
          // Overwrite default state with current values for specific fields
          const preservedState = {
              ...defaultState,
              category: currentForm.category,
              porcent: currentForm.porcent,
              entryYear: currentForm.entryYear,
              entryMonth: currentForm.entryMonth,
              // Also preserve flexibility setting as it's often related to category
              flexibsn: currentForm.flexibsn
          };
          this.payrollForm.reset(preservedState, { emitEvent: false });
      } else {
          this.payrollForm.reset(this.getDefaultState(year, month), { emitEvent: false });
      }
    }
  }

  deleteCurrentMonthData() {
    const user = this.authService.currentUser();
    if (!user) return;

    const year = Number(this.payrollForm.get('calculationYear')?.value);
    const month = Number(this.payrollForm.get('calculationMonth')?.value);

    // Get month name for better UX
    const monthName = this.months.find(m => m.value === month)?.name || month;

    if (confirm(`¿Estás seguro de que quieres borrar los datos guardados de ${monthName} ${year}?`)) {
      this.payrollStateService.deleteState(user.matricula, year, month);
      this.payrollForm.reset(this.getDefaultState(year, month));
      this.showNocturnidadDetails.set(false);
      this.showToxicoDetails.set(false);
      this.showPrimaPaiDetails.set(false);
    }
  }

  logout() {
    const user = this.authService.currentUser();
    if (user && !user.matricula.startsWith('GUEST_')) {
      this.saveData(false);
    }
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}