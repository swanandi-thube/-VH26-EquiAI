/**
 * Main Application Bootstrapper
 * Initializes the Simulation Engine, Event Subscriptions, and UI Controller.
 */

import { SimulationEngine } from './core/simulation-engine.js';
import { UIController } from './ui/ui-controller.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Core Simulation Engine
  const simulationEngine = new SimulationEngine();

  // Initialize UI Controller
  const uiController = new UIController(simulationEngine);

  // Expose global app handle for interactive HTML onclick bindings
  window.app = {
    sim: simulationEngine,
    ui: uiController
  };

  // Start master simulation loop
  simulationEngine.start();

  console.log('🚀 Adaptive, Application-Aware Cache Management System initialized successfully.');
});
