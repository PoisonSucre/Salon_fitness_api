import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  role?: string;
  admin?: boolean;
  [key: string]: any;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Middleware vérifiant le jeton Firebase Auth dans le header Authorization (Bearer <token>)
 */
export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Accès refusé. Jeton d\'authentification manquant.' });
      return;
    }

    const token = authHeader.split('Bearer ')[1].trim();
    if (!token) {
      res.status(401).json({ success: false, error: 'Jeton d\'authentification vide.' });
      return;
    }

    const decodedToken = await auth.verifyIdToken(token);

    // Récupérer le rôle depuis Firestore si présent
    let userRole = (decodedToken as any).role || 'participant';
    try {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (userDoc.exists) {
        userRole = userDoc.data()?.role || userRole;
      }
    } catch {
      // Fallback sur le rôle du token
    }

    req.user = {
      ...decodedToken,
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userRole,
      admin: userRole === 'admin' || (decodedToken as any).admin === true,
    };

    next();
  } catch (error: any) {
    console.error('❌ [AUTH_MIDDLEWARE] Erreur de vérification du jeton:', error?.message || error);
    res.status(401).json({ success: false, error: 'Jeton invalide ou expiré.' });
  }
};

/**
 * Middleware restreignant l'accès aux administrateurs
 */
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== 'admin' && !req.user?.admin) {
    res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs.' });
    return;
  }
  next();
};

export default {
  requireAuth,
  requireAdmin,
};
