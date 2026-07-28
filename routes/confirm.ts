import { getTransactionStatus, parseCustomData } from '../services/ligdicashApi';
import { db } from '../config/firebase';
import admin from 'firebase-admin';
import { getPack } from '../utils/packs';
import { getSession } from './payInitiate';

export default async function confirm(req: any, res: any) {
  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({ error: 'token et userId requis' });
    }

    console.log('[confirm] Vérification transaction:', token.substring(0, 30) + '...');

    const transaction = await getTransactionStatus(token);

    if (transaction.status !== 'completed') {
      console.log('[confirm] Transaction pas encore complétée:', transaction.status);
      return res.json({ status: transaction.status, credited: false });
    }

    const confirmData = parseCustomData(transaction.custom_data);
    const session = getSession(token);
    const packId = confirmData.packId || session?.packId;
    const creditedUserId = confirmData.userId || session?.userId || userId;

    if (!packId) {
      console.error('[confirm] packId introuvable');
      return res.status(400).json({ error: 'packId introuvable' });
    }

    const pack = await getPack(packId);
    if (!pack) {
      console.error('[confirm] Pack invalide:', packId);
      return res.status(400).json({ error: 'Pack invalide' });
    }

    const userRef = db.collection('participant_energy').doc(creditedUserId);
    const userDoc = await userRef.get();

    const transactions = userDoc.exists ? (userDoc.data()?.transactions || []) : [];
    const alreadyProcessed = transactions.some((t: any) => t.token === token);

    if (alreadyProcessed) {
      console.log('[confirm] Déjà traité:', token);
      return res.json({ status: 'completed', credited: true, flammes: pack.flammes, message: 'Déjà traité' });
    }

    const now = new Date();
    const entry = {
      type: 'purchase',
      packId,
      energy: pack.flammes,
      amount: transaction.amount,
      token,
      phone: transaction.customer || '',
      callbackVerified: false,
      pollVerified: true,
      createdAt: now,
    };

    if (!userDoc.exists) {
      await userRef.set({
        userId: creditedUserId,
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

    console.log(`[confirm] Crédité ${pack.flammes} flammes à ${creditedUserId} via polling`);
    return res.json({ status: 'completed', credited: true, flammes: pack.flammes });
  } catch (error: any) {
    console.error('[confirm] ERREUR:', error.message);
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}
