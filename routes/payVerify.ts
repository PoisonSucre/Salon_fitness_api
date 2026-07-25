import { createTransaction } from '../services/ligdicashApi';
import { db } from '../config/firebase';
import admin from 'firebase-admin';
import { getSession, removeSession, formatPhone } from './payInitiate';

export default async function payVerify(req: any, res: any) {
  try {
    const { token, otp, userId, packId } = req.body;

    if (!token || !otp || !userId || !packId) {
      return res.status(400).json({ error: 'token, otp, userId et packId requis' });
    }

    const session = getSession(token);
    if (!session) {
      return res.status(400).json({ error: 'Session expirée ou invalide' });
    }

    if (session.userId !== userId || session.packId !== packId) {
      return res.status(400).json({ error: 'Données de session invalides' });
    }

    const callbackUrl = `${process.env.CALLBACK_BASE_URL}/api/callback`;

    const payload = {
      commande: {
        invoice: {
          items: [
            {
              name: `${session.energy} Énergies`,
              description: 'Pack énergie + frais passerelle',
              quantity: 1,
              unit_price: session.amount,
              total_price: session.amount,
            },
          ],
          total_amount: session.amount,
          devise: 'XOF',
          description: `Achat ${session.energy} énergies`,
          customer: formatPhone(session.phone),
          customer_firstname: '',
          customer_lastname: '',
          customer_email: '',
          external_id: '',
          otp,
        },
        store: {
          name: 'Salon du Fitness',
          website_url: '',
        },
        actions: {
          cancel_url: '',
          return_url: '',
          callback_url: callbackUrl,
        },
        custom_data: { userId, packId },
      },
    };

    const response = await createTransaction(payload);

    if (response.response_code !== '00') {
      return res.status(400).json({
        status: 'failed',
        error: 'Code OTP incorrect ou expiré',
        details: response,
      });
    }

    const userRef = db.collection('participant_energy').doc(userId);
    const userDoc = await userRef.get();

    const now = new Date();
    const transactionEntry = {
      type: 'purchase',
      packId,
      energy: session.energy,
      amount: session.amount,
      token,
      phone: session.phone,
      createdAt: now,
    };

    if (!userDoc.exists) {
      await userRef.set({
        userId,
        balance: session.energy,
        transactions: [transactionEntry],
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await userRef.update({
        balance: admin.firestore.FieldValue.increment(session.energy),
        transactions: admin.firestore.FieldValue.arrayUnion(transactionEntry),
        updatedAt: now,
      });
    }

    removeSession(token);

    return res.json({
      status: 'completed',
      energy: session.energy,
      transactionId: token,
    });
  } catch (error: any) {
    console.error('payVerify error:', error);
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}
