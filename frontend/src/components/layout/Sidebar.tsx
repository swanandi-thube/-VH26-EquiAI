/**
 * Navigation Sidebar for ADAPTIVECACHE Platform
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Cpu,
  FlaskConical,
  ShieldCheck,
  Scale,
  Sliders,
  DollarSign,
  ListFilter,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useTelemetryContext } from '../../context/TelemetryContext';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, setIsCollapsed }) => {
  const { telemetry, isWorkloadRunning } = useTelemetryContext();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, badge: null },
    { name: 'Cache Intelligence', path: '/intelligence', icon: Cpu, badge: telemetry?.cachedObjectsCount ? `${telemetry.cachedObjectsCount}` : null },
    { name: 'Traffic Lab', path: '/traffic-lab', icon: FlaskConical, badge: isWorkloadRunning ? 'RUNNING' : null, badgeColor: 'bg-brand-cyan text-black font-bold' },
    { name: 'Backend Protection', path: '/protection', icon: ShieldCheck, badge: telemetry?.circuitBreakerState === 'CLOSED' ? 'SECURE' : telemetry?.circuitBreakerState, badgeColor: telemetry?.circuitBreakerState === 'CLOSED' ? 'text-brand-emerald bg-brand-emerald/10' : 'text-brand-amber bg-brand-amber/10' },
    { name: 'Benchmark', path: '/benchmark', icon: Scale, badge: 'FAIR' },
    { name: 'What-If Analysis', path: '/what-if', icon: Sliders, badge: null },
    { name: 'Cost & ROI', path: '/cost-roi', icon: DollarSign, badge: telemetry?.netSavingsPerHourUsd ? `$${telemetry.netSavingsPerHourUsd.toFixed(2)}/h` : null, badgeColor: 'text-brand-emerald bg-brand-emerald/10' },
    { name: 'Activity Stream', path: '/activity', icon: ListFilter, badge: 'LIVE' },
    { name: 'Settings', path: '/settings', icon: Settings, badge: null },
  ];

  return (
    <aside
      className={`bg-dark-900 border-r border-dark-750 flex flex-col justify-between transition-all duration-300 z-20 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-dark-800 text-brand-cyan border border-brand-cyan/20 shadow-md shadow-brand-cyan/5'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-dark-850'
              }`
            }
          >
            <item.icon className={`w-4 h-4 shrink-0 group-hover:scale-110 transition-transform ${isCollapsed ? 'mx-auto' : ''}`} />
            {!isCollapsed && (
              <div className="flex items-center justify-between flex-1 truncate">
                <span className="truncate">{item.name}</span>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                      item.badgeColor || 'bg-dark-750 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            )}
          </NavLink>
        ))}
      </div>

      {/* Collapse/Expand Toggle */}
      <div className="p-3 border-t border-dark-750 flex items-center justify-between">
        {!isCollapsed && (
          <div className="text-[11px] font-mono text-slate-400">
            <div>Mem: {(telemetry?.memoryUsedBytes ? (telemetry.memoryUsedBytes / (1024 * 1024)).toFixed(1) : '0')} MB</div>
            <div className="text-slate-400">State: <span className="text-brand-cyan">App-Aware</span></div>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-dark-800 rounded border border-dark-750 mx-auto transition-colors"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
