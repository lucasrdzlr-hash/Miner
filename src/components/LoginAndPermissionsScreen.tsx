import React, { useState } from 'react';
import {
  INITIAL_USERS,
  UserAccount,
  UserRole,
  getRolePermissions,
} from '../types';
import {
  ShieldCheck,
  UserCheck,
  Wrench,
  HardHat,
  Lock,
  Check,
  X,
  ArrowRight,
  KeyRound,
  Building2,
  Compass,
  Layers,
} from 'lucide-react';

interface LoginAndPermissionsScreenProps {
  users: UserAccount[];
  onLoginSuccess: (account: UserAccount) => void;
  onGoogleLogin: (selectedRole: UserRole) => void;
}

export const LoginAndPermissionsScreen: React.FC<LoginAndPermissionsScreenProps> = ({
  users,
  onLoginSuccess,
  onGoogleLogin,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [emailInput, setEmailInput] = useState<string>(INITIAL_USERS[0].email);
  const [pinInput, setPinInput] = useState<string>(INITIAL_USERS[0].pinCode);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState<boolean>(true);

  const roleCards: {
    role: UserRole;
    shortTitle: string;
    subtitle: string;
    icon: React.ReactNode;
    accentText: string;
    accentBorder: string;
  }[] = [
    {
      role: 'admin',
      shortTitle: 'Administrador',
      subtitle: 'Dirección de Operaciones, Contratos, APU y Finanzas',
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
      accentText: 'text-amber-400',
      accentBorder: 'border-amber-500/60 bg-slate-900',
    },
    {
      role: 'client',
      shortTitle: 'Cliente',
      subtitle: 'Operadora Minera/Energética · Supervisión 4D y Certificaciones',
      icon: <Building2 className="w-5 h-5 text-emerald-400" />,
      accentText: 'text-emerald-400',
      accentBorder: 'border-emerald-500/60 bg-slate-900',
    },
    {
      role: 'technician',
      shortTitle: 'Técnico',
      subtitle: 'Ing. Perforación, Geología, Lodos, Cómputos y APU',
      icon: <Wrench className="w-5 h-5 text-sky-400" />,
      accentText: 'text-sky-400',
      accentBorder: 'border-sky-500/60 bg-slate-900',
    },
    {
      role: 'foreman',
      shortTitle: 'Capataz',
      subtitle: 'Jefe de Sonda / Campo · Parte Diario, Gasoil y Turno 14x14',
      icon: <HardHat className="w-5 h-5 text-rose-400" />,
      accentText: 'text-rose-400',
      accentBorder: 'border-rose-500/60 bg-slate-900',
    },
  ];

  const handleSelectRoleCard = (role: UserRole) => {
    setSelectedRole(role);
    setLoginError(null);
    const presetUser = users.find((u) => u.role === role) || INITIAL_USERS.find((u) => u.role === role);
    if (presetUser) {
      setEmailInput(presetUser.email);
      setPinInput(presetUser.pinCode);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const matchedUser = users.find(
      (u) =>
        (u.email.toLowerCase() === emailInput.trim().toLowerCase() || u.role === selectedRole) &&
        (u.pinCode === pinInput.trim() || pinInput.trim().length >= 4)
    );

    if (matchedUser) {
      onLoginSuccess({
        ...matchedUser,
        role: selectedRole,
      });
    } else {
      const fallback = INITIAL_USERS.find((u) => u.role === selectedRole) || INITIAL_USERS[0];
      onLoginSuccess(fallback);
    }
  };

  const activePermissions = getRolePermissions(selectedRole);

  const matrixRows = [
    {
      capability: 'Gemelo Digital 4D (Estratos, Pozos DDH/RC y Casing API)',
      admin: 'Control Total',
      client: 'Inspección 4D',
      technician: 'Simulación & RQD',
      foreman: 'Consulta Campo',
    },
    {
      capability: 'Actualización de Avance de Pozos (m) y Entubado Casing',
      admin: true,
      client: false,
      technician: true,
      foreman: true,
    },
    {
      capability: 'Carga de Partes Diarios de Sonda (Running/Stand-by y Gasoil L)',
      admin: true,
      client: false,
      technician: true,
      foreman: true,
    },
    {
      capability: 'Cómputo Métrico y Presupuesto por Pozo / Frente',
      admin: 'Edición Total',
      client: 'Solo Lectura',
      technician: 'Edición Técnica',
      foreman: 'Oculto (Sin $)',
    },
    {
      capability: 'Edición de APU, Tarifas Running vs Stand-by y Gasoil (L/h)',
      admin: true,
      client: false,
      technician: true,
      foreman: false,
    },
    {
      capability: 'Liquidación Mano de Obra (Turnos 14x14, 21x7, Zona y Campamento)',
      admin: true,
      client: false,
      technician: true,
      foreman: false,
    },
    {
      capability: 'Flujo de Caja (Cashflow), Abastecimiento Crítico y Creación de Campañas',
      admin: true,
      client: 'Vista Certificados',
      technician: false,
      foreman: false,
    },
    {
      capability: 'Administración de Usuarios, Credenciales y Matriz RBAC',
      admin: true,
      client: false,
      technician: false,
      foreman: false,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-950">
        <div className="text-lg font-extrabold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          PRISMA <span className="text-amber-500">DRILL & ENERGY</span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-xs text-slate-400">
          <span>Campañas de Perforación DDH/RC</span>
          <span aria-hidden="true">·</span>
          <span>Control Running vs Stand-by & Gasoil</span>
          <span aria-hidden="true">·</span>
          <span>Turnos 14x14 y 21x7</span>
          <span aria-hidden="true">·</span>
          <span>Visor 4D Estratigráfico</span>
        </nav>

        <button
          onClick={() => setShowMatrix((m) => !m)}
          className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {showMatrix ? 'Ocultar Matriz de Permisos' : 'Ver Matriz de Permisos'}
        </button>
      </header>

      {/* Main Content Split: Role Selector & Login + Active Role Permissions Preview */}
      <main className="max-w-[1380px] w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Hero Header */}
        <div className="max-w-3xl space-y-2">
          <div className="text-xs font-mono font-semibold text-amber-400">
            PORTAL DE ACCESO Y CONTROL DE PERMISOS POR ROL (RBAC)
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight text-balance">
            Plataforma Integral de Campañas de Perforación, Minería y Energía
          </h1>
          <p className="text-sm text-slate-400">
            Selecciona tu perfil operativo para ingresar al entorno de trabajo con los permisos y vistas correspondientes a tu función en campaña.
          </p>
        </div>

        {/* 4 Role Cards Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {roleCards.map((rc) => {
            const isSelected = selectedRole === rc.role;
            const preset = users.find((u) => u.role === rc.role) || INITIAL_USERS.find((u) => u.role === rc.role);
            return (
              <div
                key={rc.role}
                onClick={() => handleSelectRoleCard(rc.role)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleSelectRoleCard(rc.role);
                }}
                className={`cursor-pointer text-left rounded-xl p-5 border transition-all flex flex-col justify-between ${
                  isSelected
                    ? `${rc.accentBorder} shadow-lg`
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      {rc.icon}
                    </div>
                    <span className={`text-xs font-mono font-semibold ${rc.accentText}`}>
                      {isSelected ? 'PERFIL ACTIVO' : 'SELECCIONAR'}
                    </span>
                  </div>

                  <h2 className="text-base font-bold text-slate-100 mt-3">{rc.shortTitle}</h2>
                  <p className="text-xs text-slate-400 mt-1">{rc.subtitle}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="font-mono text-slate-400 truncate">
                    {preset?.name}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (preset) onLoginSuccess(preset);
                    }}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 whitespace-nowrap shrink-0 ml-2"
                  >
                    Entrar <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 2-Column Login Form + Detailed Role Permissions Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column (5 cols): Credentials & Quick Access Form */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <div className="text-xs text-slate-400">Iniciar Sesión como</div>
                  <div className="text-base font-bold text-slate-100">
                    {activePermissions.roleTitle}
                  </div>
                </div>
                <Lock className="w-4 h-4 text-amber-400" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Correo Corporativo / Operador de Campo
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label className="font-medium text-slate-300">
                    Contraseña / PIN de Campamento
                  </label>
                  <span className="font-mono text-slate-400">
                    PIN Demo: {INITIAL_USERS.find((u) => u.role === selectedRole)?.pinCode}
                  </span>
                </div>
                <input
                  type="password"
                  required
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {loginError && (
                <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800 rounded-lg px-3 py-2">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                Ingresar como {activePermissions.roleTitle.split('/')[0]}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-800 space-y-2.5">
              <button
                type="button"
                onClick={() => onGoogleLogin(selectedRole)}
                className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <UserCheck className="w-4 h-4 text-sky-400" />
                Autenticar con Google Cloud ({activePermissions.roleTitle.split('/')[0]})
              </button>
              <div className="text-xs text-slate-400 text-center">
                Puedes cambiar de rol en cualquier momento desde la barra superior para verificar cada nivel de acceso.
              </div>
            </div>
          </div>

          {/* Right Column (7 cols): Detailed Permissions & Scope of Selected Role */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-xs font-mono text-amber-400 uppercase">
                    Alcance de Permisos del Rol Seleccionado
                  </span>
                  <h3 className="text-base font-bold text-slate-100 mt-0.5">
                    {activePermissions.roleTitle}
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Rol ID: {activePermissions.role.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-emerald-400">
                    Capacidades y Módulos Habilitados
                  </div>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {activePermissions.permissionsList.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-amber-400">
                    Restricciones de Seguridad Aplicadas
                  </div>
                  <ul className="space-y-2 text-xs text-slate-400">
                    {activePermissions.restrictionsList.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mt-4 space-y-1.5 text-xs">
                    <div className="text-slate-400 font-medium">Vistas de Navegación Activas:</div>
                    <div className="flex flex-wrap gap-2 text-slate-200 font-mono">
                      <span>✓ Visor 4D</span>
                      {activePermissions.canViewWellsAndFronts && <span>· ✓ Pozos & Frentes</span>}
                      {activePermissions.canViewApuAndResources && <span>· ✓ APU & Turnos</span>}
                      {activePermissions.canViewFinanceAndLogistics && <span>· ✓ Finanzas</span>}
                      {activePermissions.canManageUsersAndRoles && <span>· ✓ Usuarios RBAC</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Compass className="w-4 h-4 text-sky-400 shrink-0" />
                <span>
                  Asignación por defecto:{' '}
                  <strong className="text-slate-100">
                    {users.find((u) => u.role === selectedRole)?.assignedPadOrScope}
                  </strong>
                </span>
              </div>
              <span className="font-mono text-slate-400">
                Turnos 14x14 / 21x7 · Control Gasoil & Stand-by
              </span>
            </div>
          </div>
        </div>

        {/* Full RBAC Permissions Comparison Matrix */}
        {showMatrix && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  Matriz de Permisos y Accesos por Perfil (Administrador · Cliente · Técnico · Capataz)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Política de control de acceso aplicada sobre campañas de perforación, precios unitarios (APU), partes diarios de sonda y finanzas.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">Módulo / Acción del Sistema</th>
                    <th className="py-2.5 px-3 font-semibold text-amber-400 text-center">
                      Administrador
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-emerald-400 text-center">
                      Cliente
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-sky-400 text-center">
                      Técnico
                    </th>
                    <th className="py-2.5 pl-3 font-semibold text-rose-400 text-center">
                      Capataz
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {matrixRows.map((row, i) => {
                    const renderCell = (val: boolean | string) => {
                      if (typeof val === 'string') {
                        return <span className="font-mono text-slate-200">{val}</span>;
                      }
                      return val ? (
                        <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-slate-600 mx-auto" />
                      );
                    };
                    return (
                      <tr key={i} className="hover:bg-slate-950/50">
                        <td className="py-2.5 pr-4 font-medium text-slate-200">{row.capability}</td>
                        <td className="py-2.5 px-3 text-center">{renderCell(row.admin)}</td>
                        <td className="py-2.5 px-3 text-center">{renderCell(row.client)}</td>
                        <td className="py-2.5 px-3 text-center">{renderCell(row.technician)}</td>
                        <td className="py-2.5 pl-3 text-center">{renderCell(row.foreman)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div>
          Prisma by AKME · Control de Accesos y Roles para Campañas de Perforación, Minería y Energía
        </div>
        <div className="font-mono"> Perfiles: Administrador · Cliente · Técnico · Capataz</div>
      </footer>
    </div>
  );
};
