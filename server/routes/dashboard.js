import express from 'express';
import { requirePermission } from '../auth.js';
import { dashboardData } from '../domain/dashboard.js';

export function dashboardRoutes({ db }) {
  const router = express.Router();
  router.get('/', requirePermission('dashboard:read'), (req, res) => {
    res.json(dashboardData(db, req.query.date));
  });
  return router;
}
