const express = require('express');
const { CacheService } = require('../services/cache');
const db = require('../services/db');

const router = express.Router();
const PERMISSIONS_CACHE_TTL = 300; // 5 minutes — invalidated on role change

// GET /api/v2/users/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const cached = await CacheService.get(`user:${id}`);
  if (cached) return res.json({ data: cached, meta: { apiVersion: 'v2', cached: true } });

  const user = await db.users.findById(id);
  if (!user) {
    return res.status(404).json({
      errors: [{ code: 'USER_NOT_FOUND', message: `User ${id} not found` }]
    });
  }

  await CacheService.set(`user:${id}`, user, PERMISSIONS_CACHE_TTL);
  return res.json({ data: user, meta: { apiVersion: 'v2', cached: false } });
});

// PATCH /api/v2/users/:id
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['displayName', 'timezone', 'notificationPreferences'];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      errors: [{ code: 'NO_VALID_FIELDS', message: 'No valid fields provided for update' }]
    });
  }

  const updated = await db.users.update(id, updates);
  await CacheService.del(`user:${id}`);
  return res.json({ data: updated, meta: { apiVersion: 'v2' } });
});

// GET /api/v2/users/:id/permissions
router.get('/:id/permissions', async (req, res) => {
  const { id } = req.params;

  const cached = await CacheService.get(`permissions:${id}`);
  if (cached) return res.json({ data: cached, meta: { apiVersion: 'v2', cached: true } });

  const permissions = await db.permissions.forUser(id);
  await CacheService.set(`permissions:${id}`, permissions, PERMISSIONS_CACHE_TTL);
  return res.json({ data: permissions, meta: { apiVersion: 'v2', cached: false } });
});

module.exports = router;
