/**
 * Cache & Decision API Controller
 */

import { Request, Response } from 'express';
import { redisCache } from '../cache/redis';
import { pipeline } from '../pipeline';
import { decisionRepository, eventRepository, settingsRepository } from '../repositories';
import { explainability } from '../engine/explainability';

export class CacheController {
  /**
   * GET /api/cache/objects
   */
  public async getCacheObjects(req: Request, res: Response): Promise<void> {
    const mode = req.query.mode as 'live' | 'demo' | undefined;
    const filterPrefix = mode === 'demo' ? 'adaptivecache:demo:' : (mode === 'live' ? 'cache:obj:' : undefined);
    const objects = redisCache.getAllObjects(filterPrefix);
    const stats = redisCache.getStats();
    res.json({
      success: true,
      data: {
        objects,
        stats,
      },
    });
  }

  /**
   * POST /api/cache/flush
   */
  public async flushCache(req: Request, res: Response): Promise<void> {
    await redisCache.flushall();
    redisCache.resetCounters();
    res.json({
      success: true,
      message: 'Cache flushed and counters reset successfully',
    });
  }

  /**
   * POST /api/cache/request/:id
   */
  public async executeRequest(req: Request, res: Response): Promise<void> {
    const objectId = req.params.id;
    const latency = req.query.latency ? parseInt(req.query.latency as string, 10) : undefined;
    const errorRate = req.query.errorRate ? parseFloat(req.query.errorRate as string) : undefined;
    const mode = req.query.mode as 'live' | 'demo' | undefined;

    const result = await pipeline.processRequest(objectId, latency, errorRate, mode);
    res.json({
      success: result.statusCode === 200,
      data: result,
    });
  }

  /**
   * GET /api/cache/decisions
   */
  public async getDecisions(req: Request, res: Response): Promise<void> {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const mode = req.query.mode as 'live' | 'demo' | undefined;
    let decisions = await decisionRepository.getRecent(limit);
    if (mode === 'demo') {
      decisions = decisions.filter(d => d.source === 'demo' || d.reason.startsWith('[DEMO]') || d.objectId.startsWith('DEMO-'));
    } else if (mode === 'live') {
      decisions = decisions.filter(d => d.source !== 'demo' && !d.reason.startsWith('[DEMO]') && !d.objectId.startsWith('DEMO-'));
    }
    res.json({
      success: true,
      data: decisions,
    });
  }

  /**
   * GET /api/cache/decisions/:id/explain
   */
  public async getDecisionExplanation(req: Request, res: Response): Promise<void> {
    const decisionId = req.params.id;
    const record = await decisionRepository.findById(decisionId);
    if (!record) {
      res.status(404).json({ success: false, message: `Decision with ID ${decisionId} not found` });
      return;
    }

    const settings = await settingsRepository.getSettings();
    const explanation = explainability.explain(record, settings);
    res.json({
      success: true,
      data: explanation,
    });
  }

  /**
   * GET /api/cache/events
   */
  public async getEvents(req: Request, res: Response): Promise<void> {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const filter = req.query.filter as string | undefined;
    const mode = req.query.mode as 'live' | 'demo' | undefined;
    const events = await eventRepository.getRecent(limit, filter, mode);
    res.json({
      success: true,
      data: events,
    });
  }
}

export const cacheController = new CacheController();
