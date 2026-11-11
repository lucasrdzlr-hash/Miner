export type ShiftRegime = '14x14' | '21x7' | '7x7' | '5x2';

export interface MaterialItem {
  id: string;
  name: string;
  unit: string;
  yieldRatio: number; // Coeficiente de aporte por unidad del APU
  wastePercent: number; // % de desperdicio / merma en pozo
  unitPrice: number; // USD por unidad
}

export interface LaborItem {
  id: string;
  role: string; // Categoría: Perforista Principal, Jefe de Sonda, Ayudante Boca de Pozo, Inyeccionista, etc.
  unit: string; // 'hh' (Horas Hombre) o 'jor'
  yieldRatio: number; // HH requeridas por unidad de APU
  hourlyRate: number; // Jornal / Tarifa base horaria (USD/h)
  socialChargesPercent: number; // % Cargas sociales + Seguro Riesgo Minero/Petrolero
  shiftRegime: ShiftRegime; // Régimen de turno de campo: 14x14, 21x7, 7x7, 5x2
  zoneAllowancePercent: number; // % Adicional por Zona Desfavorable / Altura / Puna
  campCostPerDay: number; // Costo diario de Campamento, Vianda y Transporte de relevo (USD/día por operario)
}

export interface EquipmentItem {
  id: string;
  name: string; // Ej: Perforadora Diamantina LF-90D, Sonda Rotaria Schramm, Bomba Triplex
  category?: 'rig' | 'pump' | 'generator' | 'crane' | 'auxiliary';
  unit: string; // 'hm' (Horas Máquina)
  yieldRatio: number; // HM operativas por unidad de APU
  runningRate: number; // Tarifa Operativa (Running) en USD/h (sin combustible)
  standbyRate: number; // Tarifa en Espera (Stand-by) en USD/h
  standbyHoursRatio: number; // Fracción de horas Stand-by asociadas por cada hora Running (ej. 0.15 = 15% por maniobras/fraguado/perfilaje)
  dieselConsumptionLph: number; // Consumo horario de Gasoil en operación (Litros/hora)
  dieselPricePerLiter: number; // Precio del Gasoil en campo (USD/Litro)
}

export interface ApuItem {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  description: string;
  materials: MaterialItem[];
  labor: LaborItem[];
  equipment: EquipmentItem[];
  overheadPercent: number; // Gastos Generales de Campaña y Base (%)
  profitPercent: number; // Beneficio Industrial (%)
  taxPercent: number; // Impuestos / IVA (%)
  lastUpdated: string;
}

export interface GeologicalStratum {
  id: string;
  code: string;
  name: string;
  fromDepthM: number;
  toDepthM: number;
  lithology: string;
  hardnessRqd: number; // RQD % / Dureza de roca
  expectedRopMph: number; // Tasa de penetración esperada (m/h)
  mudDensityPpg: number; // Densidad de lodo requerida (lb/gal)
  colorHex: string;
  description: string;
}

export type WellType = 'ddh' | 'rc' | 'water_brine' | 'electromechanical';

export interface WellOrFront {
  id: string;
  code: string; // Ej: POZO DDH-01, POZO RC-03, FRENTE EM-05
  name: string;
  type: WellType;
  padName: string; // Plataforma / Locación (Pad Norte, Pad Central, etc.)
  targetDepthM: number; // Profundidad objetivo (m)
  drilledDepthM: number; // Profundidad perforada actual (m)
  casingDepthM: number; // Profundidad entubada con Casing API (m)
  diameterInches: string; // Ej: 'HQ (3.78") / NQ (2.98")' o '8 1/2" -> Casing 6 5/8"'
  azimuthDeg: number;
  dipDeg: number; // -90° vertical, -75° inclinado
  rigAssigned: string; // Sonda o equipo principal asignado
  status: 'active_drilling' | 'standby_woc' | 'casing_cementing' | 'electromechanical' | 'completed' | 'planned';
  runningHoursTotal: number;
  standbyHoursTotal: number;
  dieselConsumedLiters: number;
  coords: { x: number; z: number }; // Coordenadas relativas en el bloque 3D/4D
}

export interface BudgetLineItem {
  id: string;
  code: string;
  apuId: string;
  wellOrFrontId: string; // Vinculado a Pozo o Frente de Obra
  stratumId?: string; // Vinculado opcionalmente a un estrato geológico
  category: string;
  name: string;
  unit: string;
  quantity: number; // Cómputo métrico (metros de pozo, m3 lodo, un montaje)
  progress: number; // % de avance real (0 - 100)
}

