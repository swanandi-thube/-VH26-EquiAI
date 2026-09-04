/**
 * Activity Page - Real-Time Audit Event Stream
 * Live log of cache lifecycle actions, circuit-breaker transitions, and telemetry events.
 */

import React, { useState, useEffect } from 'react';
import {
  ListFilter,
  Zap,
  RefreshCw,
  Sparkles,
  Shield,
  Activity,
  AlertTriangle,
  Search,
  Clock,
  Layers
} from 'lucide-react';
import { apiClient } from '../api/client';
import { ActivityEvent, EventType } from '../types';

export const ActivityPage: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchEvents = async () => {
    try {
      const data = await apiClient.getEvents(150, selectedFilter);
      setEvents(data);
    } catch (err) {
      console.warn('Error loading activity stream:', err);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 2000);
    return () => clearInterval(interval);
  }, [selectedFilter]);

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      (e.objectId && e.objectId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      e.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.eventType.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getEventBadge = (type: EventType) => {
    switch (type) {
      case 'PRE-CACHE':
        return <span className="bg-amber-600/20 text-amber-300 border border-amber-600/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">PRE-CACHE</span>;
      case 'REFRESH':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">REFRESH</span>;
      case 'EVICT':
        return <span className="bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">EVICT</span>;
      case 'CIRCUIT-BREAKER':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">CIRCUIT-BREAKER</span>;
      case 'RATE-LIMIT':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">RATE-LIMIT</span>;
      case 'BACKEND-ERROR':
        return <span className="bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">BACKEND-ERROR</span>;
      case 'KEEP':
      default:
        return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">KEEP</span>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-amber-400" />
            Activity Audit Stream
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Immutable timeline of dynamic decisions, circuit breaker state shifts, and cache lifecycle events
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search event logs..."
              className="bg-dark-850 border border-dark-750 rounded-lg pl-8 pr-3 py-1 text-xs text-stone-200 font-mono focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <button
            onClick={fetchEvents}
            className="flex items-center gap-1.5 px-3 py-1 bg-dark-850 hover:bg-dark-800 border border-dark-750 text-stone-200 text-xs font-mono rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
        {['ALL', 'KEEP', 'REFRESH', 'EVICT', 'PRE-CACHE', 'CIRCUIT-BREAKER', 'RATE-LIMIT', 'BACKEND-ERROR'].map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedFilter(filter)}
            className={`px-3 py-1 rounded-lg border transition-all shrink-0 cursor-pointer ${
              selectedFilter === filter
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 border-amber-500 font-bold shadow-sm'
                : 'bg-dark-850 border-dark-750 text-stone-400 hover:text-stone-200 hover:border-dark-700'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Event Stream Log */}
      <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-dark-750">
          <span className="font-bold text-stone-200 uppercase tracking-wider text-xs">
            Live Stream Feed ({filteredEvents.length} events)
          </span>
          <span className="text-[10px] text-stone-400">Streamed from backend audit log</span>
        </div>

        <div className="divide-y divide-dark-800">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((evt) => (
              <div key={evt.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-dark-850/60 px-2 rounded transition-colors">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    {getEventBadge(evt.eventType)}
                    {evt.objectId && (
                      <span className="font-bold text-stone-100">{evt.objectId}</span>
                    )}
                    {evt.score !== undefined && (
                      <span className="text-[10px] text-amber-400">Score: {evt.score.toFixed(2)}</span>
                    )}
                  </div>
                  <p className="text-stone-300 text-[11px] font-sans">{evt.reason}</p>
                </div>

                <div className="text-right shrink-0 text-stone-400 text-[10px]">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-stone-400">
              No activity events found. Trigger requests in Traffic Lab to populate the live stream.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
