import React, { useState } from 'react';
import {
  ApuItem,
  BudgetLineItem,
  DailyDrillingLog,
  ProjectCampaign,
  RolePermissions,
  ShiftRegime,
  WellOrFront,
  WellType,
  calculateApuTotals,
} from '../types';
import {
  Plus,
  Trash2,
  Compass,
  FileText,
  Calendar,
  CloudRain,
  Sparkles,
  Download,
  Activity,
  Fuel,
  Layers,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface CampaignOperationsViewProps {
  campaign: ProjectCampaign;
  apuLibrary: ApuItem[];
  permissions: RolePermissions;
  onUpdateCampaign: (updated: ProjectCampaign) => void;
  onSelectWellIn4D: (wellId: string) => void;
}

export const CampaignOperationsView: React.FC<CampaignOperationsViewProps> = ({
  campaign,
  apuLibrary,
  permissions,
  onUpdateCampaign,
  onSelectWellIn4D,
}) => {
  const [activeSubView, setActiveSubView] = useState<
    'wells_fronts' | 'budget_compute' | 'gantt_schedule' | 'daily_logs'
  >('wells_fronts');

  // Filter budget by well
  const [wellFilterId, setWellFilterId] = useState<string>('all');

  // New Well / Front state
  const [showNewWellModal, setShowNewWellModal] = useState<boolean>(false);
  const [newWellCode, setNewWellCode] = useState<string>('POZO DDH-05');
  const [newWellName, setNewWellName] = useState<string>('Sondaje Exploratorio Profundo Sur');
  const [newWellPad, setNewWellPad] = useState<string>('Plataforma Sur (Pad E)');
  const [newWellType, setNewWellType] = useState<WellType>('ddh');
  const [newWellTargetM, setNewWellTargetM] = useState<number>(450);
  const [newWellRig, setNewWellRig] = useState<string>('Boart Longyear LF-90D #01');

  // New Budget Item state
  const [newBudgetApuId, setNewBudgetApuId] = useState<string>(apuLibrary[0]?.id || '');
  const [newBudgetWellId, setNewBudgetWellId] = useState<string>(campaign.wells[0]?.id || '');
  const [newBudgetQty, setNewBudgetQty] = useState<number>(250);

  // New Daily Drilling Log state
  const [logWellId, setLogWellId] = useState<string>(campaign.wells[0]?.id || '');
  const [logShift, setLogShift] = useState<'Día (08:00 - 20:00)' | 'Noche (20:00 - 08:00)'>('Día (08:00 - 20:00)');
  const [logShiftRegime, setLogShiftRegime] = useState<ShiftRegime>(campaign.defaultShiftRegime);
  const [logFromM, setLogFromM] = useState<number>(412);
  const [logToM, setLogToM] = useState<number>(430);
  const [logRunningHrs, setLogRunningHrs] = useState<number>(10.0);
  const [logStandbyHrs, setLogStandbyHrs] = useState<number>(2.0);
  const [logStandbyReason, setLogStandbyReason] = useState<string>(
    'Acondicionamiento de lodo bentonítico y medición de inclinometría'
  );
  const [logDieselLiters, setLogDieselLiters] = useState<number>(340);
  const [logMudPpg, setLogMudPpg] = useState<number>(10.1);
  const [logBentoniteBags, setLogBentoniteBags] = useState<number>(12);
  const [logNotes, setLogNotes] = useState<string>('');

  // AI Schedule & Weather Advisor State
  const [isAiRunning, setIsAiRunning] = useState<boolean>(false);
  const [aiAdvisoryResult, setAiAdvisoryResult] = useState<any | null>(null);

  const handleAddWell = () => {
    if (!newWellCode.trim() || !newWellName.trim()) return;
    const count = campaign.wells.length;
    const newWell: WellOrFront = {
      id: `well-${Date.now()}`,
      code: newWellCode.trim(),
      name: newWellName.trim(),
      type: newWellType,
      padName: newWellPad.trim(),
      targetDepthM: Number(newWellTargetM) || 400,
      drilledDepthM: 25,
      casingDepthM: 12,
      diameterInches: newWellType === 'ddh' ? 'HQ (3.78") -> NQ (2.98")' : '8 ½" -> Casing 6 ⅝"',
      azimuthDeg: 0,
      dipDeg: -90,
      rigAssigned: newWellRig,
      status: 'active_drilling',
      runningHoursTotal: 18,
      standbyHoursTotal: 2,
      dieselConsumedLiters: 580,
      coords: {
        x: ((count % 3) - 1) * 20,
        z: (Math.floor(count / 3) - 0.5) * 18,
      },
    };
    onUpdateCampaign({
      ...campaign,
      wells: [...campaign.wells, newWell],
    });
    setShowNewWellModal(false);
  };

  const handleUpdateWellProgress = (
    wellId: string,
    field: 'drilledDepthM' | 'casingDepthM' | 'status',
    value: number | string
  ) => {
    const updatedWells = campaign.wells.map((w) => {
      if (w.id !== wellId) return w;
      if (field === 'status') {
        return { ...w, status: value as WellOrFront['status'] };
      }
      const numVal = Math.max(0, Number(value));
      return {
        ...w,
        [field]: Math.min(w.targetDepthM, numVal),
      };
    });
    onUpdateCampaign({ ...campaign, wells: updatedWells });
  };

  const handleAddBudgetLine = () => {
    const apu = apuLibrary.find((a) => a.id === newBudgetApuId);
    if (!apu) return;
    const newLine: BudgetLineItem = {
      id: `bi-${Date.now()}`,
      code: `${campaign.budgetItems.length + 1}.01`,
      apuId: apu.id,
      wellOrFrontId: newBudgetWellId || campaign.wells[0]?.id || '',
      stratumId: campaign.strata[0]?.id,
      category: apu.category,
      name: `${apu.name} (${campaign.wells.find((w) => w.id === newBudgetWellId)?.code || 'Campaña'})`,
      unit: apu.unit,
      quantity: Math.max(1, Number(newBudgetQty)),
      progress: 0,
    };
    onUpdateCampaign({
      ...campaign,
      budgetItems: [...campaign.budgetItems, newLine],
    });
  };

  const handleUpdateBudgetLine = (
    lineId: string,
    field: 'quantity' | 'progress',
    value: number
  ) => {
    onUpdateCampaign({
      ...campaign,
      budgetItems: campaign.budgetItems.map((bi) =>
        bi.id === lineId
          ? {
              ...bi,
              [field]: field === 'progress' ? Math.min(100, Math.max(0, value)) : Math.max(0, value),
            }
          : bi
      ),
    });
  };

  const handleDeleteBudgetLine = (lineId: string) => {
    onUpdateCampaign({
      ...campaign,
      budgetItems: campaign.budgetItems.filter((bi) => bi.id !== lineId),
    });
  };

  const handleAddDailyDrillingLog = () => {
    const targetWell = campaign.wells.find((w) => w.id === logWellId) || campaign.wells[0];
    if (!targetWell) return;

    const newLog: DailyDrillingLog = {
      id: `log-${Date.now()}`,
      projectId: campaign.id,
      wellOrFrontId: targetWell.id,
      date: new Date().toISOString().slice(0, 10),
      shift: logShift,
      shiftRegime: logShiftRegime,
      rigName: targetWell.rigAssigned,
      supervisorName: 'Ing. Jefe de Campo / Company Man',
      depthFromM: Number(logFromM),
      depthToM: Number(logToM),
      coreRecoveryPercent: 96.5,
      runningHours: Number(logRunningHrs),
      standbyHours: Number(logStandbyHrs),
      standbyReason: logStandbyReason,
      dieselConsumedLiters: Number(logDieselLiters),
      mudDensityPpg: Number(logMudPpg),
      mudViscositySec: 51,
      bentoniteBagsUsed: Number(logBentoniteBags),
      crewCount: 6,
      generalNotes:
        logNotes.trim() ||
        `Avance perforado de ${logFromM}m a ${logToM}m en ${targetWell.code}. Control de parámetros de lodo e inyección normal.`,
    };

    // Also update the Well's drilled depth, running hours, standby hours and diesel consumed
    const updatedWells = campaign.wells.map((w) => {
      if (w.id !== targetWell.id) return w;
      return {
        ...w,
        drilledDepthM: Math.min(w.targetDepthM, Math.max(w.drilledDepthM, Number(logToM))),
        runningHoursTotal: w.runningHoursTotal + Number(logRunningHrs),
        standbyHoursTotal: w.standbyHoursTotal + Number(logStandbyHrs),
        dieselConsumedLiters: w.dieselConsumedLiters + Number(logDieselLiters),
      };
    });

    onUpdateCampaign({
      ...campaign,
      wells: updatedWells,
      dailyLogs: [newLog, ...campaign.dailyLogs],
    });
    setLogFromM(Number(logToM));
    setLogToM(Number(logToM) + 16);
    setLogNotes('');
  };

  const handleSequenceTasksWithAi = async () => {
    setIsAiRunning(true);
    try {
      const resp = await fetch('/api/ai/sequence-gantt-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: campaign.name,
          sequenceMode: 'construction_phases',
          tasks: campaign.scheduleTasks,
        }),
      });
      const json = await resp.json();
      if (json.success && json.data) {
        setAiAdvisoryResult({
          type: 'sequence',
          summary: json.data.executiveSummary,
          details: json.data.orderedTasks || [],
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiRunning(false);
    }
  };

  const handleWeatherRiskAnalysis = async () => {
    setIsAiRunning(true);
    try {
      const resp = await fetch('/api/ai/analyze-schedule-weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: campaign.name,
          tasks: campaign.scheduleTasks,
          weatherForecast: {
            location: campaign.locationName,
            altitudeMasl: campaign.altitudeMasl,
            windGustsKmh: 52,
            minTempC: -6,
            maxTempC: 14,
          },
        }),
      });
      const json = await resp.json();
      if (json.success && json.data) {
        setAiAdvisoryResult({
          type: 'weather',
          ...json.data,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiRunning(false);
    }
  };

  const handleExportArchiveZip = async () => {
    try {
      const enrichedItems = campaign.budgetItems.map((bi) => {
        const apu = apuLibrary.find((a) => a.id === bi.apuId) || apuLibrary[0];
        const t = calculateApuTotals(apu);
        return {
          ...bi,
          directCostUnit: t.directCostUnit.toFixed(2),
          unitPrice: t.unitPrice.toFixed(2),
          totalPrice: (t.unitPrice * bi.quantity).toFixed(2),
        };
      });
      const resp = await fetch('/api/projects/archive-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: {
            ...campaign,
            budgetItems: enrichedItems,
          },
        }),
      });
      const json = await resp.json();
      if (json.success && json.downloadUrl) {
        const a = document.createElement('a');
        a.href = json.downloadUrl;
        a.download = json.filename || `${campaign.code}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Error exporting campaign zip:', err);
    }
  };

  const visibleBudgetItems =
    wellFilterId === 'all'
      ? campaign.budgetItems
      : campaign.budgetItems.filter((bi) => bi.wellOrFrontId === wellFilterId);

  const totalBudgetUsd = visibleBudgetItems.reduce((acc, bi) => {
    const apu = apuLibrary.find((a) => a.id === bi.apuId) || apuLibrary[0];
    return acc + calculateApuTotals(apu).unitPrice * bi.quantity;
  }, 0);

  const totalCertifiedUsd = visibleBudgetItems.reduce((acc, bi) => {
    const apu = apuLibrary.find((a) => a.id === bi.apuId) || apuLibrary[0];
    return acc + calculateApuTotals(apu).unitPrice * bi.quantity * (bi.progress / 100);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveSubView('wells_fronts')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeSubView === 'wells_fronts'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4" />
            Pozos, Plataformas (Pads) y Estratos
          </button>
          {permissions.allowedSubViewsInCampaign.includes('budget_compute') && (
            <button
              onClick={() => setActiveSubView('budget_compute')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeSubView === 'budget_compute'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              Cómputo Métrico & Presupuesto por Pozo
            </button>
          )}
          <button
            onClick={() => setActiveSubView('gantt_schedule')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeSubView === 'gantt_schedule'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Cronograma de Campaña & Clima Puna
          </button>
          <button
            onClick={() => setActiveSubView('daily_logs')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeSubView === 'daily_logs'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            Partes Diarios de Sonda ({campaign.dailyLogs.length})
          </button>
        </div>

        <button
          onClick={handleExportArchiveZip}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4 text-amber-400" />
          Exportar Legajo de Campaña (ZIP/CSV)
        </button>
      </div>

      {/* VIEW 1: POZOS, PLATAFORMAS (PADS) Y COLUMNA ESTRATIGRÁFICA */}
      {activeSubView === 'wells_fronts' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Estado de Pozos (DDH / RC / Productores) y Frentes Electromecánicos
              </h2>
              <p className="text-xs text-slate-400">
                Control físico de profundidad perforada (m), entubado Casing API, horas Running vs Stand-by y consumo de gasoil por pozo.
              </p>
            </div>
            {permissions.canEditWellsAndProgress ? (
              <button
                onClick={() => setShowNewWellModal((s) => !s)}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Nuevo Pozo / Frente de Obra
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                <Lock className="w-3.5 h-3.5" /> Modo Fiscalización Comitente (Solo Lectura)
              </div>
            )}
          </div>

          {showNewWellModal && (
            <div className="bg-slate-900 border border-amber-500/50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-100 mb-3">
                Incorporar Nuevo Pozo o Frente de Montaje a la Campaña
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Código Pozo/Frente</label>
                  <input
                    type="text"
                    value={newWellCode}
                    onChange={(e) => setNewWellCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-slate-400 mb-1">Denominación Técnica</label>
                  <input
                    type="text"
                    value={newWellName}
                    onChange={(e) => setNewWellName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Plataforma (Pad)</label>
                  <input
                    type="text"
                    value={newWellPad}
                    onChange={(e) => setNewWellPad(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Tipo</label>
                  <select
                    value={newWellType}
                    onChange={(e) => setNewWellType(e.target.value as WellType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="ddh">Diamantina (DDH)</option>
                    <option value="rc">Rotaria / Aire Reverso (RC)</option>
                    <option value="water_brine">Pozo Productor / Salmuera</option>
                    <option value="electromechanical">Frente Electromecánico</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Prof. Objetivo (m)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={newWellTargetM}
                      onChange={(e) => setNewWellTargetM(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 font-mono"
                    />
                    <button
                      onClick={handleAddWell}
                      className="px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold rounded whitespace-nowrap shrink-0"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Wells & Work Fronts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaign.wells.map((w) => {
              const pct =
                w.targetDepthM > 0 ? Math.min(100, Math.round((w.drilledDepthM / w.targetDepthM) * 100)) : 0;
              return (
                <div
                  key={w.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono font-bold text-amber-400">{w.code}</span>
                      <span>{w.padName}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-100 mt-1">{w.name}</h3>
                    <div className="text-xs text-slate-400 mt-1 font-mono">
                      Sonda: {w.rigAssigned} · Ø {w.diameterInches}
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs mb-1 tabular-nums">
                        <span className="text-slate-400">
                          Avance: <strong className="text-slate-100">{w.drilledDepthM} m</strong> /{' '}
                          {w.targetDepthM} m
                        </span>
                        <span className="font-mono font-bold text-emerald-400">{pct}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Interactive Depth & Casing Controls */}
                    <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800 text-xs tabular-nums">
                      <div>
                        <label className="block text-slate-400 mb-1">Prof. Perforada (m)</label>
                        <input
                          type="number"
                          disabled={!permissions.canEditWellsAndProgress}
                          value={w.drilledDepthM}
                          onChange={(e) =>
                            handleUpdateWellProgress(w.id, 'drilledDepthM', Number(e.target.value))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-slate-100 disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Entubado Casing (m)</label>
                        <input
                          type="number"
                          disabled={!permissions.canEditWellsAndProgress}
                          value={w.casingDepthM}
                          onChange={(e) =>
                            handleUpdateWellProgress(w.id, 'casingDepthM', Number(e.target.value))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-sky-400 disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800 text-xs tabular-nums">
                    <div className="text-slate-400">
                      <span className="text-emerald-400 font-mono">{w.runningHoursTotal}h Run</span> ·{' '}
                      <span className="text-amber-400 font-mono">{w.standbyHoursTotal}h Stby</span> ·{' '}
                      <span className="text-rose-400 font-mono">{w.dieselConsumedLiters}L</span>
                    </div>
                    <button
                      onClick={() => onSelectWellIn4D(w.id)}
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0"
                    >
                      Inspeccionar en 4D →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stratigraphic Column Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              Columna Estratigráfica del Yacimiento & Parámetros de Lodo / Penetración (ROP)
            </h3>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Estrato</th>
                    <th className="py-2 px-3 font-medium">Horizonte Geológico</th>
                    <th className="py-2 px-3 font-medium text-right">Cota (m)</th>
                    <th className="py-2 px-3 font-medium">Litología</th>
                    <th className="py-2 px-3 font-medium text-right">RQD Roca</th>
                    <th className="py-2 px-3 font-medium text-right">ROP Esp.</th>
                    <th className="py-2 pl-3 font-medium text-right">Densidad Lodo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {campaign.strata.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-950/50">
                      <td className="py-2.5 pr-3 font-mono font-semibold text-amber-400">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                          style={{ backgroundColor: st.colorHex }}
                        />
                        {st.code}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-100">{st.name}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                        {st.fromDepthM}m – {st.toDepthM}m
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">{st.lithology}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                        {st.hardnessRqd}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                        {st.expectedRopMph} m/h
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono text-sky-400">
                        {st.mudDensityPpg} lb/gal
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: CÓMPUTO MÉTRICO & PRESUPUESTO POR POZO Y FRENTE */}
      {activeSubView === 'budget_compute' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  Cómputo Métrico, Presupuesto y Certificación por Pozo / Frente de Obra
                </h2>
                <p className="text-xs text-slate-400">
                  Vincula los APU del sector (Perforación Diamantina, Rotaria, Casing API, Lodos Bentoníticos y Montaje Electromecánico) a cada pozo.
                </p>
              </div>
              <div className="flex items-center gap-4 text-right tabular-nums">
                <div>
                  <div className="text-xs text-slate-400">Presupuesto Total</div>
                  <div className="text-lg font-mono font-bold text-slate-100">
                    USD {totalBudgetUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Avance Certificado</div>
                  <div className="text-lg font-mono font-bold text-emerald-400">
                    USD {totalCertifiedUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            </div>

            {/* Filter by Well + Add New Line Item */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-950 border border-slate-800 rounded-lg p-3.5 mb-4">
              <div className="lg:col-span-3">
                <label className="block text-xs text-slate-400 mb-1">Filtrar por Pozo / Frente</label>
                <select
                  value={wellFilterId}
                  onChange={(e) => setWellFilterId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                >
                  <option value="all">Todos los Pozos y Frentes ({campaign.wells.length})</option>
                  {campaign.wells.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.padName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-4">
                <label className="block text-xs text-slate-400 mb-1">APU a Computar</label>
                <select
                  value={newBudgetApuId}
                  onChange={(e) => setNewBudgetApuId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                >
                  {apuLibrary.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name} ({a.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Asignar a Pozo</label>
                <select
                  value={newBudgetWellId}
                  onChange={(e) => setNewBudgetWellId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                >
                  {campaign.wells.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3 flex items-end gap-2">
                <div className="w-24">
                  <label className="block text-xs text-slate-400 mb-1">Metros/Cant.</label>
                  <input
                    type="number"
                    value={newBudgetQty}
                    onChange={(e) => setNewBudgetQty(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100"
                  />
                </div>
                <button
                  onClick={handleAddBudgetLine}
                  className="flex-1 py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded flex items-center justify-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Incorporar Partida
                </button>
              </div>
            </div>

            {/* Budget Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-2 font-medium">Ítem</th>
                    <th className="py-2.5 px-2 font-medium">Pozo / Frente</th>
                    <th className="py-2.5 px-2 font-medium">Partida de Campaña & APU</th>
                    <th className="py-2.5 px-2 font-medium text-right">Cómputo</th>
                    <th className="py-2.5 px-2 font-medium text-right">P. Unitario ($)</th>
                    <th className="py-2.5 px-2 font-medium text-right">Total Partida ($)</th>
                    <th className="py-2.5 px-2 font-medium text-right">% Avance</th>
                    <th className="py-2.5 pl-2 font-medium text-right">Certificado ($)</th>
                    <th className="py-2.5 pl-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {visibleBudgetItems.map((bi) => {
                    const apu = apuLibrary.find((a) => a.id === bi.apuId) || apuLibrary[0];
                    const t = calculateApuTotals(apu);
                    const well = campaign.wells.find((w) => w.id === bi.wellOrFrontId);
                    const lineTotal = t.unitPrice * bi.quantity;
                    const certifiedTotal = lineTotal * (bi.progress / 100);
                    return (
                      <tr key={bi.id} className="hover:bg-slate-950/50">
                        <td className="py-2.5 pr-2 font-mono text-slate-400">{bi.code}</td>
                        <td className="py-2.5 px-2 font-mono font-semibold text-sky-400 whitespace-nowrap">
                          {well?.code || 'CAMPAÑA'}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="font-medium text-slate-100">{bi.name}</div>
                          <div className="text-slate-400 font-mono">
                            {apu.code} · {bi.category}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right whitespace-nowrap">
                          <input
                            type="number"
                            disabled={!permissions.canEditBudgetAndQuantities}
                            value={bi.quantity}
                            onChange={(e) =>
                              handleUpdateBudgetLine(bi.id, 'quantity', Number(e.target.value))
                            }
                            className="w-20 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-slate-100 disabled:opacity-60"
                          />{' '}
                          <span className="text-slate-400">{bi.unit}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-200">
                          ${t.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-100">
                          ${lineTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            disabled={!permissions.canEditBudgetAndQuantities}
                            value={bi.progress}
                            onChange={(e) =>
                              handleUpdateBudgetLine(bi.id, 'progress', Number(e.target.value))
                            }
                            className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-amber-400 disabled:opacity-60"
                          />
                          %
                        </td>
                        <td className="py-2.5 pl-2 text-right font-mono font-bold text-emerald-400">
                          ${certifiedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2.5 pl-2 text-right">
                          {permissions.canEditBudgetAndQuantities && (
                            <button
                              onClick={() => handleDeleteBudgetLine(bi.id)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: CRONOGRAMA GANTT DE CAMPAÑA, SECUENCIADOR DE POZOS & RIESGO CLIMÁTICO */}
      {activeSubView === 'gantt_schedule' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  Cronograma Maestro de Campaña de Perforación, Entubado Casing y Montaje BES
                </h2>
                <p className="text-xs text-slate-400">
                  Secuencia técnica de Plataformas (Pads), Sondas en régimen 14x14 y Cuadrillas Electromecánicas 21x7.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSequenceTasksWithAi}
                  disabled={isAiRunning}
                  className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  {isAiRunning ? 'Procesando...' : 'Optimizar Secuencia de Pozos'}
                </button>
                <button
                  onClick={handleWeatherRiskAnalysis}
                  disabled={isAiRunning}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <CloudRain className="w-4 h-4 text-amber-400" />
                  Evaluar Clima Alta Montaña & Stand-by
                </button>
              </div>
            </div>

            {aiAdvisoryResult && (
              <div className="bg-slate-950 border border-sky-500/40 rounded-lg p-4 mb-4 text-xs space-y-2">
                <div className="font-semibold text-sky-400 flex items-center justify-between">
                  <span>
                    {aiAdvisoryResult.type === 'weather'
                      ? `Dictamen Meteorológico y Control de Stand-by (Riesgo: ${aiAdvisoryResult.generalRiskLevel})`
                      : 'Dictamen de Secuenciación Técnica de Perforación y Montaje'}
                  </span>
                  <button
                    onClick={() => setAiAdvisoryResult(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
                <p className="text-slate-200">{aiAdvisoryResult.summary}</p>
                {aiAdvisoryResult.criticalPathAlert && (
                  <p className="text-amber-400 font-medium">{aiAdvisoryResult.criticalPathAlert}</p>
                )}
              </div>
            )}

            <div className="space-y-3">
              {campaign.scheduleTasks.map((tsk) => {
                const well = campaign.wells.find((w) => w.id === tsk.wellOrFrontId);
                return (
                  <div
                    key={tsk.id}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <span className="text-amber-400 font-bold">{tsk.code}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-sky-400">{well?.code || 'CAMPAÑA'}</span>
                        <span aria-hidden="true">·</span>
                        <span>Turno {tsk.shiftRegime} ({tsk.crewSize} esp.)</span>
                      </div>
                      <div className="text-sm font-bold text-slate-100">{tsk.phaseName}</div>
                      <div className="text-xs text-slate-400">{tsk.description}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        Sonda/Flota: <strong className="text-slate-200">{tsk.assignedRig}</strong> ·{' '}
                        {tsk.startDate} → {tsk.endDate} ({tsk.durationWorkingDays} días)
                      </div>
                    </div>

                    <div className="w-full md:w-64 shrink-0">
                      <div className="flex items-center justify-between text-xs mb-1 tabular-nums">
                        <span className="text-slate-400">
                          Meta: {tsk.computedQuantity} {tsk.unit}
                        </span>
                        <span className="font-mono font-bold text-emerald-400">{tsk.progress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${tsk.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: PARTES DIARIOS DE SONDA (DAILY DRILLING LOGS) */}
      {activeSubView === 'daily_logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Form to Register New Daily Drilling Log */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Registrar Parte Diario de Sonda / Avance de Pozo
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Actualiza automáticamente los metros perforados del pozo, las horas Running vs Stand-by y el gasoil consumido.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">Pozo / Frente de Obra</label>
                <select
                  value={logWellId}
                  onChange={(e) => {
                    const wid = e.target.value;
                    setLogWellId(wid);
                    const w = campaign.wells.find((x) => x.id === wid);
                    if (w) {
                      setLogFromM(w.drilledDepthM);
                      setLogToM(Math.min(w.targetDepthM, w.drilledDepthM + 16));
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-100"
                >
                  {campaign.wells.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name} ({w.drilledDepthM}m/{w.targetDepthM}m)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Turno Operativo</label>
                <select
                  value={logShift}
                  onChange={(e) => setLogShift(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100"
                >
                  <option value="Día (08:00 - 20:00)">Día (08:00 - 20:00)</option>
                  <option value="Noche (20:00 - 08:00)">Noche (20:00 - 08:00)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Régimen Cuadrilla</label>
                <select
                  value={logShiftRegime}
                  onChange={(e) => setLogShiftRegime(e.target.value as ShiftRegime)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 font-mono"
                >
                  <option value="14x14">14x14</option>
                  <option value="21x7">21x7</option>
                  <option value="7x7">7x7</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Desde Profundidad (m)</label>
                <input
                  type="number"
                  value={logFromM}
                  onChange={(e) => setLogFromM(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Hasta Profundidad (m)</label>
                <input
                  type="number"
                  value={logToM}
                  onChange={(e) => setLogToM(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Horas Operativas (Running)</label>
                <input
                  type="number"
                  step="0.5"
                  value={logRunningHrs}
                  onChange={(e) => setLogRunningHrs(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Horas Espera (Stand-by)</label>
                <input
                  type="number"
                  step="0.5"
                  value={logStandbyHrs}
                  onChange={(e) => setLogStandbyHrs(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Gasoil Consumido (Litros)</label>
                <input
                  type="number"
                  value={logDieselLiters}
                  onChange={(e) => setLogDieselLiters(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-rose-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Bolsas Bentonita / Lodo (ppg)</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    value={logBentoniteBags}
                    onChange={(e) => setLogBentoniteBags(Number(e.target.value))}
                    className="w-1/2 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 font-mono text-slate-100"
                    title="Bolsas Bentonita 25kg"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={logMudPpg}
                    onChange={(e) => setLogMudPpg(Number(e.target.value))}
                    className="w-1/2 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 font-mono text-sky-400"
                    title="Densidad Lodo (ppg)"
                  />
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">Motivo de Horas Stand-by (si aplica)</label>
                <input
                  type="text"
                  value={logStandbyReason}
                  onChange={(e) => setLogStandbyReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">Observaciones Geológicas y Operativas</label>
                <textarea
                  rows={2}
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="Ej: Recuperación de testigo HQ 98%, sin pérdida de circulación..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>
            </div>

            {permissions.canCreateDailyDrillingLog ? (
              <button
                onClick={handleAddDailyDrillingLog}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Guardar Parte Diario de Sonda & Actualizar Pozo
              </button>
            ) : (
              <div className="w-full py-2.5 px-3 bg-slate-950 border border-slate-800 text-slate-400 text-xs rounded-lg flex items-center justify-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                Modo Cliente / Fiscalización: Solo lectura de Partes Diarios
              </div>
            )}
          </div>

          {/* Right: Historical List of Daily Drilling Logs */}
          <div className="lg:col-span-7 space-y-3">
            {campaign.dailyLogs.map((log) => {
              const well = campaign.wells.find((w) => w.id === log.wellOrFrontId);
              const netAdvanceM = Math.max(0, log.depthToM - log.depthFromM);
              return (
                <div
                  key={log.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-amber-400 font-bold">{well?.code || 'POZO'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-300">{log.date}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-sky-400">{log.shift}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-400">Régimen {log.shiftRegime}</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-400 tabular-nums">
                      +{netAdvanceM} m perforados ({log.depthFromM}m → {log.depthToM}m)
                    </span>
                  </div>

                  <p className="text-xs text-slate-200">{log.generalNotes}</p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs tabular-nums">
                    <div>
                      <span className="text-slate-400">Running / Stand-by: </span>
                      <strong className="text-emerald-400 font-mono">{log.runningHours}h</strong> /{' '}
                      <strong className="text-amber-400 font-mono">{log.standbyHours}h</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 flex items-center gap-1 inline-flex">
                        <Fuel className="w-3 h-3 text-rose-400" /> Gasoil:
                      </span>{' '}
                      <strong className="text-rose-400 font-mono">{log.dieselConsumedLiters} L</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Lodo Bentonítico: </span>
                      <strong className="text-sky-400 font-mono">{log.mudDensityPpg} ppg</strong> (
                      {log.bentoniteBagsUsed} bls)
                    </div>
                    <div>
                      <span className="text-slate-400">Recup. Testigo: </span>
                      <strong className="text-slate-100 font-mono">{log.coreRecoveryPercent}%</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
