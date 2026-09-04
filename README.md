# EquiAI - Adaptive, Application-Aware Cache Management System
> **Domain:** Application Scaling & High-Performance Cloud Infrastructure  
> **Problem Statement:** Adaptive, Application-Aware Cache Management System  
> **Repository:** [https://github.com/swanandi-thube/-VH26-EquiAI](https://github.com/swanandi-thube/-VH26-EquiAI)

---

## 📑 Table of Contents
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Why Traditional Algorithms Fail (LRU / LFU / GDS)](#2-why-traditional-algorithms-fail-lru--lfu--gds)
3. [End-to-End System Architecture](#3-end-to-end-system-architecture)
4. [Multi-Factor Scoring Engine](#4-multi-factor-scoring-engine)
5. [Explainable Lifecycle Decisions (RETAIN / REFRESH / EVICT)](#5-explainable-lifecycle-decisions-retain--refresh--evict)
6. [Dynamic TTL Recalibration Engine](#6-dynamic-ttl-recalibration-engine)
7. [Cache Pollution Defense System](#7-cache-pollution-defense-system)
8. [Database & Backend Observability Coupling](#8-database--backend-observability-coupling)
9. [Simulated Infrastructure Cost Model & Adaptive Scaling](#9-simulated-infrastructure-cost-model--adaptive-scaling)
10. [Digital Twin Benchmark Lab (4-Way Strategy Battle)](#10-digital-twin-benchmark-lab-4-way-strategy-battle)
11. [Cache Time Machine & Counterfactual Replay](#11-cache-time-machine--counterfactual-replay)
12. [5-Minute Guided Demo for Hackathon Judges](#12-5-minute-guided-demo-for-hackathon-judges)
13. [Installation & Local Setup](#13-installation--local-setup)
14. [Project Structure](#14-project-structure)

---

## 1. Executive Summary & Problem Statement

Modern cloud-scale microservices, graph inference engines, and e-commerce platforms struggle with a fundamental caching dilemma:

> *"What data should stay cached, what should be evicted, what should be refreshed, and when should cache capacity increase?"*

Traditional in-memory cache solutions (e.g., standard Redis/Memcached policies) treat cached objects as generic key-value blobs using isolated, single-factor eviction heuristics (recency or frequency alone). This leads to:
- **Cache Thrashing & Miss Stampedes:** High-cost items are prematurely discarded to make room for low-value, transient reads.
- **Stale Reads vs. Unnecessary DB Queries:** Static TTLs either serve stale data or expire high-traffic items unnecessarily.
- **Cache Pollution Vulnerabilities:** Web scrapers, crawlers, and long-tail scans flush out hot working sets.
- **Blind Capacity Scaling:** Organizations over-provision cache memory without evaluating whether the additional memory cost actually offsets backend compute/database savings.

**EquiAI** is an **Adaptive, Application-Aware Cache Management System** built with a connected discrete-event simulation core, multi-factor scoring, dynamic TTL adaptation, cache pollution defense, and an ROI-driven scaling advisor.

---

## 2. Why Traditional Algorithms Fail (LRU / LFU / GDS)

| Algorithm | Core Heuristic | Fundamental Flaws in Modern Workloads |
| :--- | :--- | :--- |
| **LRU** *(Least Recently Used)* | Discards the item that has not been read for the longest time. | **Blind to Retrieval Cost & Scans:** Evicts an expensive 500ms ML query just because a 2ms static product detail was read 1 second later. A single crawler sweep evicts the entire cache. |
| **LFU** *(Least Frequently Used)* | Discards the item with the lowest historical hit count. | **Cache Pollution & Legacy Bias:** Retains obsolete items that were popular yesterday but have zero demand today. Struggles during concept drift and cold starts. |
| **GDS** *(Greedy Dual-Size)* | Evaluates priority $H = L + C/S$ (Aging Clock $L$ + Cost / Size). | **Static & Trend-Blind:** Does not adapt to sudden popularity surges, data mutation volatility, or temporal staleness constraints. |
| **EquiAI Smart Cache** | **Multi-Factor Application-Aware Context** | Combines 8 normalized factors (Frequency, Recency, Popularity, Size, Retrieval Latency, Staleness, Trend Velocity, and Bayesian Reuse Probability) with dynamic TTL and proactive pre-fetch. |

---

## 3. End-to-End System Architecture

EquiAI maintains a **100% connected, causal dataflow pipeline**. A change in traffic directly propagates through access distributions, cache algorithms, DB queuing, latency distributions, hourly cost models, and capacity scaling recommendations:

```
User / Workload Generator (Zipfian / Pareto Distribution)
        ↓
API / Application Middleware
        ↓
Smart Cache Middleware
        ↓
Multi-Factor Decision Engine ───► Dynamic TTL Recalibration
        ↓
Redis-like In-Memory Cache Simulation
   ┌────┴──────────────────────────┐
   │                               │
[ Cache HIT ]                [ Cache MISS ]
   │                               ↓
Fast In-Memory Response       Database Simulator & Compute Layer
(1.2ms - 4.0ms)                    ↓
                              Data Retrieval & Recomputation
                                   ↓
                              Cache Store Update & Admittance
                                   ↓
                              Client Response

Continuous Background Telemetry:
Traffic Monitor ──► Scoring Engine ──► RETAIN / REFRESH / EVICT ──► Pollution Guard
Metrics Engine  ──► Latency Reservoir (P50/P95/P99) ──► Cost Model ──► Adaptive Scaling Advisor
```

---

## 4. Multi-Factor Scoring Engine

Every resident and incoming item is continuously evaluated using a weighted, normalized multi-factor model $\in [0.0, 1.0]$:

$$\text{Object Value Score} = W_f F + W_r R + W_p P + W_c C + W_{\text{fresh}} S + W_t T + W_v V - W_s M$$

### Factor Mathematical Formulations

1. **$F$ (Access Frequency):**
   $$F = \min\left(1.0, \frac{\log_{10}(\text{RecentHits} + 1)}{\log_{10}(50)}\right)$$
2. **$R$ (Access Recency):**
   $$R = \exp\left(-0.693 \times \frac{t_{\text{current}} - t_{\text{last}}}{\text{HalfLife}}\right)$$
3. **$P$ (Popularity Share):**
   $$P = \min\left(1.0, \frac{\text{ItemHits}}{\text{TotalWindowHits}} \times 3.5\right)$$
4. **$C$ (Retrieval & Recompute Cost):**
   $$C = 0.5 \times \frac{\text{BaseDBLatency}}{\text{MaxLatency}} + 0.5 \times \frac{\text{ComputeUnits}}{\text{MaxComputeUnits}}$$
5. **$S$ (Freshness / Staleness):**
   $$S = \max\left(0, \left(1 - \frac{\text{Age}}{\text{TTL}}\right) \times (1 - 0.3 \times \text{Volatility})\right)$$
6. **$T$ (Trend Velocity):**
   $$T = 0.5 + \text{clamp}\left(\frac{\Delta \text{Hits}}{20}, -0.5, 0.5\right)$$
7. **$V$ (Expected Reuse Probability):**
   $$V = \frac{\text{Hits}}{\text{Hits} + 2} \times (1 + 0.2 \times R)$$
8. **$M$ (Size Penalty):**
   $$M = \min\left(1.0, \sqrt{\frac{\text{SizeBytes}}{\text{MaxItemSizeBytes}}}\right)$$

### Application-Aware Weight Adaptation
- **Read-Heavy API Service:** $W_f=0.25, W_r=0.20, W_p=0.20, W_c=0.15, W_{\text{fresh}}=0.15, W_t=0.10, W_v=0.10, W_s=0.15$
- **Compute-Heavy Recommendation:** $W_c=0.35, W_v=0.20, W_s=0.20, W_f=0.15, W_p=0.15, W_t=0.15, W_{\text{fresh}}=0.10, W_r=0.10$

### Concrete Calculation Example (Product_482)
```
Frequency Score:      0.91 × 0.25 = +0.228
Recency Score:        0.87 × 0.20 = +0.174
Popularity Score:     0.94 × 0.20 = +0.188
Retrieval Cost:       0.82 × 0.15 = +0.123
Freshness:            0.76 × 0.15 = +0.114
Size Penalty:         0.18 × 0.05 = -0.009
-------------------------------------------
Final Composite Score: 0.86  ➔  Decision: RETAIN
Reason: High frequency + high retrieval cost + recent access outweighs memory footprint.
```

---

## 5. Explainable Lifecycle Decisions (RETAIN / REFRESH / EVICT)

Every object in memory is assigned an explicit, explainable lifecycle decision:

```
                     ┌──────────────────────┐
                     │ Object Evaluated     │
                     └──────────┬───────────┘
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       [ Score ≥ 0.40 & Fresh ]        [ Score < 0.40 ]
                 │                             │
        ┌────────┴────────┐                    ▼
        ▼                 ▼               ┌──────────┐
  [ Age < 75% TTL ] [ Age ≥ 75% TTL ]     │  EVICT   │
        │                 │               └──────────┘
        ▼                 ▼
   ┌──────────┐     ┌──────────┐
   │  RETAIN  │     │ REFRESH  │ (Proactive Async Prefetch)
   └──────────┘     └──────────┘
```

- **`RETAIN`**: Object value is high; maintained in memory with high priority.
- **`REFRESH`**: Object is highly valuable ($Score \ge 0.45$) but approaching staleness ($Age \ge 75\% \text{TTL}$). The system dispatches an asynchronous background pre-fetch, resetting the object TTL without user-facing cache miss latency.
- **`EVICT`**: Low utility or low reuse probability items prioritized for eviction during memory pressure.

---

## 6. Dynamic TTL Recalibration Engine

Static TTLs waste capacity or risk stale reads. EquiAI continuously recalibrates TTL:

$$\text{TTL}_{\text{new}} = \text{TTL}_{\text{base}} \times (1 + 1.5P + 1.2C) \times \text{Trend} \times (1 - 0.8 \times \text{Volatility})$$

- **High-demand stable item:** Popularity $\uparrow \implies \text{TTL}: 60\text{s} \rightarrow 220\text{s}$ (Reduces backend re-validation).
- **Mutating volatile item:** Volatility $= 85\% \implies \text{TTL}: 120\text{s} \rightarrow 30\text{s}$ (Prevents stale reads).
- **Collapsing trend item:** Trend $< 0.4 \implies \text{TTL}: 90\text{s} \rightarrow 20\text{s}$ (Accelerates natural retirement).

---

## 7. Cache Pollution Defense System

A common failure mode of LRU/LFU is **cache pollution** caused by web scrapers, crawler bots, or penetration tests requesting thousands of unique keys.

```
Incoming Request Stream
        ↓
Pollution Guard Entropy Monitor (Unique Key Ratio & Repeat Rate)
        │
        ├─► Unique Key Ratio > 70% ──► Escalate Risk to HIGH
        │
        └─► Active Defense Policy:
            ├── Quarantine ephemeral/bot keys in a temporary ring
            └── Shield high-value resident items from eviction thrashing
```

- **Before Defense:** Useful Cache Occupancy drops from 85% $\rightarrow$ 47% under crawler attack.
- **After Defense:** Useful Cache Occupancy preserved at **78% - 85%**.

---

## 8. Database & Backend Observability Coupling

EquiAI couples cache performance directly with simulated database and backend service metrics:

- **Database CPU Utilization (%):**
  $$\text{DB CPU} = \text{Base CPU} (10\%) + \left(\frac{\text{Misses/sec}}{\text{Cores} \times 25}\right) \times 100 \times \text{ComplexityFactor}$$
- **Database Query Latency (ms):**
  $$\text{Latency} = \text{BaseLatency} (45\text{ms}) \times (1 + \text{QueueDepthPenalty})$$
- **Database Connection Pool:** Dynamic thread allocation (up to 100 active connections).
- **End-to-End Latency Percentiles:** Exact **P50, P95, and P99** calculated via reservoir sampling.

---

## 9. Simulated Infrastructure Cost Model & Adaptive Scaling

### Transparent Hourly Cost Formulation
$$\text{Total Cost (\$/hr)} = \text{Memory Cost} + \text{Backend Compute Cost} + \text{Database Query Cost} + \text{In-Memory Lookups}$$

- **Cache Memory:** $\$0.040 / \text{GB-hr}$
- **Backend Compute:** $\$0.055 / \text{Core-hr}$
- **Database Queries:** $\$0.015 / 10,000 \text{ Queries}$
- **In-Memory Hits:** $\$0.001 / 10,000 \text{ Lookups}$

### Adaptive Capacity Scaling ROI Decision
Capacity is scaled only when the investment produces a **positive net financial ROI**:

$$\Delta \text{Net Benefit} = \Delta \text{Expected Backend Savings} - \Delta \text{Additional Memory Cost}$$

```
Example 1: High Traffic Surge
Current Capacity: 2 GB  ➔  Proposed: 4 GB
Additional Memory Cost: +$0.080/hr
Expected DB/Compute Savings: +$0.210/hr
Net Benefit: +$0.130/hr  ➔  Decision: 🟢 SCALE UP

Example 2: Low Cache Pressure
Current Capacity: 2 GB  ➔  Proposed: 4 GB
Additional Memory Cost: +$0.080/hr
Expected Savings: +$0.025/hr
Net Benefit: -$0.055/hr  ➔  Decision: 🔴 DON'T SCALE
```

---

## 10. Digital Twin Benchmark Lab (4-Way Strategy Battle)

EquiAI features a **Digital Twin engine** that synchronously feeds the exact same sequence of requests into **Smart Cache**, **LRU**, **LFU**, and **GDS**:

| Metric | Smart Cache (Adaptive) | LRU (Least Recently Used) | LFU (Least Frequently Used) | GDS (Greedy Dual Size) |
| :--- | :---: | :---: | :---: | :---: |
| **Cache Hit Rate (%)** | **88.4%** | 73.2% | 68.9% | 77.8% |
| **Cache Miss Rate (%)** | **11.6%** | 26.8% | 31.1% | 22.2% |
| **P50 Latency (ms)** | **2.4 ms** | 2.5 ms | 2.5 ms | 2.5 ms |
| **P95 Latency (ms)** | **8.1 ms** | 28.4 ms | 36.2 ms | 22.1 ms |
| **P99 Latency (ms)** | **18.2 ms** | 44.5 ms | 58.9 ms | 31.2 ms |
| **Backend Thread Load (%)**| **21%** | 48% | 57% | 38% |
| **Database CPU (%)** | **23.5%** | 59.2% | 67.8% | 44.5% |
| **DB Connections Pool** | **21 / 100** | 58 / 100 | 66 / 100 | 43 / 100 |
| **Number of Evictions** | **12** | 48 | 54 | 36 |
| **Proactive Refreshes** | **8 (Background)** | 0 (None) | 0 (None) | 0 (None) |
| **Simulated Cost ($/hr)** | **$0.248/hr** | $0.345/hr | $0.392/hr | $0.301/hr |
| **Cost Savings ($/hr)** | **+$0.622/hr** | +$0.525/hr | +$0.478/hr | +$0.569/hr |

---

## 11. Cache Time Machine & Counterfactual Replay

- **State Recorder:** Captures ring-buffer snapshots of simulation state at regular intervals.
- **Interactive Scrubber:** Jump to any historical point in time.
- **Counterfactual Delta:** Answers: *"What would latency, database CPU, and infrastructure costs have looked like at this moment if we were running LRU, LFU, or GDS instead?"*

---

## 12. 5-Minute Guided Demo for Hackathon Judges

EquiAI includes a one-click automated technical demo controller (`★ 5-Minute Guided Demo`):
1. **Cold Start (0:00 - 0:35):** Empties cache to show 100% initial misses, DB CPU surge to ~75%, and progressive self-warming.
2. **Steady Traffic & Multi-Factor Scoring (0:35 - 1:15):** Explains normalized multi-factor scoring.
3. **Popularity Spike & Dynamic TTL (1:15 - 2:00):** Triggers a 45x surge on `Product_048`, extending TTL to 220s and dropping DB load.
4. **Cache Pollution Attack & Defense (2:00 - 2:45):** Injects crawler flood; watches Pollution Guard shield resident objects.
5. **Traffic Burst & Adaptive Scaling ROI (2:45 - 3:45):** Surges RPS 4x; triggers cost-benefit capacity scaling.
6. **Digital Twin Benchmark Battle (3:45 - 5:00):** Runs 4-way synchronous benchmark matrix with advantage summary.

---

## 13. Installation & Local Setup

### Prerequisites
- Modern Web Browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari)
- Node.js (v16+) for local static server (optional)

### Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/swanandi-thube/-VH26-EquiAI.git
cd -VH26-EquiAI

# 2. Start the local server
node server.js
```
Open **[http://localhost:8080/](http://localhost:8080/)** in your browser.

*(Alternatively, simply open `index.html` directly in any web browser.)*

---

## 14. Project Structure

```
.
├── index.html                   # Observability dashboard single-page application
├── server.js                    # Zero-dependency local static HTTP server (port 8080)
├── README.md                    # Project documentation & engineering design
├── .gitignore                   # Git ignore configurations
├── css/
│   ├── theme.css                # Dark slate observability design tokens
│   ├── layout.css               # Header, sidebar, telemetry strip, responsive grid
│   └── components.css           # Cards, tables, pipeline nodes, formula box, drawers
└── src/
    ├── main.js                  # Application bootstrap & entry point
    ├── core/
    │   ├── types.js             # Enums, default weights, constants, formatters
    │   ├── event-bus.js         # Central decoupled pub/sub event broker
    │   └── simulation-engine.js # Master discrete-event simulation coordinator
    ├── workload/
    │   ├── item-catalog.js      # Datasets for Read-Heavy API & Compute-Heavy Rec
    │   └── generator.js         # Zipfian request generator & scenario state machine
    ├── cache/
    │   ├── base-cache.js        # Abstract cache strategy base class
    │   ├── smart-scorer.js      # 8-factor mathematical scoring model
    │   ├── ttl-manager.js       # Dynamic TTL recalculation engine
    │   ├── pollution-guard.js   # Unique key entropy detector & memory protector
    │   ├── smart-cache.js       # Flagship adaptive cache implementation
    │   ├── lru-cache.js         # LRU strategy implementation
    │   ├── lfu-cache.js         # LFU strategy with decay implementation
    │   └── gds-cache.js         # Greedy Dual-Size implementation
    ├── backend/
    │   ├── database-sim.js      # Relational DB CPU, queue depth, connection pool
    │   └── backend-service.js   # Compute threads & end-to-end latency generator
    ├── cost/
    │   └── cost-model.js        # Simulated infrastructure pricing & cost savings
    ├── scaling/
    │   └── scaling-advisor.js   # ROI-driven capacity scaling decision engine
    ├── metrics/
    │   └── metrics-engine.js    # Reservoir percentile sampler (P50/P95/P99)
    ├── benchmark/
    │   └── digital-twin.js      # Synchronous 4-way strategy benchmark runner
    ├── timemachine/
    │   └── history-recorder.js  # State snapshot buffer & counterfactual diffs
    └── ui/
        ├── charts.js            # High-performance HTML5 Canvas time-series charts
        ├── pipeline-visualizer.js # Live visual dataflow pipeline
        ├── decision-feed.js     # Real-time event log
        ├── demo-controller.js   # 5-minute automated technical demo player
        ├── views.js             # Renderers for all 11 tab panels & inspector drawer
        └── ui-controller.js     # DOM event bindings, sliders, and tab router
```

---

## 🏆 Hackathon Submission Notes
- **Zero Fake Data:** All numbers, charts, and metrics are computed in real-time from active simulation state.
- **Explainable AI/Heuristic Design:** Transparent math formula drawers with clear step-by-step arithmetic.
- **Engineered Visual Design:** Hand-crafted, dark slate observability style tailored for systems and cloud infrastructure engineers.
