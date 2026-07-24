import { client } from '../config/ligdicash';
import { db } from '../config/firebase';
import admin from 'firebase-admin';
import { getPack } from '../utils/packs';

export default async function callback(req: any, res: any) {
  try {
    console.log('Callback reçu:', JSON.stringify(req.body));

    const { token, status, custom_data } = req.body;

    if (!token) {
      return res.status(400).send('Token manquant');
    }

    const transaction = await client.getTransaction(token, 'payin');
    console.log('Vérification transaction:', transaction.status);

    if (transaction.status !== 'completed') {
      return res.status(200).send('Transaction non complétée');
    }

    const userId = transaction.custom_data?.userId || custom_data?.userId;
    const packId = transaction.custom_data?.packId || custom_data?.packId;
    const pack = await getPack(packId);

    if (!userId || !packId) {
      return res.status(200).send('userId manquant dans custom_data');
    }

    const userRef = db.collection('participant_energy').doc(userId);
    const userDoc = await userRef.get();

    const transactions = userDoc.exists ? (userDoc.data()?.transactions || []) : [];
    const alreadyProcessed = transactions.some((t: any) => t.token === token);

    if (alreadyProcessed) {
      return res.status(200).send('Déjà traité');
    }

    const now = new Date();
    const entry = {
      type: 'purchase',
      packId,
      energy: pack?.energy || 0,
      amount: transaction.amount,
      token,
      phone: transaction.customer || '',
      callbackVerified: true,
      createdAt: now,
    };

    if (!userDoc.exists) {
      await userRef.set({
        userId,
        balance: pack?.energy || 0,
        transactions: [entry],
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await userRef.update({
        balance: admin.firestore.FieldValue.increment(pack?.energy || 0),
        transactions: admin.firestore.FieldValue.arrayUnion(entry),
        updatedAt: now,
      });
    }

    return res.status(200).send('OK');
  } catch (error: any) {
    console.error('callback error:', error);
    return res.status(500).send('Erreur interne');
  }
}