import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!admin.apps.length) {
  const serviceAccountPath: string = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    || resolve(__dirname, '../../frontend/salon-fitness-firebase-adminsdk-fbsvc-3d8adf4681.json');

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
export const auth = admin.auth();