export interface ScheduleTask {
  id: string;
  code: string;
  wellOrFrontId: string;
  phaseName: string;
  description: string;
  category: string;
  unit: string;
  computedQuantity: number;
  startDate: string;
  endDate: string;
  durationWorkingDays: number;
  progress: number;
  predecessorId: string | null;
  isCriticalPath: boolean;
  assignedRig: string;
  shiftRegime: ShiftRegime;
  crewSize: number;
}

export interface DailyDrillingLog {
  id: string;
  projectId: string;
  wellOrFrontId: string;
  date: string;
  shift: 'Día (08:00 - 20:00)' | 'Noche (20:00 - 08:00)';
  shiftRegime: ShiftRegime;
  rigName: string;
  supervisorName: string;
  depthFromM: number;
  depthToM: number;
  coreRecoveryPercent: number;
  runningHours: number;
  standbyHours: number;
  standbyReason: string;
  dieselConsumedLiters: number;
  mudDensityPpg: number;
  mudViscositySec: number;
  bentoniteBagsUsed: number;
  crewCount: number;
  generalNotes: string;
}

export interface ProjectCampaign {
  id: string;
  code: string;
  name: string;
  client: string;
  locationName: string;
  altitudeMasl: number; // Altitud m.s.n.m. (ej. 3850 msnm en Puna)
  coordinates: { lat: number; lng: number };
  startDate: string;
  endDate: string;
  status: 'planning' | 'in_progress' | 'paused' | 'completed';
  currency: string;
  dieselBasePricePerLiter: number;
  defaultShiftRegime: ShiftRegime;
  defaultZoneAllowancePercent: number;
  defaultCampCostPerDay: number;
  strata: GeologicalStratum[];
  wells: WellOrFront[];
  budgetItems: BudgetLineItem[];
  scheduleTasks: ScheduleTask[];
  dailyLogs: DailyDrillingLog[];
  lastSyncedAt?: string;
}

export type UserRole = 'admin' | 'client' | 'technician' | 'foreman';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  shiftRegime?: ShiftRegime;
  assignedPadOrScope: string;
  pinCode: string;
}

export interface RolePermissions {
  role: UserRole;
  roleTitle: string;
  roleSubtitle: string;
  badgeColor: string;
  // Vistas habilitadas en barra de navegación
  canViewDashboard4D: boolean;
  canViewWellsAndFronts: boolean;
  canViewApuAndResources: boolean;
  canViewFinanceAndLogistics: boolean;
  canManageUsersAndRoles: boolean;
  // Acciones granulares permitidas
  canCreateCampaign: boolean;
  canEditWellsAndProgress: boolean;
  canCreateDailyDrillingLog: boolean;
  canEditBudgetAndQuantities: boolean;
  canEditApuAndRates: boolean;
  canEditGlobalDieselAndShifts: boolean;
  canRunFinancialCashflow: boolean;
  allowedSubViewsInCampaign: ('wells_fronts' | 'budget_compute' | 'gantt_schedule' | 'daily_logs')[];
  permissionsList: string[];
  restrictionsList: string[];
}

