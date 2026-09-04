"use strict";
/**
 * Change Detector Engine (Phase 5 Time-Series Analysis & Multi-Window Change Detection)
 * Detects DEMAND_SPIKE, DEMAND_DECLINE, STABLE_DEMAND, INCREASING_TREND, DECREASING_TREND
 * and calculates dynamic multi-window deltas (ΔD, ΔF, ΔPrice, ΔL).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeDetector = exports.ChangeDetector = void 0;
const repositories_1 = require("../repositories");
class ChangeDetector {
    /**
     * Analyze observation history and return pattern classification, deltas, and recommended lifecycle actions
     */
    analyze(objectId, currentObs, history = []) {
        const timestamp = currentObs.timestamp || Date.now();
        const currentDemand = currentObs.demand;
        // Filter and sort history ascending by timestamp
        const sortedHistory = [...history]
            .filter(h => h.objectId === objectId && h.timestamp <= timestamp)
            .sort((a, b) => a.timestamp - b.timestamp);
        // If history does not include currentObs at the end, append it
        if (sortedHistory.length === 0 ||
            sortedHistory[sortedHistory.length - 1].timestamp !== currentObs.timestamp) {
            sortedHistory.push(currentObs);
        }
        const sampleWindows = sortedHistory.length;
        const historySummary = sortedHistory.map(h => Math.round(h.demand * 100) / 100);
        if (sampleWindows <= 1) {
            // Single observation - default to stable
            return {
                objectId,
                timestamp,
                currentDemand,
                previousDemand: currentDemand,
                demandChange: 0,
                frequencyChange: 0,
                priceChange: 0,
                latencyChange: 0,
                detectedPattern: 'STABLE_DEMAND',
                trendVelocity: 0,
                sampleWindows: 1,
                historySummary,
                recommendedDecision: 'KEEP',
                recommendedTtlSeconds: 300,
            };
        }
        // Previous point and baseline
        const prevObs = sortedHistory[sortedHistory.length - 2];
        const previousDemand = prevObs.demand;
        // 1. Calculate Deltas
        // ΔD: Demand change percentage
        const demandChange = previousDemand > 0
            ? (currentDemand - previousDemand) / previousDemand
            : (currentDemand > 0 ? 1.0 : 0);
        // ΔF: Request frequency / count change percentage
        const prevCount = prevObs.requestCount || 1;
        const currCount = currentObs.requestCount || 1;
        const frequencyChange = prevCount > 0
            ? (currCount - prevCount) / prevCount
            : 0;
        // ΔP: Contextual price change percentage (contextual only, does NOT automatically dictate cache priority)
        let priceChange = 0;
        if (currentObs.price !== undefined &&
            currentObs.price !== null &&
            prevObs.price !== undefined &&
            prevObs.price !== null &&
            prevObs.price > 0) {
            priceChange = (currentObs.price - prevObs.price) / prevObs.price;
        }
        // ΔL: Backend latency change percentage
        const prevLat = prevObs.backendLatencyMs || 50;
        const currLat = currentObs.backendLatencyMs || 50;
        const latencyChange = prevLat > 0 ? (currLat - prevLat) / prevLat : 0;
        // 2. Trend Slope / Velocity across all available history points
        let trendSlope = 0;
        const n = sortedHistory.length;
        let sumY = 0;
        if (sampleWindows >= 2) {
            // Linear slope estimation across windows
            let sumX = 0;
            let sumXY = 0;
            let sumXX = 0;
            for (let i = 0; i < n; i++) {
                const x = i;
                const y = sortedHistory[i].demand;
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumXX += x * x;
            }
            const denominator = (n * sumXX) - (sumX * sumX);
            trendSlope = denominator !== 0 ? ((n * sumXY) - (sumX * sumY)) / denominator : 0;
        }
        // Normalized acceleration velocity (% slope per step)
        const avgDemand = sumY > 0 && n > 0 ? sumY / n : (currentDemand || 1);
        const normalizedTrendSlope = avgDemand > 0 ? trendSlope / avgDemand : 0;
        const trendVelocity = Math.round(normalizedTrendSlope * 100) / 100;
        // 3. Pattern Detection Classification
        let detectedPattern = 'STABLE_DEMAND';
        const isMonotonicallyIncreasing = sortedHistory.length >= 3 && sortedHistory.every((val, i, arr) => {
            return i === 0 || val.demand >= arr[i - 1].demand;
        }) && sortedHistory[sortedHistory.length - 1].demand > sortedHistory[0].demand;
        const isMonotonicallyDecreasing = sortedHistory.length >= 3 && sortedHistory.every((val, i, arr) => {
            return i === 0 || val.demand <= arr[i - 1].demand;
        }) && sortedHistory[sortedHistory.length - 1].demand < sortedHistory[0].demand;
        // Check for acute spike (>= +100% jump or massive surge relative to baseline)
        const baselineDemand = sortedHistory[0].demand;
        const totalGrowthRatio = baselineDemand > 0 ? (currentDemand - baselineDemand) / baselineDemand : 0;
        if (demandChange >= 1.0 || (totalGrowthRatio >= 2.0 && demandChange > 0.5)) {
            detectedPattern = 'DEMAND_SPIKE';
        }
        else if (demandChange <= -0.50 || (totalGrowthRatio <= -0.6 && demandChange < -0.3)) {
            detectedPattern = 'DEMAND_DECLINE';
        }
        else if (isMonotonicallyIncreasing || demandChange >= 0.25 || normalizedTrendSlope > 0.15) {
            detectedPattern = 'INCREASING_TREND';
        }
        else if (isMonotonicallyDecreasing || demandChange <= -0.20 || normalizedTrendSlope < -0.15) {
            detectedPattern = 'DECREASING_TREND';
        }
        else {
            detectedPattern = 'STABLE_DEMAND';
        }
        // 4. Dynamic Recommended Decision & TTL Scaling
        let recommendedDecision = 'KEEP';
        let ttlMultiplier = 1.0;
        switch (detectedPattern) {
            case 'DEMAND_SPIKE':
                recommendedDecision = 'PRE-CACHE';
                ttlMultiplier = 2.5; // Proactively hold in cache during surge
                break;
            case 'INCREASING_TREND':
                recommendedDecision = currentObs.retrievalCostMs > 100 ? 'PRE-CACHE' : 'KEEP';
                ttlMultiplier = 1.6;
                break;
            case 'DEMAND_DECLINE':
                recommendedDecision = currentDemand < 10 ? 'EVICT' : 'KEEP';
                ttlMultiplier = 0.5; // Reduce TTL to accelerate phase out
                break;
            case 'DECREASING_TREND':
                recommendedDecision = currentDemand < 5 ? 'EVICT' : 'KEEP';
                ttlMultiplier = 0.7;
                break;
            case 'STABLE_DEMAND':
            default:
                recommendedDecision = 'KEEP';
                ttlMultiplier = 1.0;
                break;
        }
        const baseTtl = 300;
        const recommendedTtlSeconds = Math.max(30, Math.min(3600, Math.round(baseTtl * ttlMultiplier)));
        return {
            objectId,
            timestamp,
            currentDemand: Math.round(currentDemand * 100) / 100,
            previousDemand: Math.round(previousDemand * 100) / 100,
            demandChange: Math.round(demandChange * 1000) / 1000,
            frequencyChange: Math.round(frequencyChange * 1000) / 1000,
            priceChange: Math.round(priceChange * 1000) / 1000,
            latencyChange: Math.round(latencyChange * 1000) / 1000,
            detectedPattern,
            trendVelocity,
            sampleWindows,
            historySummary,
            recommendedDecision,
            recommendedTtlSeconds,
        };
    }
    /**
     * Analyze an object by retrieving its observation history from the repository
     */
    async analyzeFromRepository(objectId, currentObs) {
        const history = await repositories_1.observationRepository.getRecentObservations(objectId, 50);
        // history is returned newest first from repo, so reverse to chronological order
        const chronologicalHistory = [...history].reverse();
        if (!currentObs && chronologicalHistory.length > 0) {
            const latest = chronologicalHistory[chronologicalHistory.length - 1];
            const previous = chronologicalHistory.slice(0, chronologicalHistory.length - 1);
            return this.analyze(objectId, latest, previous);
        }
        const targetObs = currentObs || {
            objectId,
            timestamp: Date.now(),
            requestCount: 1,
            demand: 1.0,
            backendLatencyMs: 50,
            retrievalCostMs: 50,
            responseSizeBytes: 1024,
        };
        return this.analyze(objectId, targetObs, chronologicalHistory);
    }
}
exports.ChangeDetector = ChangeDetector;
exports.changeDetector = new ChangeDetector();
