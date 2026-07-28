import { getTransactionStatus, parseCustomData } from '../services/ligdicashApi';
import { db } from '../config/firebase';
import admin from 'firebase-admin';
import { getPack } from '../utils/packs';
import { getSession } from './payInitiate';

export default async function callback(req: any, res: any) {
  const contentType = req.headers['content-type'] || '';
  console.log(`[callback] Reçu — Content-Type: ${contentType}`);
  console.log('[callback] Body:', JSON.stringify(req.body));

  try {
    let payload = req.body;

    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { /* form-urlencoded déjà parsé */ }
    }

    const token = payload.token || '';

    const confirmData = parseCustomData(payload.custom_data);
    console.log('[callback] custom_data parsé:', JSON.stringify(confirmData));

    const session = getSession(token);
    const bodyData = payload.custom_data || {};

    const userId = confirmData.userId || session?.userId || (typeof bodyData === 'object' && !Array.isArray(bodyData) ? bodyData.userId : undefined);
    const packId = confirmData.packId || session?.packId || (typeof bodyData === 'object' && !Array.isArray(bodyData) ? bodyData.packId : undefined);
    const operator = confirmData.operator || session?.operator || '';

    console.log('[callback] Résolution:', { userId, packId, operator, hasSession: !!session });

    if (!token) {
      console.warn('[callback] Rejeté: token manquant');
      return res.status(200).send('Token manquant');
    }

    const transaction = await getTransactionStatus(token);
    console.log('[callback] Statut transaction:', transaction.status, '| amount:', transaction.amount);

    if (transaction.status !== 'completed') {
      console.log('[callback] Transaction pas encore complétée, en attente');
      return res.status(200).send('Transaction non complétée');
    }

    const confirmDataFromApi = parseCustomData(transaction.custom_data);
    const finalUserId = userId || confirmDataFromApi.userId;
    const finalPackId = packId || confirmDataFromApi.packId;

    if (!finalUserId || !finalPackId) {
      console.error('[callback] userId/packId manquants:', { finalUserId, finalPackId });
      return res.status(200).send('userId/packId manquants');
    }

    const pack = await getPack(finalPackId);
    if (!pack) {
      console.error('[callback] Pack invalide:', finalPackId);
      return res.status(200).send('Pack invalide');
    }

    const userRef = db.collection('participant_energy').doc(finalUserId);
    const userDoc = await userRef.get();

    const transactions = userDoc.exists ? (userDoc.data()?.transactions || []) : [];
    const alreadyProcessed = transactions.some((t: any) => t.token === token);

    if (alreadyProcessed) {
      console.log('[callback] Déjà traité, skip:', token);
      return res.status(200).send('Déjà traité');
    }

    const now = new Date();
    const entry = {
      type: 'purchase',
      packId: finalPackId,
      energy: pack.flammes,
      amount: transaction.amount,
      token,
      phone: transaction.customer || '',
      callbackVerified: true,
      createdAt: now,
    };

    if (!userDoc.exists) {
      await userRef.set({
        userId: finalUserId,
        balance: pack.flammes,
        transactions: [entry],
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await userRef.update({
        balance: admin.firestore.FieldValue.increment(pack.flammes),
        transactions: admin.firestore.FieldValue.arrayUnion(entry),
        updatedAt: now,
      });
    }

    console.log(`[callback] Crédité ${pack.flammes} flammes à ${finalUserId} (pack: ${finalPackId})`);
    return res.status(200).send('OK');
  } catch (error: any) {
    console.error('[callback] ERREUR:', error.message, error.stack);
    return res.status(200).send('Erreur traitée');
  }
}
