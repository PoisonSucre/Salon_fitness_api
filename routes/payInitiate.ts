import { createTransaction } from '../services/ligdicashApi';
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
    const callbackUrl = `${process.env.CALLBACK_BASE_URL}/api/callback`;

    const otpValue = operator === 'orange' ? (otp || '') : '';
    const op = operator === 'orange' || operator === 'moov' ? operator : 'ligdicash';

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
      const errorMsg = operator === 'orange'
        ? 'Code OTP incorrect ou expiré'
        : "Erreur lors de l'envoi du paiement";
      return res.status(400).json({ error: errorMsg, details: response });
    }

    const token = response.token;
    sessions.set(token, {
      token, userId, packId, phone, operator: op,
      flammes: pack.flammes, amount: pack.total, createdAt: Date.now(),
    });
    setTimeout(() => removeSession(token), 5 * 60 * 1000);

    const message = operator === 'orange'
      ? 'Paiement en cours de traitement'
      : operator === 'moov'
        ? 'Validez le paiement sur votre téléphone'
        : 'Code OTP envoyé par SMS';

    return res.json({ token, message, status: 'pending', expiresIn: 300 });
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      console.error('payInitiate error: JSON parse error - API returned non-JSON. Check LigdiCash API key/token and network.');
    } else {
      console.error('payInitiate error:', error.name, error.message);
    }
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}
