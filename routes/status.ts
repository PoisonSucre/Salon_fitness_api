import { client } from '../config/ligdicash';

export default async function status(req: any, res: any) {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Token requis' });
    }

    const transaction = await client.getTransaction(token, 'payin');

    return res.json({
      status: transaction.status,
      response_code: transaction.response_code,
      amount: transaction.amount,
      operator_name: transaction.operator_name,
      customer: transaction.customer,
    });
  } catch (error: any) {
    console.error('status error:', error);
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}