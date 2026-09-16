#!/usr/bin/env node
/**
 * Génère un lien de paiement LigdiCash (checkout avec redirection).
 *
 * Usage :
 *   node scripts/create-test-link.mjs [montant]
 *
 * Exemple :
 *   node scripts/create-test-link.mjs 10
 *
 * Le lien généré permet à un tiers (ex. LigdiCash pour les tests de
 * validation) de payer via la page hébergée LigdiCash. Le callback_url
 * pointe vers ${CALLBACK_BASE_URL}/api/callback.
 */
import 'dotenv/config';

const amount = parseInt(process.argv[2] || '10', 10);
if (isNaN(amount) || amount <= 0) {
  console.error('Montant invalide. Usage: node scripts/create-test-link.mjs [montant]');
  process.exit(1);
}

const BASE_URL = 'https://app.ligdicash.com';
const callbackBase = process.env.CALLBACK_BASE_URL || 'http://localhost:3000';

if (!process.env.LIGDICASH_API_KEY || !process.env.LIGDICASH_AUTH_TOKEN) {
  console.error('LIGDICASH_API_KEY et LIGDICASH_AUTH_TOKEN requis dans .env');
  process.exit(1);
}

const payload = {
  commande: {
    invoice: {
      items: [
        {
          name: 'Test validation LigdiCash',
          description: `Paiement test de ${amount} FCFA`,
          quantity: 1,
          unit_price: amount,
          total_price: amount,
        },
      ],
      total_amount: amount,
      devise: 'XOF',
      description: `Test validation - ${amount} FCFA`,
      customer: '',
      customer_firstname: 'Test',
      customer_lastname: 'Validation',
      customer_email: '',
      external_id: `test_${Date.now()}`,
    },
    store: {
      name: 'Salon du Fitness',
      website_url: '',
    },
    actions: {
      cancel_url: '',
      return_url: '',
      callback_url: `${callbackBase}/api/callback`,
    },
    custom_data: { test: true, userId: 'test_validation', packId: 'small' },
  },
};

console.log(`\nCréation d'une facture test de ${amount} FCFA...`);
console.log(`Callback URL : ${payload.commande.actions.callback_url}\n`);

const response = await fetch(`${BASE_URL}/pay/v01/redirect/checkout-invoice/create`, {
  method: 'POST',
  headers: {
    Apikey: process.env.LIGDICASH_API_KEY,
    Authorization: `Bearer ${process.env.LIGDICASH_AUTH_TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const data = await response.json();
console.log('Réponse LigdiCash:', JSON.stringify(data, null, 2));

if (data.response_code === '00' && data.token) {
  const paymentUrl = data.response_text || `${BASE_URL}/pay/v01/redirect/checkout-invoice/?invoiceToken=${data.token}`;
  console.log('\n════════════════════════════════════════════════');
  console.log('✅ LIEN DE PAIEMENT GÉNÉRÉ');
  console.log('════════════════════════════════════════════════');
  console.log(`Montant : ${amount} FCFA`);
  console.log(`Token   : ${data.token}`);
  console.log(`Lien    : ${paymentUrl}`);
  console.log('════════════════════════════════════════════════\n');
} else {
  console.error('\n❌ Échec de création de la facture');
  process.exit(1);
}
