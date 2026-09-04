"""
User Data Import & Validation Pipeline
Parses and validates user-provided CSV and JSON datasets (custom catalogs, custom request traces), and ingests them into the active backend engine.
"""

import csv
import io
import json
from typing import Dict, Any, List, Tuple, Optional


class DataImporter:
    @staticmethod
    def parse_csv_items(csv_content: str) -> Tuple[bool, List[Dict[str, Any]], str]:
        """
        Parses CSV with expected columns: id, name, category, sizeBytes, baseDbLatencyMs, recomputeCostUnits, updateVolatility
        """
        try:
            reader = csv.DictReader(io.StringIO(csv_content.strip()))
            items = []
            
            for row_idx, row in enumerate(reader, start=1):
                if not row.get("id"):
                    return False, [], f"Row {row_idx}: Missing required 'id' field."

                item_id = str(row["id"]).strip()
                name = str(row.get("name", item_id)).strip()
                category = str(row.get("category", "Custom")).strip()
                
                try:
                    size_bytes = int(float(row.get("sizeBytes", 16384)))
                    base_db_latency = float(row.get("baseDbLatencyMs", 50.0))
                    recompute_cost = float(row.get("recomputeCostUnits", 1.0))
                    volatility = float(row.get("updateVolatility", 0.1))
                except ValueError as ve:
                    return False, [], f"Row {row_idx} ({item_id}): Invalid numeric value - {str(ve)}"

                if size_bytes <= 0:
                    return False, [], f"Row {row_idx}: 'sizeBytes' must be > 0."
                if base_db_latency < 0:
                    return False, [], f"Row {row_idx}: 'baseDbLatencyMs' cannot be negative."

                items.append({
                    "id": item_id,
                    "name": name,
                    "category": category,
                    "type": "CustomUserData",
                    "sizeBytes": size_bytes,
                    "baseDbLatencyMs": base_db_latency,
                    "recomputeCostUnits": recompute_cost,
                    "updateVolatility": min(1.0, max(0.0, volatility)),
                    "basePopularityTier": "CUSTOM"
                })

            if not items:
                return False, [], "CSV contains no data rows."

            return True, items, f"Successfully parsed and validated {len(items)} custom items."

        except Exception as e:
            return False, [], f"Malformed CSV error: {str(e)}"

    @staticmethod
    def parse_json_items(json_content: str) -> Tuple[bool, List[Dict[str, Any]], str]:
        """
        Parses JSON containing an array of objects or an object with 'items' key.
        """
        try:
            data = json.loads(json_content)
            raw_items = data.get("items", data) if isinstance(data, dict) else data

            if not isinstance(raw_items, list):
                return False, [], "JSON root must be an array of objects or contain an 'items' array."

            items = []
            for idx, raw in enumerate(raw_items, start=1):
                if not isinstance(raw, dict):
                    return False, [], f"Item #{idx} is not a valid JSON object."

                if not raw.get("id"):
                    return False, [], f"Item #{idx}: Missing required 'id' key."

                item_id = str(raw["id"]).strip()
                name = str(raw.get("name", item_id)).strip()
                category = str(raw.get("category", "Custom")).strip()

                try:
                    size_bytes = int(raw.get("sizeBytes", 16384))
                    base_db_latency = float(raw.get("baseDbLatencyMs", 50.0))
                    recompute_cost = float(raw.get("recomputeCostUnits", 1.0))
                    volatility = float(raw.get("updateVolatility", 0.1))
                except (ValueError, TypeError) as ve:
                    return False, [], f"Item #{idx} ({item_id}): Invalid numeric value - {str(ve)}"

                items.append({
                    "id": item_id,
                    "name": name,
                    "category": category,
                    "type": "CustomUserData",
                    "sizeBytes": max(512, size_bytes),
                    "baseDbLatencyMs": max(1.0, base_db_latency),
                    "recomputeCostUnits": max(0.1, recompute_cost),
                    "updateVolatility": min(1.0, max(0.0, volatility)),
                    "basePopularityTier": "CUSTOM"
                })

            if not items:
                return False, [], "JSON contains an empty item list."

            return True, items, f"Successfully parsed and validated {len(items)} custom items."

        except Exception as e:
            return False, [], f"Malformed JSON error: {str(e)}"
