import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!admin.apps.length) {
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const defaultPath = resolve(__dirname, '../../frontend/salon-fitness-firebase-adminsdk-fbsvc-3d8adf4681.json');
  const serviceAccountPath = envPath && existsSync(envPath)
    ? envPath
    : (existsSync(defaultPath) ? defaultPath : (envPath ? resolve(process.cwd(), envPath) : ''));

  if (serviceAccountPath && existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialisé avec succès depuis le fichier de service account');
    } catch (e) {
      console.error('⚠️ Erreur lecture service account Firebase:', e);
      admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'salon-fitness' });
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log('✅ Firebase Admin initialisé depuis les variables d\'environnement');
  } else {
    console.warn('⚠️ Aucun fichier service account trouvé, initialisation avec projectId par défaut');
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'salon-fitness',
    });
  }
}

export const db = admin.firestore();
export const auth = admin.auth();