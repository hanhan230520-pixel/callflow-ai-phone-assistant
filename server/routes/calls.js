import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { audit, hasPermission, requirePermission } from '../auth.js';
import { parseBody, callCreateSchema, callUpdateSchema, simulateIncomingSchema, callAppointmentSchema } from '../lib/schemas.js';
import {
  listCalls, callDetail, createManualCall, updateCall, deleteCall, simulateIncoming,
  answerCall, hangupCall, generateTranscript, analyzeCallRecord, createAppointmentFromCall,
  linkAppointment, simulateRecording, callStats
} from '../domain/calls.js';

const transcriptSchema = z.object({ scenario: z.string().max(40).optional() });
const linkSchema = z.object({ appointmentId: z.string().trim().max(80).nullable().optional() });
const hangupSchema = z.object({ durationSeconds: z.coerce.number().int().min(0).max(86400).optional() });

export function callRoutes({ db }) {
  const router = express.Router();

  router.get('/', requirePermission('calls:read'), (req, res) => {
    res.json({ ...listCalls(db, req.query), stats: callStats(db) });
  });

  router.get('/stats', requirePermission('calls:read'), (req, res) => {
    res.json(callStats(db));
  });

  router.post('/simulate-incoming', requirePermission('calls:write'), (req, res) => {
    const data = parseBody(simulateIncomingSchema, req.body);
    const result = simulateIncoming(db, data, req.user);
    audit(db, req, { action: 'call.simulate', entityType: 'call', entityId: result.item.id, detail: `模拟来电 ${result.item.phone}` });
    res.status(201).json({ ...result, simulated: true });
  });

  router.get('/:id', requirePermission('calls:read'), (req, res) => {
    res.json(callDetail(db, req.params.id));
  });

  router.post('/', requirePermission('calls:write'), (req, res) => {
    const data = parseBody(callCreateSchema, req.body);
    const item = createManualCall(db, data, req.user);
    audit(db, req, { action: 'call.create', entityType: 'call', entityId: item.id, detail: item.contactName });
    res.status(201).json({ item });
  });

  router.patch('/:id', requirePermission('calls:write'), (req, res) => {
    const data = parseBody(callUpdateSchema, req.body);
    const item = updateCall(db, req.params.id, data);
    audit(db, req, { action: 'call.update', entityType: 'call', entityId: item.id, detail: item.contactName });
    res.json({ item });
  });

  router.delete('/:id', requirePermission('calls:delete'), (req, res) => {
    const item = deleteCall(db, req.params.id);
    audit(db, req, { action: 'call.delete', entityType: 'call', entityId: item.id, detail: item.contactName });
    res.json({ ok: true, item });
  });

  router.post('/:id/answer', requirePermission('calls:write'), (req, res) => {
    const item = answerCall(db, req.params.id);
    res.json({ item, simulated: item.isSimulated });
  });

  router.post('/:id/hangup', requirePermission('calls:write'), (req, res) => {
    const data = parseBody(hangupSchema, req.body || {});
    const item = hangupCall(db, req.params.id, data);
    res.json({ item });
  });

  router.post('/:id/transcribe', requirePermission('calls:write'), (req, res) => {
    const data = parseBody(transcriptSchema, req.body || {});
    const detail = generateTranscript(db, req.params.id, data);
    res.json({ ...detail, simulated: true, provider: 'mock-stt', note: '模拟转写文本由本地规则生成，不是真实语音识别结果。' });
  });

  router.post('/:id/analyze', requirePermission('calls:write'), (req, res) => {
    const result = analyzeCallRecord(db, req.params.id);
    audit(db, req, { action: 'call.analyze', entityType: 'call', entityId: req.params.id, detail: result.call.contactName });
    res.json({ ...result, simulated: true });
  });

  router.post('/:id/appointment', requirePermission('appointments:write'), (req, res) => {
    const data = parseBody(callAppointmentSchema, req.body || {});
    const allowOverride = hasPermission(req.user, 'appointments:override');
    if (data.overrideConflict && !allowOverride) throw new AppError('当前角色没有覆盖冲突的权限', 403, 'FORBIDDEN');
    const result = createAppointmentFromCall(db, req.params.id, data, req.user, { allowOverride });
    audit(db, req, { action: 'call.convert_appointment', entityType: 'call', entityId: req.params.id, detail: result.appointment.guestName });
    res.status(201).json(result);
  });

  router.post('/:id/link', requirePermission('calls:write'), (req, res) => {
    const data = parseBody(linkSchema, req.body || {});
    const item = linkAppointment(db, req.params.id, data.appointmentId);
    res.json({ item });
  });

  router.post('/:id/recording', requirePermission('calls:write'), (req, res) => {
    const item = simulateRecording(db, req.params.id);
    res.json({ item });
  });

  return router;
}
