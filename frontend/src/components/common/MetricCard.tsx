/**
 * High-Density Metric Card Component
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: string | number;
    isPositive: boolean;
    label?: string;
  };
  badge?: string;
  badgeColor?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon: Icon,
  iconColor = 'text-brand-cyan',
  trend,
  badge,
  badgeColor = 'bg-dark-750 text-slate-300',
}) => {
  return (
    <div className="bg-dark-900 border border-dark-750 hover:border-dark-700 rounded-xl p-4 transition-all shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-dark-850 border border-dark-750">
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
        </div>
        {badge && (
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border border-white/5 ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl font-bold font-mono text-white tracking-tight">{value}</span>
        {unit && <span className="text-xs font-mono text-slate-400 font-medium">{unit}</span>}
      </div>

      {(subtitle || trend) && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-800 text-[11px]">
          {subtitle && <span className="text-slate-400 truncate">{subtitle}</span>}
          {trend && (
            <span
              className={`font-mono font-semibold ml-auto flex items-center gap-0.5 ${
                trend.isPositive ? 'text-brand-emerald' : 'text-brand-rose'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value}
              {trend.label && <span className="text-slate-400 font-normal ml-1">{trend.label}</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
