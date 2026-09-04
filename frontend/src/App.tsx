/**
 * Main Application Component for ADAPTIVECACHE Platform (Warm Tech Theme)
 */

import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TelemetryProvider } from './context/TelemetryContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ExplainabilityDrawer } from './components/common/ExplainabilityDrawer';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { IntelligencePage } from './pages/IntelligencePage';
import { TrafficLabPage } from './pages/TrafficLabPage';
import { ProtectionPage } from './pages/ProtectionPage';
import { BenchmarkPage } from './pages/BenchmarkPage';
import { WhatIfPage } from './pages/WhatIfPage';
import { CostRoiPage } from './pages/CostRoiPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <TelemetryProvider>
      <Router>
        <div className="min-h-screen flex flex-col bg-dark-950 text-stone-100 selection:bg-amber-500/20 selection:text-amber-300">
          {/* Top Observability Header */}
          <Header />

          {/* Main Body with Sidebar and View Router */}
          <div className="flex flex-1 overflow-hidden">
            <Sidebar
              isCollapsed={isSidebarCollapsed}
              setIsCollapsed={setIsSidebarCollapsed}
            />

            <main className="flex-1 overflow-y-auto bg-dark-950">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/intelligence" element={<IntelligencePage />} />
                <Route path="/traffic-lab" element={<TrafficLabPage />} />
                <Route path="/protection" element={<ProtectionPage />} />
                <Route path="/benchmark" element={<BenchmarkPage />} />
                <Route path="/what-if" element={<WhatIfPage />} />
                <Route path="/cost-roi" element={<CostRoiPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </main>
          </div>

          {/* Global Decision Explainability Drawer / Modal */}
          <ExplainabilityDrawer />
        </div>
      </Router>
    </TelemetryProvider>
  );
};
