import React, { useState } from 'react';
import {
  ApuItem,
  EquipmentItem,
  LaborItem,
  MaterialItem,
  ProjectCampaign,
  ShiftRegime,
  calculateApuTotals,
  calculateEquipmentHourlyBreakdown,
  calculateLaborHourlyBreakdown,
  calculateMaterialUnitCost,
  getShiftRegimeMultiplier,
} from '../types';
import {
  Plus,
  Trash2,
  Fuel,
  Clock,
  Users,
  Wrench,
  Package,
  Sparkles,
  Check,
  Calculator,
  Sliders,
} from 'lucide-react';

interface ApuAndResourcesViewProps {
  apuLibrary: ApuItem[];
  onUpdateApu: (updated: ApuItem) => void;
  onCreateApu: (newApu: ApuItem) => void;
  campaign: ProjectCampaign;
  onUpdateCampaignGlobals: (
    dieselPrice: number,
    shiftRegime: ShiftRegime,
    zonePercent: number,
    campDaily: number
  ) => void;
}

export const ApuAndResourcesView: React.FC<ApuAndResourcesViewProps> = ({
  apuLibrary,
  onUpdateApu,
  onCreateApu,
  campaign,
  onUpdateCampaignGlobals,
}) => {
  const [subTab, setSubTab] = useState<'apu_editor' | 'equipment_fleet' | 'labor_shifts'>('apu_editor');
  const [selectedApuId, setSelectedApuId] = useState<string>(apuLibrary[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // AI APU Generator Modal State
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiPromptName, setAiPromptName] = useState<string>('');
  const [aiPromptCategory, setAiPromptCategory] = useState<string>('Perforación Diamantina (DDH)');
  const [aiPromptUnit, setAiPromptUnit] = useState<string>('m');
  const [showAiGenerator, setShowAiGenerator] = useState<boolean>(false);

  // Campaign Global Controls State
  const [globalDieselPrice, setGlobalDieselPrice] = useState<number>(campaign.dieselBasePricePerLiter);
  const [globalShiftRegime, setGlobalShiftRegime] = useState<ShiftRegime>(campaign.defaultShiftRegime);
  const [globalZonePercent, setGlobalZonePercent] = useState<number>(campaign.defaultZoneAllowancePercent);
  const [globalCampCost, setGlobalCampCost] = useState<number>(campaign.defaultCampCostPerDay);
  const [globalsAppliedMsg, setGlobalsAppliedMsg] = useState<boolean>(false);

  const selectedApu = apuLibrary.find((a) => a.id === selectedApuId) || apuLibrary[0];
  const filteredApus = apuLibrary.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!selectedApu) return null;

  const totals = calculateApuTotals(selectedApu);

  const handleMaterialChange = (matId: string, field: keyof MaterialItem, value: string | number) => {
    const updated: ApuItem = {
      ...selectedApu,
      lastUpdated: new Date().toISOString().slice(0, 10),
      materials: selectedApu.materials.map((m) =>
        m.id === matId ? { ...m, [field]: typeof value === 'string' ? value : Number(value) } : m
      ),
    };
    onUpdateApu(updated);
  };

  const handleAddMaterial = () => {
    const newMat: MaterialItem = {
      id: `mat-${Date.now()}`,
      name: 'Nuevo Insumo de Perforación / Aditivo',
      unit: 'un',
      yieldRatio: 1.0,
      wastePercent: 5,
      unitPrice: 25.0,
    };
    onUpdateApu({
      ...selectedApu,
      materials: [...selectedApu.materials, newMat],
    });
  };

  const handleDeleteMaterial = (matId: string) => {
    onUpdateApu({
      ...selectedApu,
      materials: selectedApu.materials.filter((m) => m.id !== matId),
    });
  };

  const handleLaborChange = (labId: string, field: keyof LaborItem, value: string | number) => {
    const updated: ApuItem = {
      ...selectedApu,
      lastUpdated: new Date().toISOString().slice(0, 10),
      labor: selectedApu.labor.map((l) =>
        l.id === labId ? { ...l, [field]: field === 'role' || field === 'unit' || field === 'shiftRegime' ? value : Number(value) } : l
      ),
    };
    onUpdateApu(updated);
  };

  const handleAddLabor = () => {
    const newLab: LaborItem = {
      id: `lab-${Date.now()}`,
      role: 'Ayudante de Boca de Pozo / Maniobras',
      unit: 'hh',
      yieldRatio: 0.5,
      hourlyRate: 12.0,
      socialChargesPercent: 52,
      shiftRegime: campaign.defaultShiftRegime,
      zoneAllowancePercent: campaign.defaultZoneAllowancePercent,
      campCostPerDay: campaign.defaultCampCostPerDay,
    };
    onUpdateApu({
      ...selectedApu,
      labor: [...selectedApu.labor, newLab],
    });
  };

  const handleDeleteLabor = (labId: string) => {
    onUpdateApu({
      ...selectedApu,
      labor: selectedApu.labor.filter((l) => l.id !== labId),
    });
  };

  const handleEquipmentChange = (eqId: string, field: keyof EquipmentItem, value: string | number) => {
    const updated: ApuItem = {
      ...selectedApu,
      lastUpdated: new Date().toISOString().slice(0, 10),
      equipment: selectedApu.equipment.map((eq) =>
        eq.id === eqId ? { ...eq, [field]: field === 'name' || field === 'unit' || field === 'category' ? value : Number(value) } : eq
      ),
    };
    onUpdateApu(updated);
  };

  const handleAddEquipment = () => {
    const newEq: EquipmentItem = {
      id: `eq-${Date.now()}`,
      name: 'Equipo Auxiliar de Sondeo / Bomba de Lodos',
      category: 'auxiliary',
      unit: 'hm',
      yieldRatio: 0.4,
      runningRate: 65.0,
      standbyRate: 28.0,
      standbyHoursRatio: 0.15,
      dieselConsumptionLph: 18.0,
      dieselPricePerLiter: campaign.dieselBasePricePerLiter,
    };
    onUpdateApu({
      ...selectedApu,
      equipment: [...selectedApu.equipment, newEq],
    });
  };

  const handleDeleteEquipment = (eqId: string) => {
    onUpdateApu({
      ...selectedApu,
      equipment: selectedApu.equipment.filter((eq) => eq.id !== eqId),
    });
  };

  const handleGenerateApuWithAi = async () => {
    if (!aiPromptName.trim()) return;
    setIsAiLoading(true);
    try {
      const resp = await fetch('/api/ai/suggest-apu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: aiPromptName,
          category: aiPromptCategory,
          unit: aiPromptUnit,
          description: `Actividad de campaña de perforación, minería y energía: ${aiPromptName}`,
          countryContext: `${campaign.locationName} (${campaign.currency})`,
        }),
      });
      const json = await resp.json();
      if (json.success && json.data) {
        const d = json.data;
        const created: ApuItem = {
          id: `apu-custom-${Date.now()}`,
          code: d.code || `APU-PERF-${apuLibrary.length + 1}`,
          name: d.name || aiPromptName,
          category: d.category || aiPromptCategory,
          unit: d.unit || aiPromptUnit,
          description: d.description || '',
          materials: (d.materials || []).map((m: any, i: number) => ({
            id: `m-${Date.now()}-${i}`,
            name: m.name || 'Insumo',
            unit: m.unit || 'un',
            yieldRatio: Number(m.yieldRatio) || 1,
            wastePercent: Number(m.wastePercent) || 5,
            unitPrice: Number(m.unitPrice) || 10,
          })),
          labor: (d.labor || []).map((l: any, i: number) => ({
            id: `l-${Date.now()}-${i}`,
            role: l.role || 'Perforista Principal',
            unit: l.unit || 'hh',
            yieldRatio: Number(l.yieldRatio) || 0.5,
            hourlyRate: Number(l.hourlyRate) || 16,
            socialChargesPercent: Number(l.socialChargesPercent) || 52,
            shiftRegime: (l.shiftRegime as ShiftRegime) || campaign.defaultShiftRegime,
            zoneAllowancePercent: Number(l.zoneAllowancePercent) || campaign.defaultZoneAllowancePercent,
            campCostPerDay: Number(l.campCostPerDay) || campaign.defaultCampCostPerDay,
          })),
          equipment: (d.equipment || []).map((e: any, i: number) => ({
            id: `e-${Date.now()}-${i}`,
            name: e.name || 'Sonda Perforadora',
            category: 'rig',
            unit: e.unit || 'hm',
            yieldRatio: Number(e.yieldRatio) || 0.5,
            runningRate: Number(e.runningRate || e.hourlyRate || 95),
            standbyRate: Number(e.standbyRate || 42),
            standbyHoursRatio: Number(e.standbyHoursRatio || 0.15),
            dieselConsumptionLph: Number(e.dieselConsumptionLph || 28),
            dieselPricePerLiter: Number(e.dieselPricePerLiter || campaign.dieselBasePricePerLiter),
          })),
          overheadPercent: Number(d.overheadPercent) || 18,
          profitPercent: Number(d.profitPercent) || 12,
          taxPercent: Number(d.taxPercent) || 21,
          lastUpdated: new Date().toISOString().slice(0, 10),
        };
        onCreateApu(created);
        setSelectedApuId(created.id);
        setShowAiGenerator(false);
        setAiPromptName('');
      }
    } catch (e) {
      console.error('Error generating APU:', e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyCampaignGlobalsToAllApus = () => {
    onUpdateCampaignGlobals(globalDieselPrice, globalShiftRegime, globalZonePercent, globalCampCost);
    setGlobalsAppliedMsg(true);
    window.setTimeout(() => setGlobalsAppliedMsg(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Bar for APU, Equipment Running/Stand-by & Field Shift Regimes */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setSubTab('apu_editor')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              subTab === 'apu_editor'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Calculator className="w-4 h-4" />
            Matriz de APU Perforación & Energía
          </button>
          <button
            onClick={() => setSubTab('equipment_fleet')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              subTab === 'equipment_fleet'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Fuel className="w-4 h-4" />
            Equipos: Tarifa Running vs Stand-by & Gasoil (L/h)
          </button>
          <button
            onClick={() => setSubTab('labor_shifts')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              subTab === 'labor_shifts'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Mano de Obra: Turnos 14x14 / 21x7 & Zona/Campamento
          </button>
        </div>

        <button
          onClick={() => setShowAiGenerator((s) => !s)}
          className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          Generar APU Minero/Perforación
        </button>
      </div>

      {/* Collapsible Generator Panel */}
      {showAiGenerator && (
        <div className="bg-slate-900 border border-sky-500/40 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-100">
            Asistente de Ingeniería de Costos: Nuevo APU de Perforación, Minería o Energía
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Calcula automáticamente rendimientos de coronas/trépanos, lodos bentoníticos, tarifas Running/Stand-by, consumo de gasoil y dotación 14x14.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Actividad / Partida de Campaña</label>
              <input
                type="text"
                value={aiPromptName}
                onChange={(e) => setAiPromptName(e.target.value)}
                placeholder="Ej: Perforación Diamantina PQ en Brecha Hidrotermal o Ensayo de Bombeo"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Especialidad</label>
              <select
                value={aiPromptCategory}
                onChange={(e) => setAiPromptCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                <option value="Perforación Diamantina (DDH)">Perforación Diamantina (DDH)</option>
                <option value="Perforación Rotaria & Pozos Productores">Perforación Rotaria / RC</option>
                <option value="Entubado Casing & Terminación">Entubado Casing & Cementación</option>
                <option value="Lodos Bentoníticos & Inyección">Lodos Bentoníticos & Inyección</option>
                <option value="Montaje Electromecánico & Energía">Montaje Electromecánico & Energía</option>
                <option value="Geofísica & Perfilaje de Pozos">Geofísica & Perfilaje</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <div className="w-24">
                <label className="block text-xs text-slate-400 mb-1">Unidad</label>
                <select
                  value={aiPromptUnit}
                  onChange={(e) => setAiPromptUnit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100"
                >
                  <option value="m">m (Metro)</option>
                  <option value="m3">m3</option>
                  <option value="un">un</option>
                  <option value="hm">hm</option>
                  <option value="glb">glb</option>
                </select>
              </div>
              <button
                onClick={handleGenerateApuWithAi}
                disabled={isAiLoading || !aiPromptName.trim()}
                className="flex-1 py-2 px-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isAiLoading ? 'Calculando APU...' : 'Crear APU'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Parameters Strip (Gasoil Price, Shift Regime, Zone Bonus, Camp Cost) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              Parámetros Globales de Liquidación de Campaña ({campaign.code})
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Sincroniza el precio del Gasoil en cisterna de campo y las condiciones laborales de campamento en todos los APU.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs text-slate-400">Gasoil Campo (USD/L)</label>
              <input
                type="number"
                step="0.01"
                value={globalDieselPrice}
                onChange={(e) => setGlobalDieselPrice(Number(e.target.value))}
                className="w-24 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-amber-400 tabular-nums mt-0.5"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400">Régimen Turno Base</label>
              <select
                value={globalShiftRegime}
                onChange={(e) => setGlobalShiftRegime(e.target.value as ShiftRegime)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-100 mt-0.5"
              >
                <option value="14x14">14x14 (Puna / Sondas)</option>
                <option value="21x7">21x7 (Montaje / Energía)</option>
                <option value="7x7">7x7 (Guardia Rotativa)</option>
                <option value="5x2">5x2 (Base Operativa)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400">Adicional Zona (%)</label>
              <input
                type="number"
                step="1"
                value={globalZonePercent}
                onChange={(e) => setGlobalZonePercent(Number(e.target.value))}
                className="w-20 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-emerald-400 tabular-nums mt-0.5"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400">Campamento (USD/día)</label>
              <input
                type="number"
                step="1"
                value={globalCampCost}
                onChange={(e) => setGlobalCampCost(Number(e.target.value))}
                className="w-24 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-sky-400 tabular-nums mt-0.5"
              />
            </div>
            <button
              onClick={applyCampaignGlobalsToAllApus}
              className="mt-4 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {globalsAppliedMsg ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Actualizado
                </>
              ) : (
                'Aplicar a toda la Campaña'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: MATRIZ INTEGRAL DE APU */}
      {subTab === 'apu_editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: APU Catalog List */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Catálogo de APU Minería, Perforación & Energía
              </h3>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por código, rubro o actividad..."
                className="w-full mt-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
              {filteredApus.map((apu) => {
                const t = calculateApuTotals(apu);
                const isSelected = apu.id === selectedApu.id;
                return (
                  <button
                    key={apu.id}
                    onClick={() => setSelectedApuId(apu.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-slate-800/90 border-amber-500/60'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                      <span className="text-amber-400 font-semibold">{apu.code}</span>
                      <span>
                        Unidad: <strong className="text-slate-200">{apu.unit}</strong>
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-100 mt-1 line-clamp-2">
                      {apu.name}
                    </div>
                    <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-slate-800/80 tabular-nums">
                      <span className="text-slate-400 truncate max-w-[160px]">{apu.category}</span>
                      <span className="font-mono font-bold text-emerald-400">
                        USD {t.unitPrice.toFixed(2)} / {apu.unit}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Detailed APU Breakdown Editor */}
          <div className="lg:col-span-8 space-y-5">
            {/* APU Header & Unit Cost Summary */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-mono text-amber-400">
                    {selectedApu.code} · {selectedApu.category}
                  </div>
                  <h2 className="text-lg font-bold text-slate-100 mt-0.5">{selectedApu.name}</h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl">{selectedApu.description}</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-right tabular-nums">
                  <div className="text-xs text-slate-400">
                    Precio Unitario Final ({campaign.currency}/{selectedApu.unit})
                  </div>
                  <div className="text-2xl font-mono font-bold text-emerald-400">
                    ${totals.unitPrice.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    Costo Directo: ${totals.directCostUnit.toFixed(2)} · Gasoil:{' '}
                    {totals.dieselLitersPerUnit.toFixed(1)} L/{selectedApu.unit}
                  </div>
                </div>
              </div>

              {/* 4-Pillar Cost Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800 text-xs tabular-nums">
                <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
                  <div className="text-slate-400">1. Insumos, Coronas & Casing</div>
                  <div className="text-sm font-mono font-bold text-slate-100 mt-1">
                    ${totals.materialsSubtotal.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
                  <div className="text-slate-400">2. Mano de Obra (14x14 / 21x7)</div>
                  <div className="text-sm font-mono font-bold text-sky-400 mt-1">
                    ${totals.laborSubtotal.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
                  <div className="text-slate-400">3. Equipos (Running + Stand-by)</div>
                  <div className="text-sm font-mono font-bold text-amber-400 mt-1">
                    ${(totals.equipmentRunningSubtotal + totals.equipmentStandbySubtotal).toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
                  <div className="text-slate-400">4. Combustible Gasoil ({totals.dieselLitersPerUnit.toFixed(1)} L)</div>
                  <div className="text-sm font-mono font-bold text-rose-400 mt-1">
                    ${totals.equipmentDieselSubtotal.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Section A: Equipos & Sondas (Running vs Stand-by + Gasoil L/h) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-amber-400" />
                    Equipos, Sondas y Herramientas (Running vs Stand-by & Consumo Horario de Gasoil)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Tarifa Horaria Efectiva = Tarifa Operativa (Running) + (Litros/h × Precio Gasoil) + (Tarifa Stand-by × Ratio Espera)
                  </p>
                </div>
                <button
                  onClick={handleAddEquipment}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Sonda/Equipo
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-2 font-medium">Sonda / Equipo</th>
                      <th className="py-2 px-2 font-medium text-right">Rend. (hm/{selectedApu.unit})</th>
                      <th className="py-2 px-2 font-medium text-right">Running ($/h)</th>
                      <th className="py-2 px-2 font-medium text-right">Stand-by ($/h)</th>
                      <th className="py-2 px-2 font-medium text-right">Ratio Stby</th>
                      <th className="py-2 px-2 font-medium text-right">Gasoil (L/h)</th>
                      <th className="py-2 px-2 font-medium text-right">Tarifa Efec. ($/h)</th>
                      <th className="py-2 pl-2 font-medium text-right">Subtotal</th>
                      <th className="py-2 pl-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {selectedApu.equipment.map((eq) => {
                      const b = calculateEquipmentHourlyBreakdown(eq);
                      return (
                        <tr key={eq.id} className="hover:bg-slate-950/50">
                          <td className="py-2 pr-2 min-w-[210px]">
                            <input
                              type="text"
                              value={eq.name}
                              onChange={(e) => handleEquipmentChange(eq.id, 'name', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={eq.yieldRatio}
                              onChange={(e) => handleEquipmentChange(eq.id, 'yieldRatio', e.target.value)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-slate-100"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="1"
                              value={eq.runningRate}
                              onChange={(e) => handleEquipmentChange(eq.id, 'runningRate', e.target.value)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-emerald-400"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="1"
                              value={eq.standbyRate}
                              onChange={(e) => handleEquipmentChange(eq.id, 'standbyRate', e.target.value)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-amber-400"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={eq.standbyHoursRatio}
                              onChange={(e) => handleEquipmentChange(eq.id, 'standbyHoursRatio', e.target.value)}
                              className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-slate-300"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.5"
                              value={eq.dieselConsumptionLph}
                              onChange={(e) =>
                                handleEquipmentChange(eq.id, 'dieselConsumptionLph', e.target.value)
                              }
                              className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-rose-400"
                            />
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-200">
                            ${b.effectiveHourlyRate.toFixed(2)}
                          </td>
                          <td className="py-2 pl-2 text-right font-mono font-semibold text-amber-400">
                            ${b.unitCostInApu.toFixed(2)}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <button
                              onClick={() => handleDeleteEquipment(eq.id)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section B: Mano de Obra (Regímenes de Turno 14x14 / 21x7 & Adicional Zona / Campamento) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" />
                    Mano de Obra de Campo (Turnos 14x14, 21x7, Adicional Zona & Campamento)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Incluye jornal base, adicional zona desfavorable/altura, coeficiente de rotación (14x14 o 21x7), cargas sociales y costo diario de campamento.
                  </p>
                </div>
                <button
                  onClick={handleAddLabor}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Categoría
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-2 font-medium">Categoría / Rol en Pozo</th>
                      <th className="py-2 px-2 font-medium">Régimen</th>
                      <th className="py-2 px-2 font-medium text-right">HH/{selectedApu.unit}</th>
                      <th className="py-2 px-2 font-medium text-right">Base ($/h)</th>
                      <th className="py-2 px-2 font-medium text-right">% Zona</th>
                      <th className="py-2 px-2 font-medium text-right">Camp. ($/d)</th>
                      <th className="py-2 px-2 font-medium text-right">Tarifa Liq. ($/h)</th>
                      <th className="py-2 pl-2 font-medium text-right">Subtotal</th>
                      <th className="py-2 pl-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {selectedApu.labor.map((lab) => {
                      const b = calculateLaborHourlyBreakdown(lab);
                      return (
                        <tr key={lab.id} className="hover:bg-slate-950/50">
                          <td className="py-2 pr-2 min-w-[200px]">
                            <input
                              type="text"
                              value={lab.role}
                              onChange={(e) => handleLaborChange(lab.id, 'role', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={lab.shiftRegime}
                              onChange={(e) => handleLaborChange(lab.id, 'shiftRegime', e.target.value)}
                              className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 font-mono text-sky-400"
                            >
                              <option value="14x14">14x14</option>
                              <option value="21x7">21x7</option>
                              <option value="7x7">7x7</option>
                              <option value="5x2">5x2</option>
                            </select>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.05"
                              value={lab.yieldRatio}
                              onChange={(e) => handleLaborChange(lab.id, 'yieldRatio', e.target.value)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-slate-100"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.5"
                              value={lab.hourlyRate}
                              onChange={(e) => handleLaborChange(lab.id, 'hourlyRate', e.target.value)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-slate-100"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="1"
                              value={lab.zoneAllowancePercent}
                              onChange={(e) =>
                                handleLaborChange(lab.id, 'zoneAllowancePercent', e.target.value)
                              }
                              className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-emerald-400"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="1"
                              value={lab.campCostPerDay}
                              onChange={(e) => handleLaborChange(lab.id, 'campCostPerDay', e.target.value)}
                              className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-amber-400"
                            />
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-200">
                            ${b.effectiveHourlyRate.toFixed(2)}
                          </td>
                          <td className="py-2 pl-2 text-right font-mono font-semibold text-sky-400">
                            ${b.unitCostInApu.toFixed(2)}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <button
                              onClick={() => handleDeleteLabor(lab.id)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section C: Materiales, Coronas Diamantadas, Lodos & Casing */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-400" />
                    Insumos Críticos: Coronas/Trépanos, Tubería Casing API, Bentonita & Polímeros
                  </h3>
                </div>
                <button
                  onClick={handleAddMaterial}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Insumo
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-2 font-medium">Insumo / Material Técnico</th>
                      <th className="py-2 px-2 font-medium">Unidad</th>
                      <th className="py-2 px-2 font-medium text-right">Aporte</th>
                      <th className="py-2 px-2 font-medium text-right">% Merma</th>
                      <th className="py-2 px-2 font-medium text-right">Costo Unit. ($)</th>
                      <th className="py-2 pl-2 font-medium text-right">Subtotal</th>
                      <th className="py-2 pl-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {selectedApu.materials.map((mat) => {
                      const b = calculateMaterialUnitCost(mat);
                      return (
                        <tr key={mat.id} className="hover:bg-slate-950/50">
                          <td className="py-2 pr-2 min-w-[220px]">
                            <input
                              type="text"
                              value={mat.name}
                              onChange={(e) => handleMaterialChange(mat.id, 'name', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={mat.unit}
                              onChange={(e) => handleMaterialChange(mat.id, 'unit', e.target.value)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-slate-200"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={mat.yieldRatio}
                              onChange={(e) =>
                                handleMaterialChange(mat.id, 'yieldRatio', e.target.value)
                              }
                              className="w-20 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-slate-100"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="1"
                              value={mat.wastePercent}
                              onChange={(e) =>
                                handleMaterialChange(mat.id, 'wastePercent', e.target.value)
                              }
                              className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-slate-300"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.5"
                              value={mat.unitPrice}
                              onChange={(e) =>
                                handleMaterialChange(mat.id, 'unitPrice', e.target.value)
                              }
                              className="w-20 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-slate-100"
                            />
                          </td>
                          <td className="py-2 pl-2 text-right font-mono font-semibold text-emerald-400">
                            ${b.unitCostInApu.toFixed(2)}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <button
                              onClick={() => handleDeleteMaterial(mat.id)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONTROL DE EQUIPOS: TARIFA OPERATIVA (RUNNING) VS EN ESPERA (STAND-BY) & GASOIL */}
      {subTab === 'equipment_fleet' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-base font-bold text-slate-100">
              Parque de Sondas y Equipos Pesados: Tarifa Operativa (Running) vs Tarifa en Espera (Stand-by) & Gasoil
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Control comparativo de costos horarios operativos frente a detenciones por fraguado de cementación (WOC), perfilaje geofísico o ventana climática, más consumo específico de gasoil (L/h).
            </p>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">APU Vinculado</th>
                    <th className="py-2.5 px-3 font-medium">Sonda / Equipo de Perforación o Montaje</th>
                    <th className="py-2.5 px-3 font-medium text-right">Tarifa Running ($/h)</th>
                    <th className="py-2.5 px-3 font-medium text-right">Tarifa Stand-by ($/h)</th>
                    <th className="py-2.5 px-3 font-medium text-right">Relación Stby/Run</th>
                    <th className="py-2.5 px-3 font-medium text-right">Consumo Gasoil (L/h)</th>
                    <th className="py-2.5 px-3 font-medium text-right">Costo Gasoil ($/h)</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Costo Horario Total ($/h)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {apuLibrary.flatMap((apu) =>
                    apu.equipment.map((eq) => {
                      const b = calculateEquipmentHourlyBreakdown(eq);
                      const stbyRatioPct =
                        eq.runningRate > 0 ? Math.round((eq.standbyRate / eq.runningRate) * 100) : 100;
                      return (
                        <tr key={`${apu.id}-${eq.id}`} className="hover:bg-slate-950/60">
                          <td className="py-2.5 pr-3 font-mono text-amber-400">{apu.code}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-100">{eq.name}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-semibold">
                            ${eq.runningRate.toFixed(2)}/h
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-semibold">
                            ${eq.standbyRate.toFixed(2)}/h ({stbyRatioPct}%)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {(eq.standbyHoursRatio * 100).toFixed(0)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                            {eq.dieselConsumptionLph.toFixed(1)} L/h
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-300">
                            ${b.dieselHourlyCost.toFixed(2)}/h
                          </td>
                          <td className="py-2.5 pl-3 text-right font-mono font-bold text-slate-100">
                            ${b.effectiveHourlyRate.toFixed(2)}/h
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real Telemetry of Running vs Stand-by & Diesel by Well in Active Campaign */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-base font-bold text-slate-100">
              Control Acumulado por Pozo y Frente: Horas Running vs Stand-by y Litros de Gasoil ({campaign.code})
            </h3>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Pozo / Frente</th>
                    <th className="py-2.5 px-3 font-medium">Plataforma (Pad)</th>
                    <th className="py-2.5 px-3 font-medium">Sonda / Equipo Asignado</th>
                    <th className="py-2.5 px-3 font-medium text-right">Horas Running</th>
                    <th className="py-2.5 px-3 font-medium text-right">Horas Stand-by</th>
                    <th className="py-2.5 px-3 font-medium text-right">Disponibilidad Operativa</th>
                    <th className="py-2.5 px-3 font-medium text-right">Gasoil Consumido (L)</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Costo Combustible ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {campaign.wells.map((w) => {
                    const totalHours = w.runningHoursTotal + w.standbyHoursTotal;
                    const runPct = totalHours > 0 ? (w.runningHoursTotal / totalHours) * 100 : 100;
                    const fuelCost = w.dieselConsumedLiters * campaign.dieselBasePricePerLiter;
                    return (
                      <tr key={w.id} className="hover:bg-slate-950/60">
                        <td className="py-2.5 pr-3 font-mono font-semibold text-sky-400">{w.code}</td>
                        <td className="py-2.5 px-3 text-slate-300">{w.padName}</td>
                        <td className="py-2.5 px-3 text-slate-200">{w.rigAssigned}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-semibold">
                          {w.runningHoursTotal} hs
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-semibold">
                          {w.standbyHoursTotal} hs
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-100">
                          {runPct.toFixed(1)}% Running
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-400 font-semibold">
                          {w.dieselConsumedLiters.toLocaleString()} L
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono font-bold text-slate-100">
                          ${fuelCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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

      {/* TAB 3: LIQUIDACIÓN DE MANO DE OBRA EN REGÍMENES DE CAMPO (14x14, 21x7, ZONA & CAMPAMENTO) */}
      {subTab === 'labor_shifts' && (
        <div className="space-y-6">
          {/* Shift Regime Comparison Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {(['14x14', '21x7', '7x7', '5x2'] as ShiftRegime[]).map((reg) => {
              const info = getShiftRegimeMultiplier(reg);
              const isDefault = campaign.defaultShiftRegime === reg;
              return (
                <div
                  key={reg}
                  className={`bg-slate-900 border rounded-xl p-4 ${
                    isDefault ? 'border-amber-500/70' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-mono font-bold text-amber-400">{reg}</span>
                    <span className="text-xs text-slate-400 font-mono">
                      Factor ×{info.rotationFactor.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-100 mt-1">{info.label}</div>
                  <div className="text-xs text-slate-400 mt-2 space-y-1 tabular-nums">
                    <div>
                      Ciclo: <strong className="text-slate-200">{info.workDays}d campo</strong> ×{' '}
                      <strong className="text-slate-200">{info.restDays}d franco</strong>
                    </div>
                    <div>
                      Dotación c/ Relevo:{' '}
                      <strong className="text-sky-400">{info.reliefCrewRatio.toFixed(2)}x</strong> por puesto
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Complete Liquidation Table across all Field Categories */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              Liquidación Detallada de Categorías Operativas por Régimen de Turno (14x14 / 21x7) y Adicional de Zona
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Desglose auditado de costos horarios efectivos incluyendo Adicional por Zona Desfavorable/Puna, Rotación de Guardia, Cargas Sociales Mineras/Petroleras y Alojamiento/Vianda en Campamento.
            </p>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">APU</th>
                    <th className="py-2.5 px-3 font-medium">Categoría / Especialidad en Campo</th>
                    <th className="py-2.5 px-3 font-medium">Diagrama</th>
                    <th className="py-2.5 px-3 font-medium text-right">Jornal Base ($/h)</th>
                    <th className="py-2.5 px-3 font-medium text-right">+Adic. Zona (%)</th>
                    <th className="py-2.5 px-3 font-medium text-right">c/ Rotación Turno</th>
                    <th className="py-2.5 px-3 font-medium text-right">+Cargas Soc.</th>
                    <th className="py-2.5 px-3 font-medium text-right">+Campamento ($/h)</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Tarifa Liquidada ($/h)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {apuLibrary.flatMap((apu) =>
                    apu.labor.map((lab) => {
                      const b = calculateLaborHourlyBreakdown(lab);
                      return (
                        <tr key={`${apu.id}-${lab.id}`} className="hover:bg-slate-950/60">
                          <td className="py-2.5 pr-3 font-mono text-amber-400">{apu.code}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-100">{lab.role}</td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-sky-400">
                            {lab.shiftRegime}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            ${lab.hourlyRate.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                            +{lab.zoneAllowancePercent}% (${b.baseWithZone.toFixed(2)})
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                            ${b.wageWithRegime.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            +${b.socialChargesAmount.toFixed(2)} ({lab.socialChargesPercent}%)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                            +${b.campHourlyIncidence.toFixed(2)} (${lab.campCostPerDay}/d)
                          </td>
                          <td className="py-2.5 pl-3 text-right font-mono font-bold text-sky-400">
                            ${b.effectiveHourlyRate.toFixed(2)}/h
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
