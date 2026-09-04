"use strict";
/**
 * Real Workload Ingestion Service for ADAPTIVECACHE
 * Ingests, parses, and validates CSV and JSON workload traces.
 * Preserves historical workload runs in PostgreSQL / repository without synthetic benchmark bias.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workloadIngestionService = exports.WorkloadIngestionService = void 0;
const uuid_1 = require("uuid");
const workloadRepository_1 = require("../repositories/workloadRepository");
class WorkloadIngestionService {
    /**
     * Main ingestion method for uploaded file buffer or raw text
     */
    async ingestFile(filename, buffer, fileSizeBytes) {
        const content = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
        const sizeBytes = fileSizeBytes !== undefined
            ? fileSizeBytes
            : (typeof buffer === 'string' ? Buffer.byteLength(buffer, 'utf8') : buffer.length);
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const isJson = ext === 'json' || content.trim().startsWith('[') || content.trim().startsWith('{');
        const isCsv = ext === 'csv' || (!isJson && content.includes(','));
        const workloadId = `WL-${(0, uuid_1.v4)().substring(0, 8)}`;
        const uploadedAt = Date.now();
        if (!content || content.trim().length === 0) {
            const summary = {
                workloadId,
                filename,
                fileType: isJson ? 'JSON' : 'CSV',
                fileSizeBytes: sizeBytes,
                totalRows: 0,
                validRows: 0,
                rejectedRows: 0,
                uniqueObjects: 0,
                timeRange: { start: uploadedAt, end: uploadedAt, durationSeconds: 0 },
                status: 'FAILED',
                validationErrors: [{ row: 0, error: 'Empty file: no data rows found' }],
                uploadedAt,
            };
            await workloadRepository_1.workloadRepository.saveWorkloadRun(summary, []);
            return { summary, requests: [] };
        }
        let parsedResult;
        if (isJson) {
            parsedResult = this.parseJsonWorkload(content);
        }
        else {
            parsedResult = this.parseCsvWorkload(content);
        }
        const { requests, errors, totalRows } = parsedResult;
        // Calculate unique objects and time range
        const uniqueObjectsSet = new Set();
        let minTime = Number.MAX_SAFE_INTEGER;
        let maxTime = 0;
        for (const req of requests) {
            uniqueObjectsSet.add(req.objectId);
            if (req.timestamp < minTime)
                minTime = req.timestamp;
            if (req.timestamp > maxTime)
                maxTime = req.timestamp;
        }
        if (requests.length === 0) {
            minTime = uploadedAt;
            maxTime = uploadedAt;
        }
        const durationSeconds = Math.max(0, Math.round((maxTime - minTime) / 1000));
        const status = requests.length > 0 ? 'VALIDATED' : 'FAILED';
        const summary = {
            workloadId,
            filename,
            fileType: isJson ? 'JSON' : 'CSV',
            fileSizeBytes: sizeBytes,
            totalRows,
            validRows: requests.length,
            rejectedRows: errors.length,
            uniqueObjects: uniqueObjectsSet.size,
            timeRange: {
                start: minTime === Number.MAX_SAFE_INTEGER ? uploadedAt : minTime,
                end: maxTime === 0 ? uploadedAt : maxTime,
                durationSeconds,
            },
            status,
            validationErrors: errors,
            uploadedAt,
        };
        // Store in repository (PostgreSQL & memory store)
        await workloadRepository_1.workloadRepository.saveWorkloadRun(summary, requests);
        return {
            summary,
            requests,
        };
    }
    /**
     * Parse CSV content and validate every row
     */
    parseCsvWorkload(content) {
        const lines = content
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        if (lines.length === 0) {
            return {
                requests: [],
                errors: [{ row: 0, error: 'Empty CSV file: no headers or rows found' }],
                totalRows: 0,
            };
        }
        const headerLine = lines[0];
        const rawHeaders = this.splitCsvRow(headerLine);
        const headers = rawHeaders.map((h) => this.normalizeFieldName(h));
        // Required fields check in header
        const requiredCanonical = [
            'timestamp',
            'request_id',
            'object_id',
            'operation',
            'response_size',
            'backend_latency',
            'regeneration_cost',
            'status_code',
        ];
        const missingHeaders = requiredCanonical.filter((req) => !headers.includes(req));
        if (missingHeaders.length > 0 && headers.length < 8) {
            return {
                requests: [],
                errors: [
                    {
                        row: 1,
                        error: `CSV header missing required columns: ${missingHeaders.join(', ')}`,
                    },
                ],
                totalRows: 0,
            };
        }
        const requests = [];
        const errors = [];
        const dataLines = lines.slice(1);
        for (let i = 0; i < dataLines.length; i++) {
            const rowNumber = i + 2; // 1-indexed including header
            const line = dataLines[i];
            const values = this.splitCsvRow(line);
            const rowObj = {};
            for (let c = 0; c < headers.length; c++) {
                const key = headers[c];
                if (key && c < values.length) {
                    rowObj[key] = values[c];
                }
            }
            const validation = this.validateAndTransformRow(rowObj, rowNumber);
            if (validation.valid && validation.record) {
                requests.push(validation.record);
            }
            else {
                errors.push({
                    row: rowNumber,
                    error: validation.error || 'Malformed row structure',
                    raw: line,
                });
            }
        }
        return {
            requests,
            errors,
            totalRows: dataLines.length,
        };
    }
    /**
     * Parse JSON content (array or object containing array)
     */
    parseJsonWorkload(content) {
        let rawData;
        try {
            rawData = JSON.parse(content);
        }
        catch (err) {
            return {
                requests: [],
                errors: [{ row: 0, error: `Invalid JSON syntax: ${err.message}` }],
                totalRows: 0,
            };
        }
        let items = [];
        if (Array.isArray(rawData)) {
            items = rawData;
        }
        else if (rawData && typeof rawData === 'object') {
            if (Array.isArray(rawData.requests)) {
                items = rawData.requests;
            }
            else if (Array.isArray(rawData.workload)) {
                items = rawData.workload;
            }
            else if (Array.isArray(rawData.data)) {
                items = rawData.data;
            }
            else {
                items = [rawData];
            }
        }
        if (items.length === 0) {
            return {
                requests: [],
                errors: [{ row: 0, error: 'Empty JSON array: no request objects found' }],
                totalRows: 0,
            };
        }
        const requests = [];
        const errors = [];
        for (let i = 0; i < items.length; i++) {
            const rowNumber = i + 1;
            const rawItem = items[i];
            if (!rawItem || typeof rawItem !== 'object') {
                errors.push({
                    row: rowNumber,
                    error: 'Expected JSON object for workload item',
                    raw: rawItem,
                });
                continue;
            }
            // Normalize object keys to canonical snake_case
            const normalizedObj = {};
            for (const [k, v] of Object.entries(rawItem)) {
                normalizedObj[this.normalizeFieldName(k)] = v;
            }
            const validation = this.validateAndTransformRow(normalizedObj, rowNumber);
            if (validation.valid && validation.record) {
                requests.push(validation.record);
            }
            else {
                errors.push({
                    row: rowNumber,
                    error: validation.error || 'Malformed item structure',
                    raw: rawItem,
                });
            }
        }
        return {
            requests,
            errors,
            totalRows: items.length,
        };
    }
    /**
     * Validate and transform a single workload row
     */
    validateAndTransformRow(row, rowNumber) {
        // 1. Timestamp validation
        const rawTimestamp = row.timestamp ?? row.time ?? row.ts ?? row.timestamp_ms;
        if (rawTimestamp === undefined || rawTimestamp === null || rawTimestamp === '') {
            return { valid: false, error: `Row ${rowNumber}: Missing required field 'timestamp'` };
        }
        let parsedTimestamp;
        if (typeof rawTimestamp === 'number') {
            parsedTimestamp = rawTimestamp < 1e11 ? rawTimestamp * 1000 : rawTimestamp;
        }
        else {
            const num = Number(rawTimestamp);
            if (!isNaN(num) && rawTimestamp.toString().trim().length > 0) {
                parsedTimestamp = num < 1e11 ? num * 1000 : num;
            }
            else {
                const d = new Date(rawTimestamp);
                parsedTimestamp = d.getTime();
            }
        }
        if (isNaN(parsedTimestamp) || parsedTimestamp <= 0) {
            return {
                valid: false,
                error: `Row ${rowNumber}: Invalid timestamp '${rawTimestamp}'. Must be ISO-8601 string or numeric epoch.`,
            };
        }
        // 2. Request ID validation
        const requestId = (row.request_id ?? row.requestid ?? row.id ?? `REQ-${rowNumber}`).toString().trim();
        if (!requestId) {
            return { valid: false, error: `Row ${rowNumber}: Missing required field 'request_id'` };
        }
        // 3. Object ID validation
        const objectId = (row.object_id ?? row.objectid ?? row.key ?? row.resource_id ?? '').toString().trim();
        if (!objectId) {
            return { valid: false, error: `Row ${rowNumber}: Missing required field 'object_id'` };
        }
        // 4. Operation validation
        const operation = (row.operation ?? row.op ?? row.method ?? 'GET').toString().toUpperCase().trim();
        if (!operation) {
            return { valid: false, error: `Row ${rowNumber}: Missing required field 'operation'` };
        }
        // 5. Response Size validation
        const rawSize = row.response_size ?? row.response_size_bytes ?? row.responsesize ?? row.size_bytes ?? row.size;
        const responseSizeBytes = this.parseNonNegativeNumber(rawSize);
        if (responseSizeBytes === null) {
            return {
                valid: false,
                error: `Row ${rowNumber}: Invalid numeric value for 'response_size' (got '${rawSize}')`,
            };
        }
        // 6. Backend Latency validation
        const rawLatency = row.backend_latency ?? row.backend_latency_ms ?? row.backendlatency ?? row.latency_ms ?? row.latency;
        const backendLatencyMs = this.parseNonNegativeNumber(rawLatency);
        if (backendLatencyMs === null) {
            return {
                valid: false,
                error: `Row ${rowNumber}: Invalid numeric value for 'backend_latency' (got '${rawLatency}')`,
            };
        }
        // 7. Regeneration Cost validation
        const rawCost = row.regeneration_cost ?? row.regeneration_cost_ms ?? row.regenerationcost ?? row.cost_ms ?? row.retrieval_cost;
        const regenerationCostMs = this.parseNonNegativeNumber(rawCost !== undefined ? rawCost : backendLatencyMs);
        if (regenerationCostMs === null) {
            return {
                valid: false,
                error: `Row ${rowNumber}: Invalid numeric value for 'regeneration_cost' (got '${rawCost}')`,
            };
        }
        // 8. Status Code validation
        const rawStatus = row.status_code ?? row.statuscode ?? row.status ?? 200;
        const statusCode = parseInt(rawStatus, 10);
        if (isNaN(statusCode) || statusCode < 100 || statusCode > 599) {
            return {
                valid: false,
                error: `Row ${rowNumber}: Invalid HTTP status_code '${rawStatus}'. Must be between 100 and 599.`,
            };
        }
        // Optional Fields
        const ttl = row.ttl !== undefined && row.ttl !== null && row.ttl !== '' ? parseInt(row.ttl, 10) : null;
        const contentType = (row.content_type ?? row.contenttype ?? null)?.toString().trim() || null;
        const priority = row.priority !== undefined && row.priority !== null && row.priority !== '' ? parseInt(row.priority, 10) : null;
        const region = (row.region ?? null)?.toString().trim() || null;
        const record = {
            requestId,
            timestamp: Math.round(parsedTimestamp),
            objectId,
            operation,
            responseSizeBytes,
            backendLatencyMs,
            regenerationCostMs,
            statusCode,
            ttl: ttl !== null && !isNaN(ttl) ? ttl : null,
            contentType,
            priority: priority !== null && !isNaN(priority) ? priority : null,
            region,
        };
        return { valid: true, record };
    }
    /**
     * Helper to normalize header and property keys
     */
    normalizeFieldName(name) {
        return name
            .replace(/^[\uFEFF\xA0]+/, '') // strip BOM
            .trim()
            .toLowerCase()
            .replace(/[-\s]/g, '_');
    }
    /**
     * Parse non-negative number
     */
    parseNonNegativeNumber(val) {
        if (val === undefined || val === null || val === '')
            return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0)
            return null;
        return Math.round(num);
    }
    /**
     * Safe CSV line splitter supporting quoted strings
     */
    splitCsvRow(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // skip escaped quote
                }
                else {
                    inQuotes = !inQuotes;
                }
            }
            else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            }
            else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }
}
exports.WorkloadIngestionService = WorkloadIngestionService;
exports.workloadIngestionService = new WorkloadIngestionService();