export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case 'admin':
      return {
        role: 'admin',
        roleTitle: 'Administrador General',
        roleSubtitle: 'Dirección de Operaciones, Contratos, Costos y Control Integral',
        badgeColor: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
        canViewDashboard4D: true,
        canViewWellsAndFronts: true,
        canViewApuAndResources: true,
        canViewFinanceAndLogistics: true,
        canManageUsersAndRoles: true,
        canCreateCampaign: true,
        canEditWellsAndProgress: true,
        canCreateDailyDrillingLog: true,
        canEditBudgetAndQuantities: true,
        canEditApuAndRates: true,
        canEditGlobalDieselAndShifts: true,
        canRunFinancialCashflow: true,
        allowedSubViewsInCampaign: ['wells_fronts', 'budget_compute', 'gantt_schedule', 'daily_logs'],
        permissionsList: [
          'Control total de Campañas, Pozos (DDH/RC), Plataformas y Visor 4D Estratigráfico',
          'Edición completa de Matriz de APU, Tarifas Running vs Stand-by y Precio de Gasoil',
          'Configuración de liquidación de Mano de Obra (Turnos 14x14, 21x7, Zona y Campamento)',
          'Acceso a Flujo de Caja (Cashflow), Abastecimiento Crítico, Backups ZIP y Gestión de Usuarios',
        ],
        restrictionsList: ['Sin restricciones operativas ni financieras en la plataforma'],
      };
    case 'client':
      return {
        role: 'client',
        roleTitle: 'Cliente / Operadora Minera-Energética',
        roleSubtitle: 'Fiscalización de Avance de Campaña, Certificaciones y Gemelo 4D',
        badgeColor: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
        canViewDashboard4D: true,
        canViewWellsAndFronts: true,
        canViewApuAndResources: false,
        canViewFinanceAndLogistics: true,
        canManageUsersAndRoles: false,
        canCreateCampaign: false,
        canEditWellsAndProgress: false,
        canCreateDailyDrillingLog: false,
        canEditBudgetAndQuantities: false,
        canEditApuAndRates: false,
        canEditGlobalDieselAndShifts: false,
        canRunFinancialCashflow: false,
        allowedSubViewsInCampaign: ['wells_fronts', 'budget_compute', 'gantt_schedule', 'daily_logs'],
        permissionsList: [
          'Inspección interactiva del Gemelo Digital 4D (Estratos, Pozos perforados y Casing API)',
          'Consulta y auditoría de Cómputos Métricos, Certificaciones de Avance y Cronograma Gantt',
          'Lectura de Partes Diarios de Sonda (horas Running vs Stand-by imputables y recuperación de testigo)',
          'Descarga de legajos técnicos (ZIP/CSV) y visualización de avance presupuestario',
        ],
        restrictionsList: [
          'Modo Solo Lectura: no puede alterar avances físicos de pozos ni cargar partes diarios',
          'Sin acceso a la edición interna de APU, márgenes empresariales ni liquidación salarial de turnos',
        ],
      };
    case 'technician':
      return {
        role: 'technician',
        roleTitle: 'Técnico / Ingeniero de Perforación & Geología',
        roleSubtitle: 'Oficina Técnica, Cómputos, Ingeniería de Lodos, APU y Planificación Gantt',
        badgeColor: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
        canViewDashboard4D: true,
        canViewWellsAndFronts: true,
        canViewApuAndResources: true,
        canViewFinanceAndLogistics: false,
        canManageUsersAndRoles: false,
        canCreateCampaign: false,
        canEditWellsAndProgress: true,
        canCreateDailyDrillingLog: true,
        canEditBudgetAndQuantities: true,
        canEditApuAndRates: true,
        canEditGlobalDieselAndShifts: true,
        canRunFinancialCashflow: false,
        allowedSubViewsInCampaign: ['wells_fronts', 'budget_compute', 'gantt_schedule', 'daily_logs'],
        permissionsList: [
          'Edición técnica de APU del sector (rendimientos de coronas HQ/NQ, Casing API, lodos bentoníticos)',
          'Calibración de tarifas operativas (Running vs Stand-by) y consumo horario de Gasoil (L/h)',
          'Gestión de Columna Estratigráfica (RQD, ROP, densidad de lodo), Cómputos y Secuenciación Gantt',
          'Simulación 4D de estratos y pozos y validación técnica de Partes Diarios de Sonda',
        ],
        restrictionsList: [
          'Sin acceso al módulo de Tesorería/Cashflow corporativo ni creación/baja de contratos de campaña',
          'Sin permisos para modificar roles de usuarios o credenciales del sistema',
        ],
      };
    case 'foreman':
    default:
      return {
        role: 'foreman',
        roleTitle: 'Capataz de Sonda / Jefe de Campo (Toolpusher)',
        roleSubtitle: 'Operación en Plataforma (Pad), Parte Diario de Sonda, Gasoil y Turnos 14x14',
        badgeColor: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
        canViewDashboard4D: true,
        canViewWellsAndFronts: true,
        canViewApuAndResources: false,
        canViewFinanceAndLogistics: false,
        canManageUsersAndRoles: false,
        canCreateCampaign: false,
        canEditWellsAndProgress: true,
        canCreateDailyDrillingLog: true,
        canEditBudgetAndQuantities: false,
        canEditApuAndRates: false,
        canEditGlobalDieselAndShifts: false,
        canRunFinancialCashflow: false,
        allowedSubViewsInCampaign: ['wells_fronts', 'daily_logs', 'gantt_schedule'],
        permissionsList: [
          'Carga directa de Partes Diarios de Sonda (metros perforados, turno Día/Noche 14x14 y recuperación %)',
          'Registro en terreno de Horas Operativas (Running) vs Horas en Espera (Stand-by WOC/Clima)',
          'Reporte diario de Litros de Gasoil consumidos y parámetros de Lodo Bentonítico (ppg / seg Marsh)',
          'Actualización de profundidad perforada (m) y entubado Casing en Pozos y consulta de alertas climáticas',
        ],
        restrictionsList: [
          'Ocultamiento de costos unitarios en USD, presupuestos contractuales y márgenes financieros',
          'Sin acceso a edición de APU ni a configuración de tarifas horarias o liquidación de haberes',
        ],
      };
  }
}

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'usr-admin-01',
    name: 'Ing. Lucas Rodríguez',
    email: 'admin@prisma-akme.com',
    role: 'admin',
    roleLabel: 'Administrador / Director de Operaciones',
    shiftRegime: '5x2',
    assignedPadOrScope: 'Dirección General — Todas las Campañas y Contratos',
    pinCode: '1111',
  },
  {
    id: 'usr-client-02',
    name: 'Ing. Valeria Montes (Minera Andina)',
    email: 'cliente@minera-andina.com',
    role: 'client',
    roleLabel: 'Cliente / Representante Operadora Minera',
    shiftRegime: '14x14',
    assignedPadOrScope: 'Auditoría Comitente — Salar del Rincón & Domuyo',
    pinCode: '2222',
  },
  {
    id: 'usr-tech-03',
    name: 'Ing. Ramiro Cáceres',
    email: 'tecnico@prisma-akme.com',
    role: 'technician',
    roleLabel: 'Técnico / Ing. de Perforación, Lodos & APU',
    shiftRegime: '14x14',
    assignedPadOrScope: 'Oficina Técnica, Geología, Cómputos y Costos APU',
    pinCode: '3333',
  },
  {
    id: 'usr-foreman-04',
    name: 'Téc. Marcos Villalba (Toolpusher)',
    email: 'capataz@prisma-akme.com',
    role: 'foreman',
    roleLabel: 'Capataz de Sonda / Jefe de Campo 14x14',
    shiftRegime: '14x14',
    assignedPadOrScope: 'Plataformas Norte & Central (Sondas LF-90D y Schramm)',
    pinCode: '4444',
  },
];

