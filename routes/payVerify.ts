import { createTransaction, debitWalletWithOtp } from '../services/ligdicashApi';
import { db } from '../config/firebase';
import admin from 'firebase-admin';
import { getSession, removeSession, formatPhone } from './payInitiate';
import pushService from '../services/pushService';

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

    const callbackUrl = `${process.env.CALLBACK_BASE_URL || 'http://localhost:3000'}/api/callback`;
    const isWallet = session.operator === 'ligdicash';

    const payload = {
      commande: {
        invoice: {
          items: [
            {
              name: `${session.flammes} Flammes`,
              description: 'Pack flammes + frais passerelle',
              quantity: 1,
              unit_price: session.amount,
              total_price: session.amount,
            },
          ],
          total_amount: session.amount,
          devise: 'XOF',
          description: `Achat ${session.flammes} flammes`,
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
        custom_data: { userId, packId, operator: session.operator },
      },
    };

    // Wallet LigdiCash : endpoint V2 /pay/v02/debitwallet/withotp
    // Autres opérateurs : endpoint V1 /pay/v01/straight/checkout-invoice/create
    const response = isWallet
      ? await debitWalletWithOtp(payload)
      : await createTransaction(payload);

    if (response.response_code !== '00') {
      return res.status(400).json({
        status: 'failed',
        error: response.response_text || 'Code OTP incorrect ou expiré',
        details: response,
      });
    }

    const realToken = (isWallet && response.token) ? response.token : token;

    // Créditer les flammes/énergie dans Firebase via une transaction ACID atomique
    const userRef = db.collection('participant_energy').doc(userId);

    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const transactions = userSnap.exists ? (userSnap.data()?.transactions || []) : [];
      const alreadyProcessed = transactions.some((t: any) => t.token === realToken || t.token === token);

      if (alreadyProcessed) {
        return;
      }

      const now = new Date();
      const transactionEntry = {
        type: 'purchase',
        packId,
        energy: session.flammes,
        amount: session.amount,
        token: realToken,
        phone: session.phone,
        operator: session.operator,
        createdAt: now,
      };

      if (!userSnap.exists) {
        transaction.set(userRef, {
          userId,
          balance: session.flammes,
          transactions: [transactionEntry],
          createdAt: now,
          updatedAt: now,
        });
      } else {
        transaction.update(userRef, {
          balance: admin.firestore.FieldValue.increment(session.flammes),
          transactions: admin.firestore.FieldValue.arrayUnion(transactionEntry),
          updatedAt: now,
        });
      }
    });

    removeSession(token);

    // Envoi de la notification push au client (non bloquant)
    pushService.sendPushToUser(
      userId,
      'Achat de Flammes réussi ! 🔥',
      `Votre achat de ${session.flammes} Flammes (${session.amount.toLocaleString('fr-FR')} FCFA) a été validé avec succès.`,
      { type: 'energy_purchased', flammes: session.flammes, amount: session.amount, packId }
    ).catch((e) => console.error('Erreur push payVerify:', e));

    return res.json({
      status: 'completed',
      flammes: session.flammes,
      transactionId: realToken,
    });
  } catch (error: any) {
    console.error('payVerify error:', error);
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}
