const express = require('express');
const { validateCredentials, generateTokenPair } = require('../services/auth');
const { rateLimiter } = require('../middleware/rate-limiter');
const { CacheService } = require('../services/cache');

const router = express.Router();
const SESSION_CACHE_TTL = 300; // 5 minutes

// POST /api/v2/auth/login
router.post('/login', rateLimiter('auth'), async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      errors: [{ code: 'MISSING_CREDENTIALS', message: 'Email and password are required' }]
    });
  }

  try {
    const { user, accessToken, refreshToken } = await validateCredentials(email, password);

    await CacheService.set(
      `session:${user.id}`,
      { userId: user.id, role: user.role, workspaceId: user.workspaceId },
      SESSION_CACHE_TTL
    );

    return res.status(200).json({
      data: { accessToken, refreshToken, expiresIn: 3600 },
      meta: { apiVersion: 'v2' }
    });
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({
        errors: [{ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }]
      });
    }
    return res.status(500).json({
      errors: [{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }]
    });
  }
});

// POST /api/v2/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      errors: [{ code: 'MISSING_TOKEN', message: 'Refresh token is required' }]
    });
  }

  try {
    const { accessToken, newRefreshToken } = await generateTokenPair(refreshToken);
    return res.status(200).json({
      data: { accessToken, refreshToken: newRefreshToken, expiresIn: 3600 },
      meta: { apiVersion: 'v2' }
    });
  } catch (err) {
    return res.status(401).json({
      errors: [{ code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' }]
    });
  }
});

// DELETE /api/v2/auth/logout
router.delete('/logout', async (req, res) => {
  const userId = req.user?.id;
  if (userId) {
    await CacheService.del(`session:${userId}`);
  }
  return res.status(204).send();
});

module.exports = router;
