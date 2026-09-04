/**
 * Item Catalog & Data Profiles
 * Generates realistic cacheable objects for Read-Heavy API & Compute-Heavy Recommendation workloads
 */

import { WORKLOAD_TYPES } from '../core/types.js';

export class ItemCatalog {
  constructor() {
    this.readHeavyCatalog = this.generateReadHeavyCatalog(120);
    this.computeHeavyCatalog = this.generateComputeHeavyCatalog(80);
  }

  generateReadHeavyCatalog(count) {
    const categories = ['Electronics', 'Footwear', 'Apparel', 'Home Goods', 'Books', 'Groceries'];
    const items = [];

    for (let i = 1; i <= count; i++) {
      const cat = categories[i % categories.length];
      const isLargeMedia = i % 8 === 0;
      const isHotConfig = i % 15 === 0;
      
      // Sizes: 16KB to 8MB
      let sizeBytes = isLargeMedia ? (3.5 + (i % 5)) * 1024 * 1024 : (16 + (i * 19) % 256) * 1024;
      if (isHotConfig) sizeBytes = 8 * 1024;

      // Base DB retrieval cost & latency
      const baseDbLatencyMs = 25 + (i * 7) % 110 + (isLargeMedia ? 45 : 0);
      const recomputeCostUnits = 1.0 + (i % 10) * 0.4;
      const updateVolatility = (i % 7 === 0) ? 0.85 : (i % 3 === 0 ? 0.35 : 0.08); // high vs stable

      items.push({
        id: `prod_${String(i).padStart(3, '0')}`,
        name: `Product_${i} (${cat})`,
        category: cat,
        type: isLargeMedia ? 'MediaPayload' : (isHotConfig ? 'ConfigMeta' : 'ProductDetail'),
        sizeBytes: Math.round(sizeBytes),
        baseDbLatencyMs,
        recomputeCostUnits,
        updateVolatility,
        basePopularityTier: i <= 10 ? 'VIP_HOT' : (i <= 35 ? 'WARM' : 'COLD_TAIL')
      });
    }
    return items;
  }

  generateComputeHeavyCatalog(count) {
    const models = ['GraphRec_v3', 'BERT_Embed', 'RankVector_x4', 'DeepCross_Collab', 'SessionRNN'];
    const items = [];

    for (let i = 1; i <= count; i++) {
      const model = models[i % models.length];
      const isDeepModel = i % 4 === 0;

      // Sizes: 256KB to 32MB
      const sizeBytes = (isDeepModel ? 14 + (i % 12) : 1.2 + (i % 5)) * 1024 * 1024;
      const baseDbLatencyMs = 160 + (i * 13) % 420;
      const recomputeCostUnits = isDeepModel ? 28.0 + (i % 15) * 1.5 : 8.5 + (i % 8) * 1.2;
      const updateVolatility = (i % 5 === 0) ? 0.65 : 0.12;

      items.push({
        id: `rec_model_${String(i).padStart(3, '0')}`,
        name: `RecItem_${i} [${model}]`,
        category: 'ML_INFERENCE',
        type: isDeepModel ? 'NeuralMatrixSlice' : 'EmbeddingVector',
        sizeBytes: Math.round(sizeBytes),
        baseDbLatencyMs,
        recomputeCostUnits,
        updateVolatility,
        basePopularityTier: i <= 6 ? 'VIP_HOT' : (i <= 22 ? 'WARM' : 'COLD_TAIL')
      });
    }
    return items;
  }

  getCatalog(workloadType) {
    return workloadType === WORKLOAD_TYPES.COMPUTE_HEAVY_REC
      ? this.computeHeavyCatalog
      : this.readHeavyCatalog;
  }

  getItem(workloadType, id) {
    const cat = this.getCatalog(workloadType);
    return cat.find(item => item.id === id) || null;
  }
}
