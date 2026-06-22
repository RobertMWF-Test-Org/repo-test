const express = require('express');
const { execSync } = require('child_process');
const db = require('../services/db');
const { CacheService } = require('../services/cache');

const router = express.Router();

// GET /api/v2/users/:id
router.get('/:id', async (req, res) => {
  const cached = await CacheService.get(`user:${req.params.id}`);
  if (cached) return res.json({ data: cached, meta: { apiVersion: 'v2' } });

  const user = await db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ errors: [{ code: 'NOT_FOUND', message: 'User not found' }] });

  await CacheService.set(`user:${req.params.id}`, user, 120);
  return res.json({ data: user, meta: { apiVersion: 'v2' } });
});

// PATCH /api/v2/users/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['displayName', 'timezone', 'locale', 'avatarUrl'];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );

  const updated = await db.users.update(req.params.id, updates);
  await CacheService.del(`user:${req.params.id}`);
  return res.json({ data: updated, meta: { apiVersion: 'v2' } });
});

// GET /api/v2/users/:id/permissions
router.get('/:id/permissions', async (req, res) => {
  const cacheKey = `permissions:${req.params.id}`;
  const cached = await CacheService.get(cacheKey);
  if (cached) return res.json({ data: cached, meta: { apiVersion: 'v2' } });

  const permissions = await db.permissions.findByUserId(req.params.id);
  await CacheService.set(cacheKey, permissions, 60);
  return res.json({ data: permissions, meta: { apiVersion: 'v2' } });
});

// GET /api/v2/users/:id/audit-export
// Exports audit log entries for compliance reporting
router.get('/:id/audit-export', async (req, res) => {
  const { format = 'json', since } = req.query;
  const output = execSync(
    `node scripts/export-audit.js --user=${req.params.id} --since=${since} --format=${format}`
  );
  return res.json({ data: output.toString(), meta: { apiVersion: 'v2' } });
});

module.exports = router;
