import { Router, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/authMiddleware';
import pushService from '../services/pushService';

const router = Router();

// POST /api/push/send (Authentification requise)
// Body: { uid: string, title: string, body: string, data?: object }
router.post('/send', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { uid, title, body, data } = req.body;

    if (!uid || typeof uid !== 'string') {
      res.status(400).json({ success: false, error: 'uid requis' });
      return;
    }
    if (!title || typeof title !== 'string') {
      res.status(400).json({ success: false, error: 'title requis' });
      return;
    }
    if (!body || typeof body !== 'string') {
      res.status(400).json({ success: false, error: 'body requis' });
      return;
    }

    const sent = await pushService.sendPushToUser(uid, title, body, data);
    res.json({ success: true, sent });
  } catch (error: any) {
    next(error);
  }
});

// POST /api/push/send-role (Diffusion restreinte aux administrateurs)
// Body: { role: string, title: string, body: string, data?: object }
router.post('/send-role', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { role, title, body, data } = req.body;

    if (!role || typeof role !== 'string') {
      res.status(400).json({ success: false, error: 'role requis' });
      return;
    }
    if (!title || typeof title !== 'string') {
      res.status(400).json({ success: false, error: 'title requis' });
      return;
    }
    if (!body || typeof body !== 'string') {
      res.status(400).json({ success: false, error: 'body requis' });
      return;
    }

    const sentCount = await pushService.sendPushToRole(role, title, body, data);
    res.json({ success: true, sentCount });
  } catch (error: any) {
    next(error);
  }
});

export default router;
