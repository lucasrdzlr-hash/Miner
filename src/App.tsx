import React, { useEffect, useState } from 'react';
import {
  ApuItem,
  INITIAL_USERS,
  ProjectCampaign,
  ShiftRegime,
  UserAccount,
  UserRole,
  calculateApuTotals,
  getRolePermissions,
  getShiftRegimeMultiplier,
} from './types';
import { INITIAL_APU_LIBRARY, INITIAL_CAMPAIGNS } from './data/drillingSeedData';
import { StratigraphicViewer4D } from './components/StratigraphicViewer4D';
import { ApuAndResourcesView } from './components/ApuAndResourcesView';
import { CampaignOperationsView } from './components/CampaignOperationsView';
import { LoginAndPermissionsScreen } from './components/LoginAndPermissionsScreen';
import {
  auth,
  db,
  testConnection,
  signInWithGoogle,
  logoutFirebase,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Compass,
  Fuel,
  Users,
  Layers,
  Activity,
  Sparkles,
  Download,
  GitBranch,
  Plus,
  ShieldCheck,
  LogOut,
  Lock,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

const STORAGE_KEY_CAMPAIGNS = 'prisma_drilling_campaigns_v2';
const STORAGE_KEY_APUS = 'prisma_drilling_apu_library_v2';
const STORAGE_KEY_USERS = 'prisma_drilling_users_v2';

export function App() {
  const [activeNav, setActiveNav] = useState<
    'dashboard_4d' | 'wells_campaign' | 'apu_resources' | 'cashflow_supply'
  >('dashboard_4d');

  // Start on the Home/Login & Permissions screen as requested
  const [showLoginScreen, setShowLoginScreen] = useState<boolean>(true);
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4) return parsed;
      }
    } catch (e) {
      console.warn(e);
    }
    return INITIAL_USERS;
  });

  const [currentAccount, setCurrentAccount] = useState<UserAccount>(INITIAL_USERS[0]);

  const [campaigns, setCampaigns] = useState<ProjectCampaign[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CAMPAIGNS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].wells) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error loading campaigns from storage:', e);
    }
    return INITIAL_CAMPAIGNS;
  });

  const [apuLibrary, setApuLibrary] = useState<ApuItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_APUS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed[0].equipment?.[0]?.runningRate !== undefined
        ) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error loading APUs from storage:', e);
    }
    return INITIAL_APU_LIBRARY;
  });

  const [activeCampaignId, setActiveCampaignId] = useState<string>(campaigns[0]?.id || '');
  const [selectedWellId, setSelectedWellId] = useState<string | null>(
    campaigns[0]?.wells[0]?.id || null
  );
  const [user, setUser] = useState<User | null>(null);

  // Cashflow AI Advisor & Git Repo Status
  const [cashflowAdvice, setCashflowAdvice] = useState<any | null>(null);
  const [isCashflowLoading, setIsCashflowLoading] = useState<boolean>(false);
  const [gitInfo, setGitInfo] = useState<any | null>(null);

  // New Campaign Modal
  const [showNewCampaignModal, setShowNewCampaignModal] = useState<boolean>(false);
  const [newCampCode, setNewCampCode] = useState<string>('CAMP-MIN-2026-03');
  const [newCampName, setNewCampName] = useState<string>(
    'Campaña de Exploración Diamantina & Hidrogeología - Salar de Arizaro'
  );
  const [newCampClient, setNewCampClient] = useState<string>('Litio & Energía Puna S.A.');
  const [newCampLocation, setNewCampLocation] = useState<string>(
    'Salar de Arizaro, Salta (3.720 m.s.n.m.)'
  );

  // GitHub Push Modal & Form State
  const [showGitPushPanel, setShowGitPushPanel] = useState<boolean>(false);
  const [gitRepoUrl, setGitRepoUrl] = useState<string>(() => {
    return (
      localStorage.getItem('prisma_git_repo_url_v2') ||
      'https://github.com/lucasrdzlr-hash/Miner.git'
    );
  });
  const [gitToken, setGitToken] = useState<string>(() => {
    return localStorage.getItem('prisma_git_pat_token') || '';
  });
  const [gitBranch, setGitBranch] = useState<string>('main');
  const [gitCommitMsg, setGitCommitMsg] = useState<string>(
    'feat: Prisma Drill & Energy con Visor 4D, APU, Login RBAC y Vercel config'
  );
  const [isPushingGit, setIsPushingGit] = useState<boolean>(false);
  const [gitPushStatus, setGitPushStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
    hint?: string;
  } | null>(null);

  const permissions = getRolePermissions(currentAccount.role);

  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    fetch('/api/git/info')
      .then((r) => r.json())
      .then((d) => {
        setGitInfo(d);
        if (d?.branch) {
          setGitBranch(d.branch);
        }
      })
      .catch(() => {});
    return () => unsub();
  }, []);

  const handlePushToGitHub = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!gitRepoUrl.trim()) {
      setGitPushStatus({
        type: 'error',
        message: 'Ingresa la URL de tu repositorio de GitHub (ej. https://github.com/lucasrdzlr-hash/Miner.git).',
      });
      return;
    }

    setIsPushingGit(true);
    setGitPushStatus(null);
    try {
      localStorage.setItem('prisma_git_repo_url_v2', gitRepoUrl.trim());
      if (gitToken.trim()) {
        localStorage.setItem('prisma_git_pat_token', gitToken.trim());
      }

      const resp = await fetch('/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: gitRepoUrl.trim(),
          githubToken: gitToken.trim(),
          branch: gitBranch.trim() || 'main',
          commitMessage:
            gitCommitMsg.trim() ||
            'feat: actualizacion integral Prisma Drill & Energy',
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setGitPushStatus({
          type: 'success',
          message: data.message || '¡Push a GitHub completado exitosamente!',
          details: data.details,
        });
        fetch('/api/git/info')
          .then((r) => r.json())
          .then((d) => setGitInfo(d))
          .catch(() => {});
      } else {
        setGitPushStatus({
          type: 'error',
          message: data.error || 'No se pudo completar el git push.',
          details: data.details,
          hint: data.hint,
        });
      }
    } catch (err: any) {
      setGitPushStatus({
        type: 'error',
        message: err?.message || 'Error de red al intentar subir a GitHub.',
      });
    } finally {
      setIsPushingGit(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CAMPAIGNS, JSON.stringify(campaigns));
    } catch (e) {
      console.warn(e);
    }
  }, [campaigns]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_APUS, JSON.stringify(apuLibrary));
    } catch (e) {
      console.warn(e);
    }
  }, [apuLibrary]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(userAccounts));
    } catch (e) {
      console.warn(e);
    }
  }, [userAccounts]);

  // Ensure activeNav is always permitted for the current role
  useEffect(() => {
    if (activeNav === 'apu_resources' && !permissions.canViewApuAndResources) {
      setActiveNav('dashboard_4d');
    } else if (activeNav === 'cashflow_supply' && !permissions.canViewFinanceAndLogistics) {
      setActiveNav('dashboard_4d');
    }
  }, [activeNav, permissions]);

  const activeCampaign =
    campaigns.find((c) => c.id === activeCampaignId) || campaigns[0];

  const handleLoginSuccess = async (account: UserAccount) => {
    setCurrentAccount(account);
    setShowLoginScreen(false);
    if (user) {
      const path = `users/${user.uid}`;
      try {
        await setDoc(doc(db, 'users', user.uid), {
          id: user.uid,
          name: account.name,
          email: user.email || account.email,
          role: account.role,
          active: true,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  };

  const handleGoogleLoginWithRole = async (selectedRole: UserRole) => {
    try {
      const cred = await signInWithGoogle();
      const preset =
        userAccounts.find((u) => u.role === selectedRole) ||
        INITIAL_USERS.find((u) => u.role === selectedRole) ||
        INITIAL_USERS[0];
      const mergedAccount: UserAccount = {
        ...preset,
        name: cred.user?.displayName || preset.name,
        email: cred.user?.email || preset.email,
        role: selectedRole,
      };
      setCurrentAccount(mergedAccount);
      setShowLoginScreen(false);
    } catch {
      // Fallback to local role session if popup blocked in preview
      const preset =
        userAccounts.find((u) => u.role === selectedRole) || INITIAL_USERS[0];
      setCurrentAccount(preset);
      setShowLoginScreen(false);
    }
  };

  const handleQuickSwitchRole = (role: UserRole) => {
    const targetAccount =
      userAccounts.find((u) => u.role === role) ||
      INITIAL_USERS.find((u) => u.role === role) ||
      INITIAL_USERS[0];
    setCurrentAccount(targetAccount);
  };

  const handleUpdateCampaign = async (updated: ProjectCampaign) => {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (user) {
      const path = `projects/${updated.id}`;
      try {
        await setDoc(doc(db, 'projects', updated.id), {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          client: updated.client,
          startDate: updated.startDate,
          endDate: updated.endDate,
          status: updated.status,
          currency: updated.currency,
          lastSyncedAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  };

  const handleUpdateApu = async (updatedApu: ApuItem) => {
    if (!permissions.canEditApuAndRates) return;
    setApuLibrary((prev) => prev.map((a) => (a.id === updatedApu.id ? updatedApu : a)));
    if (user) {
      const path = `apuLibrary/${updatedApu.id}`;
      try {
        await setDoc(doc(db, 'apuLibrary', updatedApu.id), {
          id: updatedApu.id,
          code: updatedApu.code,
          name: updatedApu.name,
          category: updatedApu.category,
          unit: updatedApu.unit,
          description: updatedApu.description,
          overheadPercent: updatedApu.overheadPercent,
          profitPercent: updatedApu.profitPercent,
          taxPercent: updatedApu.taxPercent,
          lastUpdated: updatedApu.lastUpdated,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  };

  const handleCreateApu = (newApu: ApuItem) => {
    if (!permissions.canEditApuAndRates) return;
    setApuLibrary((prev) => [newApu, ...prev]);
  };

  const handleUpdateCampaignGlobals = (
    dieselPrice: number,
    shiftRegime: ShiftRegime,
    zonePercent: number,
    campDaily: number
  ) => {
    if (!permissions.canEditGlobalDieselAndShifts) return;
    const updatedCamp: ProjectCampaign = {
      ...activeCampaign,
      dieselBasePricePerLiter: dieselPrice,
      defaultShiftRegime: shiftRegime,
      defaultZoneAllowancePercent: zonePercent,
      defaultCampCostPerDay: campDaily,
    };
    handleUpdateCampaign(updatedCamp);

    setApuLibrary((prev) =>
      prev.map((apu) => ({
        ...apu,
        labor: apu.labor.map((l) => ({
          ...l,
          shiftRegime,
          zoneAllowancePercent: zonePercent,
          campCostPerDay: campDaily,
        })),
        equipment: apu.equipment.map((eq) => ({
          ...eq,
          dieselPricePerLiter: dieselPrice,
        })),
      }))
    );
  };

  const handleCreateNewCampaign = () => {
    if (!permissions.canCreateCampaign) return;
    if (!newCampCode.trim() || !newCampName.trim()) return;
    const baseTemplate = campaigns[0];
    const created: ProjectCampaign = {
      ...baseTemplate,
      id: `camp-${Date.now()}`,
      code: newCampCode.trim(),
      name: newCampName.trim(),
      client: newCampClient.trim(),
      locationName: newCampLocation.trim(),
      startDate: new Date().toISOString().slice(0, 10),
      status: 'in_progress',
    };
    setCampaigns((prev) => [created, ...prev]);
    setActiveCampaignId(created.id);
    setSelectedWellId(created.wells[0]?.id || null);
    setShowNewCampaignModal(false);
  };

  // Aggregate Campaign Metrics
  const drillingWells = activeCampaign.wells.filter((w) => w.type !== 'electromechanical');
  const totalTargetMeters = drillingWells.reduce((acc, w) => acc + w.targetDepthM, 0);
  const totalDrilledMeters = drillingWells.reduce((acc, w) => acc + w.drilledDepthM, 0);
  const totalCasingMeters = drillingWells.reduce((acc, w) => acc + w.casingDepthM, 0);
  const drillingProgressPct =
    totalTargetMeters > 0 ? Math.round((totalDrilledMeters / totalTargetMeters) * 100) : 0;

  const totalRunningHours = activeCampaign.wells.reduce((acc, w) => acc + w.runningHoursTotal, 0);
  const totalStandbyHours = activeCampaign.wells.reduce((acc, w) => acc + w.standbyHoursTotal, 0);
  const totalDieselLiters = activeCampaign.wells.reduce((acc, w) => acc + w.dieselConsumedLiters, 0);
  const totalDieselCostUsd = totalDieselLiters * activeCampaign.dieselBasePricePerLiter;

  const budgetMetrics = activeCampaign.budgetItems.reduce(
    (acc, bi) => {
      const apu = apuLibrary.find((a) => a.id === bi.apuId) || apuLibrary[0];
      const t = calculateApuTotals(apu);
      const itemTotal = t.unitPrice * bi.quantity;
      const itemCertified = itemTotal * (bi.progress / 100);
      const itemMaterialsRemaining = t.materialsSubtotal * bi.quantity * (1 - bi.progress / 100);
      return {
        totalBudget: acc.totalBudget + itemTotal,
        certifiedTotal: acc.certifiedTotal + itemCertified,
        remainingMaterials: acc.remainingMaterials + itemMaterialsRemaining,
      };
    },
    { totalBudget: 0, certifiedTotal: 0, remainingMaterials: 0 }
  );

  const shiftMultiplier = getShiftRegimeMultiplier(activeCampaign.defaultShiftRegime);

  const wellChartData = activeCampaign.wells.map((w) => ({
    name: w.code.replace('POZO ', '').replace('FRENTE ', ''),
    perforado: w.drilledDepthM,
    objetivo: w.targetDepthM,
    casing: w.casingDepthM,
    runningHours: w.runningHoursTotal,
    standbyHours: w.standbyHoursTotal,
  }));

  const handleRunCashflowAnalysis = async () => {
    if (!permissions.canRunFinancialCashflow) return;
    setIsCashflowLoading(true);
    try {
      const resp = await fetch('/api/ai/cashflow-optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetTotal: budgetMetrics.totalBudget,
          actualSpent: budgetMetrics.certifiedTotal,
          remainingMaterialsCost: budgetMetrics.remainingMaterials,
          monthlyCashflows: [
            { month: 'Mes 1 (DTM & Pads)', planned: budgetMetrics.totalBudget * 0.22 },
            { month: 'Mes 2 (Perforación DDH/RC)', planned: budgetMetrics.totalBudget * 0.35 },
            { month: 'Mes 3 (Entubado Casing API)', planned: budgetMetrics.totalBudget * 0.25 },
            { month: 'Mes 4 (Montaje BES & Manifold)', planned: budgetMetrics.totalBudget * 0.18 },
          ],
          inflationRate: 1.5,
        }),
      });
      const json = await resp.json();
      if (json.success && json.data) {
        setCashflowAdvice(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCashflowLoading(false);
    }
  };

  if (showLoginScreen) {
    return (
      <LoginAndPermissionsScreen
        users={userAccounts}
        onLoginSuccess={handleLoginSuccess}
        onGoogleLogin={handleGoogleLoginWithRole}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-950 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveNav('dashboard_4d');
          }}
          className="text-lg font-extrabold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          PRISMA <span className="text-amber-500">DRILL & ENERGY</span>
        </a>

        {/* Zone 2: Navigation links filtered by Role Permissions */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          {permissions.canViewDashboard4D && (
            <button
              onClick={() => setActiveNav('dashboard_4d')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeNav === 'dashboard_4d'
                  ? 'text-white border-amber-500 font-semibold'
                  : 'border-transparent'
              }`}
            >
              Campaña & Visor 4D
            </button>
          )}
          {permissions.canViewWellsAndFronts && (
            <button
              onClick={() => setActiveNav('wells_campaign')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeNav === 'wells_campaign'
                  ? 'text-white border-amber-500 font-semibold'
                  : 'border-transparent'
              }`}
            >
              Pozos & Frentes
            </button>
          )}
          {permissions.canViewApuAndResources && (
            <button
              onClick={() => setActiveNav('apu_resources')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeNav === 'apu_resources'
                  ? 'text-white border-amber-500 font-semibold'
                  : 'border-transparent'
              }`}
            >
              APU, Sondas & Turnos
            </button>
          )}
          {permissions.canViewFinanceAndLogistics && (
            <button
              onClick={() => setActiveNav('cashflow_supply')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeNav === 'cashflow_supply'
                  ? 'text-white border-amber-500 font-semibold'
                  : 'border-transparent'
              }`}
            >
              Logística & Finanzas
            </button>
          )}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowLoginScreen(true)}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Inicio / Permisos ({currentAccount.roleLabel.split('/')[0].trim()})
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 overflow-x-auto">
        {permissions.canViewDashboard4D && (
          <button
            onClick={() => setActiveNav('dashboard_4d')}
            className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap shrink-0 ${
              activeNav === 'dashboard_4d' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Visor 4D
          </button>
        )}
        {permissions.canViewWellsAndFronts && (
          <button
            onClick={() => setActiveNav('wells_campaign')}
            className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap shrink-0 ${
              activeNav === 'wells_campaign' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Pozos & Frentes
          </button>
        )}
        {permissions.canViewApuAndResources && (
          <button
            onClick={() => setActiveNav('apu_resources')}
            className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap shrink-0 ${
              activeNav === 'apu_resources' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            APU & Turnos
          </button>
        )}
        {permissions.canViewFinanceAndLogistics && (
          <button
            onClick={() => setActiveNav('cashflow_supply')}
            className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap shrink-0 ${
              activeNav === 'cashflow_supply' ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Finanzas
          </button>
        )}
      </div>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Active Session & Role-Based Permissions Control Bar */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-100">{currentAccount.name}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono text-amber-400 font-semibold">
                  Rol: {permissions.roleTitle}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400">{currentAccount.assignedPadOrScope}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Permisos activos: {permissions.permissionsList[0]}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">Probar Rol:</span>
            {(['admin', 'client', 'technician', 'foreman'] as UserRole[]).map((r) => {
              const labels: Record<UserRole, string> = {
                admin: 'Administrador',
                client: 'Cliente',
                technician: 'Técnico',
                foreman: 'Capataz',
              };
              const isCurrent = currentAccount.role === r;
              return (
                <button
                  key={r}
                  onClick={() => handleQuickSwitchRole(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {labels[r]}
                </button>
              );
            })}
            <button
              onClick={() => setShowLoginScreen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              Cambiar Usuario
            </button>
          </div>
        </section>

        {/* Campaign Context Bar & Selector */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-mono font-semibold text-amber-400">{activeCampaign.code}</span>
              <span aria-hidden="true">·</span>
              <span>Operadora / Comitente: {activeCampaign.client}</span>
              <span aria-hidden="true">·</span>
              <span>{activeCampaign.locationName}</span>
              <span aria-hidden="true">·</span>
              <span>
                Diagrama Base: {activeCampaign.defaultShiftRegime} (+
                {activeCampaign.defaultZoneAllowancePercent}% Zona)
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-100 text-balance">
              {activeCampaign.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Campaña Activa</label>
              <select
                value={activeCampaign.id}
                onChange={(e) => {
                  const cid = e.target.value;
                  setActiveCampaignId(cid);
                  const found = campaigns.find((c) => c.id === cid);
                  if (found) setSelectedWellId(found.wells[0]?.id || null);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-100"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            {permissions.canCreateCampaign && (
              <button
                onClick={() => setShowNewCampaignModal((s) => !s)}
                className="mt-5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Nueva Campaña
              </button>
            )}

            <button
              onClick={() => setShowGitPushPanel((s) => !s)}
              className="mt-5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <UploadCloud className="w-4 h-4" />
              Subir Push a GitHub
            </button>

            {user ? (
              <button
                onClick={() => logoutFirebase()}
                className="mt-5 px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-slate-300 whitespace-nowrap shrink-0"
              >
                Cloud: {user.email?.split('@')[0]}
              </button>
            ) : (
              <button
                onClick={() => signInWithGoogle().catch(() => {})}
                className="mt-5 px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-slate-300 whitespace-nowrap shrink-0"
              >
                Sincronizar Cloud
              </button>
            )}
          </div>
        </section>

        {/* Interactive GitHub Push Panel (Accessible from Top Bar in any view) */}
        {showGitPushPanel && (
          <section className="bg-slate-900 border border-sky-500/50 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-sky-400" />
                  Sincronización Directa y Subida Push a GitHub (Listo para Vercel)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ejecuta <span className="font-mono text-slate-200">git add .</span>,{' '}
                  <span className="font-mono text-slate-200">git commit</span> y{' '}
                  <span className="font-mono text-slate-200">git push -u origin {gitBranch || 'main'}</span>{' '}
                  directamente hacia tu repositorio remoto.
                </p>
              </div>
              <button
                onClick={() => setShowGitPushPanel(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cerrar panel
              </button>
            </div>

            <form onSubmit={handlePushToGitHub} className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
              <div className="md:col-span-4">
                <label className="block text-slate-300 font-medium mb-1">
                  URL del Repositorio GitHub
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/usuario/repositorio.git"
                  value={gitRepoUrl}
                  onChange={(e) => setGitRepoUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-medium">
                    GitHub Token (PAT: ghp_...)
                  </label>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=Prisma-Drill-Energy-Miner"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 font-semibold underline"
                  >
                    Generar Token ↗
                  </a>
                </div>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-300 font-medium mb-1">Rama (Branch)</label>
                <input
                  type="text"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-slate-300 font-medium mb-1">Mensaje de Commit</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={gitCommitMsg}
                    onChange={(e) => setGitCommitMsg(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={isPushingGit}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    {isPushingGit ? 'Subiendo...' : 'Push Ahora'}
                  </button>
                </div>
              </div>
            </form>

            {gitPushStatus && (
              <div
                className={`rounded-lg p-3.5 border text-xs space-y-1.5 ${
                  gitPushStatus.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {gitPushStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{gitPushStatus.message}</span>
                </div>
                {gitPushStatus.hint && (
                  <p className="text-amber-300 font-medium">{gitPushStatus.hint}</p>
                )}
                {gitPushStatus.details && (
                  <pre className="bg-slate-950/80 border border-slate-800 rounded p-2 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
                    {gitPushStatus.details}
                  </pre>
                )}
              </div>
            )}
          </section>
        )}

        {/* New Campaign Creation Modal (Admin Only) */}
        {showNewCampaignModal && permissions.canCreateCampaign && (
          <section className="bg-slate-900 border border-amber-500/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100">
                Apertura de Nueva Campaña de Perforación, Minería o Energía
              </h3>
              <button
                onClick={() => setShowNewCampaignModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Código de Campaña</label>
                <input
                  type="text"
                  value={newCampCode}
                  onChange={(e) => setNewCampCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Nombre del Proyecto / Bloque</label>
                <input
                  type="text"
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Operadora / Comitente</label>
                <input
                  type="text"
                  value={newCampClient}
                  onChange={(e) => setNewCampClient(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Yacimiento / Altitud</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCampLocation}
                    onChange={(e) => setNewCampLocation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100"
                  />
                  <button
                    onClick={handleCreateNewCampaign}
                    className="px-3.5 py-2 bg-amber-500 text-slate-950 font-semibold rounded flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Crear
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 4-COLUMN KPI TELEMETRY STRIP */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Avance Perforación & Casing</span>
              <Compass className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-slate-100 mt-1.5">
              {totalDrilledMeters.toLocaleString()} m{' '}
              <span className="text-sm font-normal text-slate-400">
                / {totalTargetMeters.toLocaleString()} m
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Avance físico: <strong className="text-emerald-400">{drillingProgressPct}%</strong> ·
              Entubado Casing: <strong className="text-sky-400">{totalCasingMeters} m</strong>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Sondas: Running vs Stand-by</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-emerald-400 mt-1.5">
              {totalRunningHours} hs{' '}
              <span className="text-sm font-normal text-amber-400">
                vs {totalStandbyHours} hs Stby
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Eficiencia operativa:{' '}
              <strong className="text-slate-200">
                {Math.round(
                  (totalRunningHours / Math.max(1, totalRunningHours + totalStandbyHours)) * 100
                )}
                %
              </strong>{' '}
              en rotación efectiva
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Control de Gasoil en Campo</span>
              <Fuel className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-rose-400 mt-1.5">
              {totalDieselLiters.toLocaleString()} L
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {currentAccount.role === 'foreman' ? (
                <span>
                  Consumo medio:{' '}
                  <strong className="text-slate-100">
                    {(totalDieselLiters / Math.max(1, totalRunningHours)).toFixed(1)} L/h op.
                  </strong>
                </span>
              ) : (
                <span>
                  Costo Gasoil:{' '}
                  <strong className="text-slate-100">
                    ${totalDieselCostUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </strong>{' '}
                  (@ ${activeCampaign.dieselBasePricePerLiter.toFixed(2)}/L)
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {currentAccount.role === 'foreman'
                  ? 'Dotación & Régimen de Turno'
                  : 'Régimen de Campo & Presupuesto'}
              </span>
              <Users className="w-4 h-4 text-sky-400" />
            </div>
            {currentAccount.role === 'foreman' ? (
              <>
                <div className="text-2xl font-mono font-bold text-sky-400 mt-1.5">
                  Turno {activeCampaign.defaultShiftRegime}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Partes registrados:{' '}
                  <strong className="text-emerald-400">{activeCampaign.dailyLogs.length}</strong> ·
                  Zona +{activeCampaign.defaultZoneAllowancePercent}%
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-mono font-bold text-sky-400 mt-1.5">
                  USD {(budgetMetrics.totalBudget / 1000).toFixed(1)}k
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Turno <strong className="text-slate-100">{activeCampaign.defaultShiftRegime}</strong>{' '}
                  (×{shiftMultiplier.rotationFactor}) · Certif:{' '}
                  <strong className="text-emerald-400">
                    ${(budgetMetrics.certifiedTotal / 1000).toFixed(1)}k
                  </strong>
                </div>
              </>
            )}
          </div>
        </section>

        {/* NAVIGATION VIEW 1: CAMPAÑA & VISOR 4D ESTRATIGRÁFICO */}
        {activeNav === 'dashboard_4d' && (
          <div className="space-y-6">
            {/* Hero 4D Subsurface Stratigraphic, Wells & Drilling Campaign Viewer */}
            <StratigraphicViewer4D
              campaign={activeCampaign}
              selectedWellId={selectedWellId}
              onSelectWell={(wid) => setSelectedWellId(wid)}
            />

            {/* Analytical Strip Below the 4D Viewport */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Chart: Drilled Depth vs Target Depth & Casing by Well */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">
                      Avance de Perforación (m) y Entubado Casing API por Pozo / Frente
                    </h3>
                    <p className="text-xs text-slate-400">
                      Comparativa entre profundidad objetivo de diseño, metros perforados reales y
                      metros entubados con Casing.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveNav('wells_campaign')}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0"
                  >
                    Gestionar Pozos →
                  </button>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={wellChartData}
                      margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                    >
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} unit="m" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#1e293b',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                      />
                      <Bar
                        dataKey="objetivo"
                        name="Prof. Objetivo (m)"
                        fill="#334155"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="perforado"
                        name="Prof. Perforada (m)"
                        fill="#38bdf8"
                        radius={[4, 4, 0, 0]}
                      >
                        {wellChartData.map((_, idx) => (
                          <Cell key={idx} fill={idx % 2 === 0 ? '#38bdf8' : '#10b981'} />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="casing"
                        name="Casing Entubado (m)"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right Summary: Sector APU Quick Reference Card (or Field Log Summary for Foreman) */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-400" />
                      {currentAccount.role === 'foreman'
                        ? 'Estándares Operativos de Sonda y Consumo de Gasoil'
                        : 'Precios Unitarios (APU) Típicos de Campaña'}
                    </h3>
                    {permissions.canViewApuAndResources ? (
                      <button
                        onClick={() => setActiveNav('apu_resources')}
                        className="text-xs font-semibold text-sky-400 hover:text-sky-300"
                      >
                        Editar APU →
                      </button>
                    ) : (
                      <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-400" /> Solo Lectura
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {currentAccount.role === 'foreman'
                      ? 'Rendimientos técnicos esperados y consumo de gasoil por unidad de obra en plataforma.'
                      : 'Incluye tarifas Running/Stand-by, gasoil horario y mano de obra en turnos 14x14 / 21x7.'}
                  </p>

                  <div className="space-y-2.5 mt-4">
                    {apuLibrary.slice(0, 5).map((apu) => {
                      const t = calculateApuTotals(apu);
                      return (
                        <div
                          key={apu.id}
                          className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3 text-xs tabular-nums"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-amber-400 font-semibold">{apu.code}</div>
                            <div className="text-slate-200 font-medium truncate">{apu.name}</div>
                          </div>
                          <div className="text-right shrink-0">
                            {currentAccount.role !== 'foreman' && (
                              <div className="font-mono font-bold text-emerald-400">
                                ${t.unitPrice.toFixed(2)} / {apu.unit}
                              </div>
                            )}
                            <div className="text-slate-400 font-mono">
                              Gasoil: {t.dieselLitersPerUnit.toFixed(1)} L/{apu.unit}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NAVIGATION VIEW 2: POZOS, FRENTES, CÓMPUTO, GANTT & PARTES DIARIOS */}
        {activeNav === 'wells_campaign' && permissions.canViewWellsAndFronts && (
          <CampaignOperationsView
            campaign={activeCampaign}
            apuLibrary={apuLibrary}
            onUpdateCampaign={handleUpdateCampaign}
            onSelectWellIn4D={(wellId) => {
              setSelectedWellId(wellId);
              setActiveNav('dashboard_4d');
            }}
            permissions={permissions}
          />
        )}

        {/* NAVIGATION VIEW 3: MATRIZ DE APU, EQUIPOS RUNNING/STAND-BY & TURNOS 14x14 / 21x7 */}
        {activeNav === 'apu_resources' && permissions.canViewApuAndResources && (
          <ApuAndResourcesView
            apuLibrary={apuLibrary}
            onUpdateApu={handleUpdateApu}
            onCreateApu={handleCreateApu}
            campaign={activeCampaign}
            onUpdateCampaignGlobals={handleUpdateCampaignGlobals}
          />
        )}

        {/* NAVIGATION VIEW 4: CONTROL FINANCIERO, SUPPLY CHAIN DE POZOS, USUARIOS RBAC & REPOSITORIO */}
        {activeNav === 'cashflow_supply' && permissions.canViewFinanceAndLogistics && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    Control Financiero de Campaña, Abastecimiento Crítico (Casing API, Coronas,
                    Bentonita & Gasoil)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Auditoría de valor ganado (EVM), estrategia de acopio en yacimiento y control
                    de desembolsos por frente.
                  </p>
                </div>
                {permissions.canRunFinancialCashflow ? (
                  <button
                    onClick={handleRunCashflowAnalysis}
                    disabled={isCashflowLoading}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isCashflowLoading
                      ? 'Analizando Flujo de Caja...'
                      : 'Generar Diagnóstico de Abastecimiento y Cashflow'}
                  </button>
                ) : (
                  <span className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Vista de Certificaciones para Cliente (Solo Lectura)
                  </span>
                )}
              </div>

              {cashflowAdvice && (
                <div className="mt-4 bg-slate-950 border border-amber-500/40 rounded-lg p-4 text-xs space-y-2">
                  <div className="font-bold text-amber-400">
                    Estado Financiero de Campaña: {cashflowAdvice.financialHealth}
                  </div>
                  <p className="text-slate-200">{cashflowAdvice.earnedValueInsight}</p>
                  <p className="text-sky-400 font-medium">
                    Estrategia de Supply Chain Minero/Energético:{' '}
                    {cashflowAdvice.procurementStrategy}
                  </p>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 pt-1">
                    {(cashflowAdvice.recommendedActions || []).map((act: string, i: number) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Financial Breakdown by Category */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 tabular-nums">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                  <div className="text-xs text-slate-400">Presupuesto Total de Campaña</div>
                  <div className="text-xl font-mono font-bold text-slate-100 mt-1">
                    USD{' '}
                    {budgetMetrics.totalBudget.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Incluye Gastos Generales de Campamento (18%) y Beneficio (12%)
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                  <div className="text-xs text-slate-400">Total Certificado por Avance de Pozos</div>
                  <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                    USD{' '}
                    {budgetMetrics.certifiedTotal.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Representa el{' '}
                    {Math.round(
                      (budgetMetrics.certifiedTotal / Math.max(1, budgetMetrics.totalBudget)) * 100
                    )}
                    % del contrato ejecutado
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                  <div className="text-xs text-slate-400">
                    Insumos Críticos Pendientes de Acopio
                  </div>
                  <div className="text-xl font-mono font-bold text-sky-400 mt-1">
                    USD{' '}
                    {budgetMetrics.remainingMaterials.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Casing API J55, Coronas HQ/NQ, Bentonita y Bombas BES
                  </div>
                </div>
              </div>
            </div>

            {/* Admin User & Role Management Section */}
            {permissions.canManageUsersAndRoles && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      Administración de Usuarios, Perfiles y Permisos de Campaña (RBAC)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Gestión de cuentas para Administrador, Cliente, Técnico y Capataz de Sonda.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowLoginScreen(true)}
                    className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-amber-400 font-semibold"
                  >
                    Abrir Portal de Inicio & Matriz Completa →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {userAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-400 uppercase">
                          {acc.role}
                        </span>
                        <span className="font-mono text-slate-400">PIN: {acc.pinCode}</span>
                      </div>
                      <div className="font-bold text-slate-100">{acc.name}</div>
                      <div className="font-mono text-slate-400 truncate">{acc.email}</div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Alcance / Plataforma Asignada
                        </label>
                        <input
                          type="text"
                          value={acc.assignedPadOrScope}
                          onChange={(e) => {
                            const val = e.target.value;
                            setUserAccounts((prev) =>
                              prev.map((u) =>
                                u.id === acc.id ? { ...u, assignedPadOrScope: val } : u
                              )
                            );
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Repository, GitHub Push & Backup Export Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-sky-400" />
                    Repositorio GitHub, Push Directo y Respaldo ZIP (Preconfigurado para Vercel)
                  </div>
                  <p className="text-xs text-slate-400">
                    Rama activa:{' '}
                    <span className="font-mono text-slate-200">{gitInfo?.branch || 'main'}</span> ·{' '}
                    {gitInfo?.lastCommit ||
                      'Arquitectura adaptada a Perforación, Minería y Energía'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handlePushToGitHub()}
                    disabled={isPushingGit}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    {isPushingGit ? 'Subiendo a GitHub...' : 'Subir Push a GitHub Ahora'}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/git/generate-zip', { method: 'POST' });
                      const j = await r.json();
                      if (j.downloadUrl) {
                        const a = document.createElement('a');
                        a.href = j.downloadUrl;
                        a.download = 'prisma-drill-energy.zip';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4 text-sky-400" />
                    Descargar Paquete Completo (ZIP)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">URL del Repositorio GitHub</label>
                  <input
                    type="text"
                    value={gitRepoUrl}
                    onChange={(e) => setGitRepoUrl(e.target.value)}
                    placeholder="https://github.com/usuario/repo.git"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400">
                      Personal Access Token (PAT: ghp_...)
                    </label>
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo&description=Prisma-Drill-Energy-Miner"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 font-semibold underline"
                    >
                      Generar Token en GitHub ↗
                    </a>
                  </div>
                  <input
                    type="password"
                    value={gitToken}
                    onChange={(e) => setGitToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Rama & Mensaje de Commit</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                      className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 font-mono text-slate-100"
                    />
                    <input
                      type="text"
                      value={gitCommitMsg}
                      onChange={(e) => setGitCommitMsg(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {gitPushStatus && (
                <div
                  className={`rounded-lg p-3.5 border text-xs space-y-1.5 ${
                    gitPushStatus.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {gitPushStatus.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{gitPushStatus.message}</span>
                  </div>
                  {gitPushStatus.hint && (
                    <p className="text-amber-300 font-medium">{gitPushStatus.hint}</p>
                  )}
                  {gitPushStatus.details && (
                    <pre className="bg-slate-950/80 border border-slate-800 rounded p-2 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
                      {gitPushStatus.details}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div>
          Prisma by AKME · Plataforma de Ingeniería de Costos, APU, Pozos y Visor 4D para
          Perforación, Minería y Energía
        </div>
        <div className="font-mono tabular-nums">
          Sesión: {currentAccount.name} ({permissions.roleTitle.split('/')[0].trim()}) · Campaña:{' '}
          {activeCampaign.code}
        </div>
      </footer>
    </div>
  );
}

export default App;
