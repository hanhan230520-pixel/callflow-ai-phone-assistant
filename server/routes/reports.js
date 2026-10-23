import express from 'express';
import { requirePermission } from '../auth.js';
import { reportSummary, reportTrend, reportDistributions, topCustomers, reportPayload } from '../domain/reports.js';

export function reportRoutes({ db }) {
  const router = express.Router();
  router.get('/', requirePermission('reports:read'), (req, res) => {
    res.json(reportPayload(db, req.query));
  });
  router.get('/summary', requirePermission('reports:read'), (req, res) => {
    res.json(reportSummary(db, req.query));
  });
  router.get('/trend', requirePermission('reports:read'), (req, res) => {
    res.json({ items: reportTrend(db, req.query.days) });
  });
  router.get('/distributions', requirePermission('reports:read'), (req, res) => {
    res.json(reportDistributions(db, req.query));
  });
  router.get('/top-customers', requirePermission('reports:read'), (req, res) => {
    res.json({ items: topCustomers(db, req.query.limit) });
  });
  return router;
}
