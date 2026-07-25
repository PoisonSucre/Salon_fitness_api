export function parseCustomData(data: any): Record<string, string> {
  if (!data) return {};
  if (Array.isArray(data)) {
    const obj: Record<string, string> = {};
    for (const item of data) {
      if (item.keyof_customdata && item.valueof_customdata !== undefined) {
        obj[item.keyof_customdata] = item.valueof_customdata;
      }
    }
    return obj;
  }
  return data;
}

const BASE_URL = 'https://app.ligdicash.com/pay/v01';

function getHeaders() {
  return {
    Apikey: process.env.LIGDICASH_API_KEY || '',
    Authorization: `Bearer ${process.env.LIGDICASH_AUTH_TOKEN || ''}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function createTransaction(payload: object): Promise<any> {
  const url = `${BASE_URL}/straight/checkout-invoice/create`;
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

export async function getTransactionStatus(token: string): Promise<any> {
  const url = `${BASE_URL}/redirect/checkout-invoice/confirm/?invoiceToken=${token}`;
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
