import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import payInitiate from './routes/payInitiate';
import payVerify from './routes/payVerify';
import callback from './routes/callback';
import confirm from './routes/confirm';
import status from './routes/status';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/pay/initiate', payInitiate);
app.post('/api/pay/verify', payVerify);
app.post('/api/pay/confirm', confirm);
app.post('/api/callback', callback);
app.get('/api/status/:token', status);

app.listen(PORT, () => {
  const publicUrl = process.env.CALLBACK_BASE_URL || `http://localhost:${PORT}`;
  console.log(`Serveur de paiement démarré sur le port ${PORT}`);
  console.log(`URL publique : ${publicUrl}`);
  console.log(`POST ${publicUrl}/api/pay/initiate  → Initier un paiement`);
  console.log(`POST ${publicUrl}/api/pay/verify    → Vérifier OTP`);
  console.log(`POST ${publicUrl}/api/pay/confirm   → Confirmer et créditer`);
  console.log(`POST ${publicUrl}/api/callback      → Callback LigdiCash`);
  console.log(`GET  ${publicUrl}/api/status/:token  → Statut transaction`);
});