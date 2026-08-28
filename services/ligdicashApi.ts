export function parseCustomData(data: any): Record<string, string> {
  if (!data) return {};
  if (Array.isArray(data)) {
    const obj: Record<string, string> = {};
    for (const item of data) {
      if (item && item.keyof_customdata && item.valueof_customdata !== undefined) {
        obj[item.keyof_customdata] = item.valueof_customdata;
      }
    }
    return obj;
  }
  return data;
}

const BASE_URL = 'https://app.ligdicash.com';

function getHeaders() {
  return {
    Apikey: process.env.LIGDICASH_API_KEY || '',
    Authorization: `Bearer ${process.env.LIGDICASH_AUTH_TOKEN || ''}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/**
 * Création de transaction directe (Orange Money avec OTP ou Moov Money avec push USSD)
 */
export async function createTransaction(payload: object): Promise<any> {
  const url = `${BASE_URL}/pay/v01/straight/checkout-invoice/create`;
  console.log('[ligdicashApi] createTransaction → POST', url);
  console.log('[ligdicashApi] Payload:', JSON.stringify(payload));

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  console.log('[ligdicashApi] Response status:', response.status);
  const data = await response.json();
  console.log('[ligdicashApi] Response body:', JSON.stringify(data));

  return data;
}

/**
 * Étape 1 du Wallet LigdiCash : Envoi du code OTP au client
 */
export async function sendWalletOtp(phone: string, amount: number): Promise<any> {
  const url = `${BASE_URL}/pay/v02/debitotp/${phone}/${amount}`;
  console.log('[ligdicashApi] sendWalletOtp → GET', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Apikey: process.env.LIGDICASH_API_KEY || '',
      Authorization: `Bearer ${process.env.LIGDICASH_AUTH_TOKEN || ''}`,
      Accept: 'application/json',
    },
  });

  console.log('[ligdicashApi] Response status:', response.status);
  const data = await response.json();
  console.log('[ligdicashApi] Response body:', JSON.stringify(data));

  return data;
}

/**
 * Étape 2 du Wallet LigdiCash : Débit du portefeuille avec le code OTP reçu
 */
export async function debitWalletWithOtp(payload: object): Promise<any> {
  const url = `${BASE_URL}/pay/v02/debitwallet/withotp`;
  console.log('[ligdicashApi] debitWalletWithOtp → POST', url);
  console.log('[ligdicashApi] Payload:', JSON.stringify(payload));

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  console.log('[ligdicashApi] Response status:', response.status);
  const data = await response.json();
  console.log('[ligdicashApi] Response body:', JSON.stringify(data));

  return data;
}

/**
 * Vérification du statut de la transaction (endpoint confirm)
 */
export async function getTransactionStatus(token: string): Promise<any> {
  const url = `${BASE_URL}/pay/v01/redirect/checkout-invoice/confirm/?invoiceToken=${token}`;
  console.log('[ligdicashApi] getTransactionStatus → GET', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Apikey: process.env.LIGDICASH_API_KEY || '',
      Authorization: `Bearer ${process.env.LIGDICASH_AUTH_TOKEN || ''}`,
      Accept: 'application/json',
    },
  });

  console.log('[ligdicashApi] Response status:', response.status);
  const data = await response.json();
  console.log('[ligdicashApi] Response body:', JSON.stringify(data));

  return data;
}