// ============================================================================
// CÁLCULOS DE INGENIERÍA DE COSTOS (RUNNING vs STAND-BY, GASOIL, TURNOS 14x14 / 21x7)
// ============================================================================

/**
 * Factor de incidencia por régimen de rotación de campo:
 * - 14x14: Por cada puesto continuo en sonda se requiere relevo simétrico + logística de subida/bajada (factor 1.28 sobre base)
 * - 21x7: Mayor permanencia en campo con 25% descanso rotativo + horas suplementarias de campaña (factor 1.18 sobre base)
 * - 7x7: Rotación semanal corta (factor 1.22)
 * - 5x2: Régimen estándar sin rotación de campamento remoto (factor 1.00)
 */
export function getShiftRegimeMultiplier(regime: ShiftRegime): {
  rotationFactor: number;
  label: string;
  reliefCrewRatio: number;
  workDays: number;
  restDays: number;
} {
  switch (regime) {
    case '14x14':
      return {
        rotationFactor: 1.28,
        label: '14x14 (Puna / Alta Montaña - Doble Dotación Espejo)',
        reliefCrewRatio: 2.0,
        workDays: 14,
        restDays: 14,
      };
    case '21x7':
      return {
        rotationFactor: 1.18,
        label: '21x7 (Yacimiento / Energía - Relevo 4x3)',
        reliefCrewRatio: 1.33,
        workDays: 21,
        restDays: 7,
      };
    case '7x7':
      return {
        rotationFactor: 1.22,
        label: '7x7 (Guardia Rotativa Semanal)',
        reliefCrewRatio: 2.0,
        workDays: 7,
        restDays: 7,
      };
    case '5x2':
    default:
      return {
        rotationFactor: 1.0,
        label: '5x2 (Base Operativa / Taller Central)',
        reliefCrewRatio: 1.0,
        workDays: 5,
        restDays: 2,
      };
  }
}

