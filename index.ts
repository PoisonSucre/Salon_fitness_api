import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

import payInitiate from './routes/payInitiate';
import payVerify from './routes/payVerify';
import callback from './routes/callback';
import confirm from './routes/confirm';
import status from './routes/status';
import pushRoutes from './routes/pushRoutes';
import errorHandler from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3000;

// Configurer le trust proxy pour les environnements Render / reverse proxy
app.set('trust proxy', 1);

// En-têtes de sécurité HTTP (Helmet)
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// Configuration CORS sécurisée
const frontendUrl = process.env.FRONTEND_URL;
const corsOrigin = frontendUrl
  ? frontendUrl.split(',').map((s) => s.trim())
  : (process.env.NODE_ENV === 'production' ? false : true);

app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Limiteurs de requêtes (Rate Limiting)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Trop de requêtes. Veuillez réessayer plus tard.' },
});

const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 tentatives max par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Trop de tentatives de paiement. Veuillez patienter 5 minutes.' },
});

const pushLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Trop de requêtes de notifications push.' },
});

// Appliquer le limiteur global
app.use(globalLimiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes protégées avec limiteurs spécifiques
app.use('/api/push', pushLimiter, pushRoutes);
app.post('/api/pay/initiate', paymentLimiter, payInitiate);
app.post('/api/pay/verify', paymentLimiter, payVerify);
app.post('/api/pay/confirm', confirm);
app.post('/api/callback', callback);
app.get('/api/status/:token', status);

// Middleware centralisé de gestion des erreurs
app.use(errorHandler);

app.listen(PORT, () => {
  const publicUrl = process.env.CALLBACK_BASE_URL || `http://localhost:${PORT}`;
  console.log(`╔════════════════════════════════════════════════╗`);
  console.log(`║   Serveur Paiement Salon du Fitness Démarré    ║`);
  console.log(`╚════════════════════════════════════════════════╝`);
  console.log(`🚀 Serveur actif sur le port ${PORT}`);
  console.log(`🌍 URL publique : ${publicUrl}`);
  console.log(`💳 POST ${publicUrl}/api/pay/initiate  → Initier un paiement`);
  console.log(`🔑 POST ${publicUrl}/api/pay/verify    → Vérifier OTP (V2 Wallet & OM)`);
  console.log(`✅ POST ${publicUrl}/api/pay/confirm   → Confirmer et créditer`);
  console.log(`📡 POST ${publicUrl}/api/callback      → Callback LigdiCash`);
  console.log(`🔍 GET  ${publicUrl}/api/status/:token  → Statut transaction`);
  console.log(`📲 POST ${publicUrl}/api/push/send     → Envoi push utilisateur`);
  console.log(`📣 POST ${publicUrl}/api/push/send-role → Envoi push rôle`);
});