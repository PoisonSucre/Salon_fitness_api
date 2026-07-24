import { client } from '../config/ligdicash';
import { getTotalWithFee } from '../utils/packs';

const sessions = new Map<string, SessionData>();

export interface SessionData {
  token: string;
  userId: string;
  packId: string;
  phone: string;
  operator: string;
  energy: number;
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

    const invoice = client.Invoice({
      currency: 'xof',
      description: `Achat ${pack.energy} énergies`,
      customer_firstname: '',
      customer_lastname: '',
      customer_email: '',
      store_name: 'Salon du Fitness',
      store_website_url: '',
    });

    invoice.addItem({
      name: `${pack.energy} Énergies`,
      description: `Pack énergie + frais passerelle`,
      quantity: 1,
      unit_price: pack.total,
    });

    const callbackUrl = `${process.env.CALLBACK_BASE_URL}/api/callback`;

    if (operator === 'orange' || operator === 'moov') {
      const response = await invoice.payWithoutRedirection({
        otp: operator === 'orange' ? otp : '',
        customer,
        callback_url: callbackUrl,
        custom_data: { userId, packId, operator },
      });

      if (response.response_code !== '00') {
        return res.status(400).json({
          error: operator === 'orange' ? 'Code OTP incorrect ou expiré' : "Erreur lors de l'envoi du paiement",
          details: response,
        });
      }

      const token = response.token;
      sessions.set(token, {
        token, userId, packId, phone, operator,
        energy: pack.energy, amount: pack.total, createdAt: Date.now(),
      });
      setTimeout(() => removeSession(token), 5 * 60 * 1000);

      return res.json({
        token,
        message: operator === 'orange'
          ? 'Paiement en cours de traitement'
          : 'Validez le paiement sur votre téléphone',
        status: 'pending',
        expiresIn: 300,
      });
    }

    const response = await invoice.payWithoutRedirection({
      otp: otp || '',
      customer,
      callback_url: callbackUrl,
      custom_data: { userId, packId, operator: operator || 'unknown' },
    });

    if (response.response_code !== '00') {
      return res.status(400).json({ error: "Erreur lors de l'envoi de l'OTP", details: response });
    }

    const token = response.token;
    sessions.set(token, {
      token, userId, packId, phone, operator: operator || 'ligdicash',
      energy: pack.energy, amount: pack.total, createdAt: Date.now(),
    });
    setTimeout(() => removeSession(token), 5 * 60 * 1000);

    return res.json({
      token,
      message: 'Code OTP envoyé par SMS',
      expiresIn: 300,
    });
  } catch (error: any) {
    console.error('payInitiate error:', error);
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}