export function calculateLaborHourlyBreakdown(item: LaborItem) {
  const regimeInfo = getShiftRegimeMultiplier(item.shiftRegime);
  // Jornal base + Adicional por Zona Desfavorable + Incidencia del Régimen de Turno (14x14 / 21x7)
  const baseWithZone = item.hourlyRate * (1 + (item.zoneAllowancePercent || 0) / 100);
  const wageWithRegime = baseWithZone * regimeInfo.rotationFactor;
  const socialChargesAmount = wageWithRegime * ((item.socialChargesPercent || 0) / 100);
  // Incidencia horaria de campamento/vianda (turno de 12 hs efectivas en campo)
  const campHourlyIncidence = (item.campCostPerDay || 0) / 12;
  const effectiveHourlyRate = wageWithRegime + socialChargesAmount + campHourlyIncidence;
  const unitCostInApu = effectiveHourlyRate * (item.yieldRatio || 0);

  return {
    baseWithZone,
    wageWithRegime,
    socialChargesAmount,
    campHourlyIncidence,
    effectiveHourlyRate,
    unitCostInApu,
    regimeInfo,
  };
}

export function calculateEquipmentHourlyBreakdown(item: EquipmentItem) {
  // Costo horario Operativo (Running) + Costo horario de Gasoil + Incidencia horaria de Stand-by esperado
  const dieselHourlyCost = (item.dieselConsumptionLph || 0) * (item.dieselPricePerLiter || 0);
  const standbyIncidencePerRunningHour = (item.standbyRate || 0) * (item.standbyHoursRatio || 0);
  const effectiveHourlyRate = (item.runningRate || 0) + dieselHourlyCost + standbyIncidencePerRunningHour;

  const runningCostInApu = (item.runningRate || 0) * (item.yieldRatio || 0);
  const standbyCostInApu = standbyIncidencePerRunningHour * (item.yieldRatio || 0);
  const dieselCostInApu = dieselHourlyCost * (item.yieldRatio || 0);
  const dieselLitersPerUnit = (item.dieselConsumptionLph || 0) * (item.yieldRatio || 0);
  const unitCostInApu = effectiveHourlyRate * (item.yieldRatio || 0);

  return {
    runningRate: item.runningRate || 0,
    standbyRate: item.standbyRate || 0,
    dieselHourlyCost,
    standbyIncidencePerRunningHour,
    effectiveHourlyRate,
    runningCostInApu,
    standbyCostInApu,
    dieselCostInApu,
    dieselLitersPerUnit,
    unitCostInApu,
  };
}

export function calculateMaterialUnitCost(item: MaterialItem) {
  const effectiveYield = (item.yieldRatio || 0) * (1 + (item.wastePercent || 0) / 100);
  const unitCostInApu = effectiveYield * (item.unitPrice || 0);
  return {
    effectiveYield,
    unitCostInApu,
  };
}

export function calculateApuTotals(apu: ApuItem) {
  const materialsSubtotal = apu.materials.reduce((acc, m) => acc + calculateMaterialUnitCost(m).unitCostInApu, 0);
  const laborSubtotal = apu.labor.reduce((acc, l) => acc + calculateLaborHourlyBreakdown(l).unitCostInApu, 0);

  let equipmentRunningSubtotal = 0;
  let equipmentStandbySubtotal = 0;
  let equipmentDieselSubtotal = 0;
  let dieselLitersPerUnit = 0;

  const equipmentSubtotal = apu.equipment.reduce((acc, eq) => {
    const b = calculateEquipmentHourlyBreakdown(eq);
    equipmentRunningSubtotal += b.runningCostInApu;
    equipmentStandbySubtotal += b.standbyCostInApu;
    equipmentDieselSubtotal += b.dieselCostInApu;
    dieselLitersPerUnit += b.dieselLitersPerUnit;
    return acc + b.unitCostInApu;
  }, 0);

  const directCostUnit = materialsSubtotal + laborSubtotal + equipmentSubtotal;
  const overheadAmount = directCostUnit * ((apu.overheadPercent || 0) / 100);
  const subtotalWithOverhead = directCostUnit + overheadAmount;
  const profitAmount = subtotalWithOverhead * ((apu.profitPercent || 0) / 100);
  const netPriceBeforeTax = subtotalWithOverhead + profitAmount;
  const taxAmount = netPriceBeforeTax * ((apu.taxPercent || 0) / 100);
  const unitPrice = netPriceBeforeTax + taxAmount;

  return {
    materialsSubtotal,
    laborSubtotal,
    equipmentSubtotal,
    equipmentRunningSubtotal,
    equipmentStandbySubtotal,
    equipmentDieselSubtotal,
    dieselLitersPerUnit,
    directCostUnit,
    overheadAmount,
    profitAmount,
    netPriceBeforeTax,
    taxAmount,
    unitPrice,
  };
}
