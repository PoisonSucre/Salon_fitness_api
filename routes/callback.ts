import { getTransactionStatus, parseCustomData } from '../services/ligdicashApi';
import { db } from '../config/firebase';
import admin from 'firebase-admin';
import { getPack } from '../utils/packs';
import { getSession } from './payInitiate';
import pushService from '../services/pushService';

export default async function callback(req: any, res: any) {
  const contentType = req.headers['content-type'] || '';
  console.log(`[callback] Reçu — Content-Type: ${contentType}`);
  console.log('[callback] Body:', JSON.stringify(req.body));

  // Traçabilité : persister chaque requête reçue dans Firestore
  // (collection callback_logs) pour les tests de validation LigdiCash
  const logRef = db.collection('callback_logs').doc();
  try {
    await logRef.set({
      receivedAt: new Date(),
      method: req.method,
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      contentType,
      headers: req.headers,
      body: req.body ?? null,
      outcome: 'processing',
    });
  } catch (logErr: any) {
    console.error('[callback] Échec log Firestore:', logErr.message);
  }

  const finish = async (outcome: string, httpBody: string) => {
    logRef.update({ outcome, respondedAt: new Date() })
      .catch((e) => console.error('[callback] Échec update log:', e.message));
    return res.status(200).send(httpBody);
  };

  try {
    let payload = req.body;

    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { /* form-urlencoded déjà parsé */ }
    }

    const token = payload.token || payload.invoice_token || '';

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
      return finish('rejected_no_token', 'Token manquant');
    }

    const transaction = await getTransactionStatus(token);
    console.log('[callback] Statut transaction:', transaction.status, '| amount:', transaction.amount);

    if (transaction.status !== 'completed') {
      console.log('[callback] Transaction pas encore complétée, en attente');
      return finish(`transaction_${transaction.status || 'unknown'}`, 'Transaction non complétée');
    }

    const confirmDataFromApi = parseCustomData(transaction.custom_data);
    const finalUserId = userId || confirmDataFromApi.userId;
    const finalPackId = packId || confirmDataFromApi.packId;

    if (!finalUserId || !finalPackId) {
      console.error('[callback] userId/packId manquants:', { finalUserId, finalPackId });
      return finish('rejected_missing_ids', 'userId/packId manquants');
    }

    const pack = await getPack(finalPackId);
    if (!pack) {
      console.error('[callback] Pack invalide:', finalPackId);
      return finish('rejected_invalid_pack', 'Pack invalide');
    }

    const userRef = db.collection('participant_energy').doc(finalUserId);
    let newlyCredited = false;

    // Transaction atomique ACID
    await db.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      const transactions = userSnap.exists ? (userSnap.data()?.transactions || []) : [];
      const alreadyProcessed = transactions.some((item: any) => item.token === token);

      if (alreadyProcessed) {
        return;
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

      if (!userSnap.exists) {
        t.set(userRef, {
          userId: finalUserId,
          balance: pack.flammes,
          transactions: [entry],
          createdAt: now,
          updatedAt: now,
        });
      } else {
        t.update(userRef, {
          balance: admin.firestore.FieldValue.increment(pack.flammes),
          transactions: admin.firestore.FieldValue.arrayUnion(entry),
          updatedAt: now,
        });
      }
      newlyCredited = true;
    });

    if (newlyCredited) {
      console.log(`[callback] Crédité ${pack.flammes} flammes à ${finalUserId} (pack: ${finalPackId})`);

      // Envoi de la notification push au client
      pushService.sendPushToUser(
        finalUserId,
        'Paiement validé ! 🔥',
        `Votre compte a été crédité de ${pack.flammes} Flammes (${transaction.amount || ''} FCFA).`,
        { type: 'energy_purchased', flammes: pack.flammes, amount: transaction.amount, packId: finalPackId }
      ).catch((e) => console.error('Erreur push callback:', e));
    } else {
      console.log('[callback] Déjà traité, skip:', token);
    }

    return finish(newlyCredited ? 'credited' : 'already_processed', 'OK');
  } catch (error: any) {
    console.error('[callback] ERREUR:', error.message, error.stack);
    return finish(`error_${error.message || 'unknown'}`, 'Erreur traitée');
  }
}
