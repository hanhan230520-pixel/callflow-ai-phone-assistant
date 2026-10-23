import express from 'express';
import { audit, requirePermission } from '../auth.js';
import { parseBody, customerCreateSchema, customerUpdateSchema, paymentSchema, mergeSchema } from '../lib/schemas.js';
import {
  listCustomers, customerDetail, createCustomer, updateCustomer,
  deleteCustomer, addPayment, mergeCustomers
} from '../domain/customers.js';

export function customerRoutes({ db }) {
  const router = express.Router();

  router.get('/', requirePermission('customers:read'), (req, res) => {
    res.json(listCustomers(db, req.query));
  });

  router.get('/:id', requirePermission('customers:read'), (req, res) => {
    res.json(customerDetail(db, req.params.id));
  });

  router.post('/', requirePermission('customers:write'), (req, res) => {
    const data = parseBody(customerCreateSchema, req.body);
    const item = createCustomer(db, data);
    audit(db, req, { action: 'customer.create', entityType: 'customer', entityId: item.id, detail: `${item.name} ${item.phone}` });
    res.status(201).json({ item });
  });

  router.patch('/:id', requirePermission('customers:write'), (req, res) => {
    const data = parseBody(customerUpdateSchema, req.body);
    const item = updateCustomer(db, req.params.id, data);
    audit(db, req, { action: 'customer.update', entityType: 'customer', entityId: item.id, detail: item.name });
    res.json({ item });
  });

  router.delete('/:id', requirePermission('customers:delete'), (req, res) => {
    const item = deleteCustomer(db, req.params.id);
    audit(db, req, { action: 'customer.delete', entityType: 'customer', entityId: item.id, detail: item.name });
    res.json({ ok: true, item });
  });

  router.post('/:id/payments', requirePermission('customers:write'), (req, res) => {
    const data = parseBody(paymentSchema, req.body);
    const payment = addPayment(db, req.params.id, data, req.user);
    audit(db, req, { action: 'customer.payment', entityType: 'customer', entityId: req.params.id, detail: `${payment.amount} ${payment.method}` });
    res.status(201).json({ payment, detail: customerDetail(db, req.params.id) });
  });

  router.post('/:id/merge', requirePermission('customers:delete'), (req, res) => {
    const data = parseBody(mergeSchema, req.body);
    if (data.sourceId !== req.params.id) data.sourceId = req.params.id;
    const item = mergeCustomers(db, data.sourceId, data.targetId);
    audit(db, req, { action: 'customer.merge', entityType: 'customer', entityId: item.id, detail: `${data.sourceId} -> ${data.targetId}` });
    res.json({ item });
  });

  return router;
}
