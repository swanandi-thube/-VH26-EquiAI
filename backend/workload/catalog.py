"""
Item Catalog & Data Profiles
Generates realistic cacheable objects for Read-Heavy API & Compute-Heavy Recommendation workloads.
"""

from typing import Dict, Any, List, Optional
from backend.core.types import WorkloadType


class ItemCatalog:
    def __init__(self):
        self.read_heavy_catalog = self._generate_read_heavy_catalog(120)
        self.compute_heavy_catalog = self._generate_compute_heavy_catalog(80)

    def _generate_read_heavy_catalog(self, count: int) -> List[Dict[str, Any]]:
        categories = ['Electronics', 'Footwear', 'Apparel', 'Home Goods', 'Books', 'Groceries']
        items = []

        for i in range(1, count + 1):
            cat = categories[i % len(categories)]
            is_large_media = (i % 8 == 0)
            is_hot_config = (i % 15 == 0)

            # Sizes: 16KB to 8MB
            if is_large_media:
                size_bytes = int((3.5 + (i % 5)) * 1024 * 1024)
            elif is_hot_config:
                size_bytes = 8 * 1024
            else:
                size_bytes = int((16 + (i * 19) % 256) * 1024)

            # Latency & compute
            base_db_latency_ms = 25.0 + (i * 7) % 110 + (45.0 if is_large_media else 0.0)
            recompute_cost_units = 1.0 + (i % 10) * 0.4
            update_volatility = 0.85 if (i % 7 == 0) else (0.35 if (i % 3 == 0) else 0.08)

            items.append({
                "id": f"prod_{str(i).zfill(3)}",
                "name": f"Product_{i} ({cat})",
                "category": cat,
                "type": "MediaPayload" if is_large_media else ("ConfigMeta" if is_hot_config else "ProductDetail"),
                "sizeBytes": size_bytes,
                "baseDbLatencyMs": float(base_db_latency_ms),
                "recomputeCostUnits": float(recompute_cost_units),
                "updateVolatility": float(update_volatility),
                "basePopularityTier": "VIP_HOT" if i <= 10 else ("WARM" if i <= 35 else "COLD_TAIL")
            })

        return items

    def _generate_compute_heavy_catalog(self, count: int) -> List[Dict[str, Any]]:
        models = ['GraphRec_v3', 'BERT_Embed', 'RankVector_x4', 'DeepCross_Collab', 'SessionRNN']
        items = []

        for i in range(1, count + 1):
            model = models[i % len(models)]
            is_deep_model = (i % 4 == 0)

            # Sizes: 1.2MB to 26MB
            if is_deep_model:
                size_bytes = int((14 + (i % 12)) * 1024 * 1024)
            else:
                size_bytes = int((1.2 + (i % 5)) * 1024 * 1024)

            base_db_latency_ms = 160.0 + (i * 13) % 420
            recompute_cost_units = (28.0 + (i % 15) * 1.5) if is_deep_model else (8.5 + (i % 8) * 1.2)
            update_volatility = 0.65 if (i % 5 == 0) else 0.12

            items.append({
                "id": f"rec_model_{str(i).zfill(3)}",
                "name": f"RecItem_{i} [{model}]",
                "category": "ML_INFERENCE",
                "type": "NeuralMatrixSlice" if is_deep_model else "EmbeddingVector",
                "sizeBytes": size_bytes,
                "baseDbLatencyMs": float(base_db_latency_ms),
                "recomputeCostUnits": float(recompute_cost_units),
                "updateVolatility": float(update_volatility),
                "basePopularityTier": "VIP_HOT" if i <= 6 else ("WARM" if i <= 22 else "COLD_TAIL")
            })

        return items

    def get_catalog(self, workload_type: WorkloadType) -> List[Dict[str, Any]]:
        if workload_type == WorkloadType.COMPUTE_HEAVY_REC:
            return self.compute_heavy_catalog
        return self.read_heavy_catalog

    def get_item(self, workload_type: WorkloadType, id: str) -> Optional[Dict[str, Any]]:
        cat = self.get_catalog(workload_type)
        for item in cat:
            if item["id"] == id:
                return item
        return None
