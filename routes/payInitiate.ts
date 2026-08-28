import { createTransaction, sendWalletOtp } from '../services/ligdicashApi';
import { getTotalWithFee } from '../utils/packs';

const sessions = new Map<string, SessionData>();

export interface SessionData {
  token: string;
  userId: string;
  packId: string;
  phone: string;
  operator: string;
  flammes: number;
  amount: number;
  createdAt: number;
}

export function getSession(token: string): SessionData | undefined {
  return sessions.get(token);
}

export function removeSession(token: string): void {
  sessions.delete(token);
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('226')) return cleaned;
  return `226${cleaned}`;
}

export default async function payInitiate(req: any, res: any) {
  try {
    const { userId, packId, phone, operator, otp } = req.body;

    if (!userId || !packId || !phone) {
      return res.status(400).json({ error: 'userId, packId et phone requis' });
    }

    if (!/^\d{6,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide' });
    }

    const pack = await getTotalWithFee(packId);
    if (!pack) {
      return res.status(400).json({ error: 'Pack invalide' });
    }

    const customer = formatPhone(phone);
    const op = operator === 'orange' || operator === 'moov' ? operator : 'ligdicash';

    // Règle Moov Money : minimum 100 FCFA imposé par LigdiCash / Moov
    if (op === 'moov' && pack.total < 100) {
      return res.status(400).json({
        error: 'Le montant minimum pour Moov Money est de 100 FCFA',
        minAmount: 100,
        currentAmount: pack.total,
      });
    }

    // FLUX 1 : Wallet LigdiCash (API V2 debitotp)
    if (op === 'ligdicash') {
      const otpResponse = await sendWalletOtp(customer, pack.total);

      if (otpResponse.error === true || (otpResponse.error !== false && otpResponse.response_code && otpResponse.response_code !== '00')) {
        return res.status(400).json({
          error: otpResponse.message || otpResponse.response_text || "Échec de l'envoi du code OTP LigdiCash",
          details: otpResponse,
        });
      }

      // Création d'un token de session local pour l'étape 2 (vérification OTP)
      const sessionToken = `wallet_${userId}_${Date.now()}`;
      sessions.set(sessionToken, {
        token: sessionToken,
        userId,
        packId,
        phone,
        operator: 'ligdicash',
        flammes: pack.flammes,
        amount: pack.total,
        createdAt: Date.now(),
      });
      setTimeout(() => removeSession(sessionToken), 10 * 60 * 1000);

      return res.json({
        token: sessionToken,
        message: 'Code OTP envoyé par SMS / application LigdiCash',
        status: 'pending',
        expiresIn: 600,
      });
    }

    // FLUX 2 : Mobile Money direct (Orange Money avec OTP ou Moov Money avec push USSD)
    const callbackUrl = `${process.env.CALLBACK_BASE_URL || 'http://localhost:3000'}/api/callback`;
    const otpValue = op === 'orange' ? (otp || '') : '';

    const payload = {
      commande: {
        invoice: {
          items: [
            {
              name: `${pack.flammes} Flammes`,
              description: 'Pack flammes + frais passerelle',
              quantity: 1,
              unit_price: pack.total,
              total_price: pack.total,
            },
          ],
          total_amount: pack.total,
          devise: 'XOF',
          description: `Achat ${pack.flammes} flammes`,
          customer,
          customer_firstname: '',
          customer_lastname: '',
          customer_email: '',
          external_id: '',
          otp: otpValue,
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
        custom_data: { userId, packId, operator: op },
      },
    };

    const response = await createTransaction(payload);

    if (response.response_code !== '00') {
      const errorMsg = op === 'orange'
        ? (response.response_text || 'Code OTP incorrect ou expiré')
        : (response.response_text || "Erreur lors de l'envoi du paiement");
      return res.status(400).json({ error: errorMsg, details: response });
    }

    const token = response.token;
    sessions.set(token, {
      token,
      userId,
      packId,
      phone,
      operator: op,
      flammes: pack.flammes,
      amount: pack.total,
      createdAt: Date.now(),
    });
    setTimeout(() => removeSession(token), 10 * 60 * 1000);

    const message = op === 'orange'
      ? 'Paiement en cours de traitement'
      : 'Validez le paiement sur votre téléphone (*155# ou popup)';

    return res.json({ token, message, status: 'pending', expiresIn: 600 });
  } catch (error: any) {
    console.error('payInitiate error:', error);
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}
