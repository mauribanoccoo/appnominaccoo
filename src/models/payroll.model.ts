export interface PayrollData {
  category: string;
  SALARIO_BASE?: number;
  PLUS_CONVENIO?: number;
  ANTIGUEDAD?: number;
  FLEXIBILIDAD?: number;
  TURNO_NOCHE?: number;
  PLUS_ROTACION?: number;
  PLUS_NOCHE_TRABAJADA?: number;
  PAGA_SEPTIEMBRE?: number;
  PAGA_ABRIL?: number;
  FORMACION?: number;
  HORAS_EXTRA_LABORABLES?: number;
  HORAS_EXTRA_FESTIVA?: number;
  INHABIL_SABADO_M?: number;
  INHABIL_SABADO_T?: number;
  INHABIL_SABADO_N?: number;
  INHABIL_DOMINGO_M?: number;
  INHABIL_DOMINGO_T?: number;
  INHABIL_DOMINGO_N?: number;
  PLUS_MANDO?: number;
  PLUS_PERSONAL?: number;
  DIA_FIN_SEMANA?: number;
  PLUS_4_TURNO?: number;
  [key: string]: string | number | undefined;
}

export interface PayrollForm {
  calculationYear: number;
  calculationMonth: number;
  category: string;
  porcent: number;
  entryYear: number;
  entryMonth: number;
  flexib: number;
  flexibsn: 'SI' | 'NO' | null;
  TardeTrab: number;
  NocheTrab: number;
  InhabilSM: number;
  InhabilST: number;
  InhabilSN: number;
  InhabilDM: number;
  InhabilDT: number;
  InhabilDN: number;
  HEnoFest: number;
  HEFest: number;
  HComplem: number;
  HFormacion: number;
  SabadoTraba: number;
  DomingoTraba: number;
  Plus4Turno: boolean;
  PlusMando: boolean;
  PlusPersonal: boolean;
  PagaAbril: boolean;
  PagaSeptiem: boolean;
  PrimaPai: string | null;
  PrimaProdFormula: string | null;
  PrimaCarenteIncentivos?: number;
  PrimaAprovechamiento: number;
  Rendimiento?: number;
  Rx?: number;
  Presencia?: number;
  HigPers?: number;
  LimpMaq?: number;
  HorasVerdes?: number;
  HorasRojas?: number;
  irpf?: number;
  Prestamos?: number;
}

export interface CalculationResult {
  label: string;
  value: number;
}
