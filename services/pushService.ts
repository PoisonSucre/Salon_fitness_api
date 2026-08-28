// services/pushService.ts
// Service d'envoi de notifications push via Expo Push API pour le Salon du Fitness.
// Lit le pushToken depuis Firestore (users/{uid}.pushToken ou participants/{uid}.pushToken)
// et transmet la notification à Expo Push API.

import { db } from '../config/firebase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/send';

const log = (type: string, message: string, data?: any): void => {
  const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  console.log(`[PUSH:${type}] ${timestamp} - ${message}`, data ? JSON.stringify(data) : '');
};

interface PushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: any;
}

/**
 * Récupère le pushToken d'un utilisateur / participant depuis Firestore.
 */
export const getPushToken = async (uid: string): Promise<string | null> => {
  try {
    // 1. Chercher dans la collection 'users'
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const token = userDoc.data()?.pushToken || userDoc.data()?.expoPushToken;
      if (token && typeof token === 'string' && token.trim() !== '') {
        return token;
      }
    }

    // 2. Chercher dans la collection 'participants' ou 'coaches'
    const participantDoc = await db.collection('participants').doc(uid).get();
    if (participantDoc.exists) {
      const token = participantDoc.data()?.pushToken || participantDoc.data()?.expoPushToken;
      if (token && typeof token === 'string' && token.trim() !== '') {
        return token;
      }
    }

    log('TOKEN', 'Aucun pushToken trouvé pour cet identifiant', { uid });
    return null;
  } catch (error) {
    log('TOKEN_ERROR', 'Erreur lors de la lecture du pushToken', { uid, error: String(error) });
    return null;
  }
};

/**
 * Envoie un push à un token Expo individuel.
 */
export const sendToToken = async (
  token: string,
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<boolean> => {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data: data || {},
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }),
    });

    const result = await response.json();
    const tickets: PushTicket[] = result?.data || [];
    const hasError = tickets.some((t) => t.status === 'error');

    if (hasError) {
      log('EXPO_ERROR', 'Erreur retournée par Expo Push API', { tickets });
      return false;
    }

    return true;
  } catch (error) {
    log('SEND_ERROR', 'Erreur réseau lors de l\'envoi du push', { error: String(error) });
    return false;
  }
};

/**
 * Envoie une notification push à un utilisateur spécifique.
 */
export const sendPushToUser = async (
  uid: string,
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<boolean> => {
  const token = await getPushToken(uid);
  if (!token) return false;

  log('SEND', 'Envoi push utilisateur', { uid, title });
  return sendToToken(token, title, body, data);
};

/**
 * Envoie une notification push à tous les utilisateurs d'un rôle (ex: 'coach', 'participant', 'admin').
 */
export const sendPushToRole = async (
  role: string,
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<number> => {
  try {
    const snapshot = await db.collection('users').where('role', '==', role).get();
    const tokens: string[] = [];

    snapshot.forEach((doc) => {
      const token = doc.data()?.pushToken || doc.data()?.expoPushToken;
      if (token && typeof token === 'string' && token.trim() !== '') {
        tokens.push(token);
      }
    });

    if (tokens.length === 0) {
      log('ROLE', 'Aucun token push trouvé pour ce rôle', { role });
      return 0;
    }

    log('ROLE_SEND', `Envoi push à ${tokens.length} utilisateur(s) du rôle ${role}`, { title });

    let sentCount = 0;
    const batchSize = 100;

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const messages = batch.map((to) => ({
        to,
        title,
        body,
        data: data || {},
        sound: 'default',
        priority: 'high',
      }));

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(messages),
        });

        const result = await response.json();
        const tickets: PushTicket[] = result?.data || [];
        sentCount += tickets.filter((t) => t.status === 'ok').length;
      } catch (err) {
        log('ROLE_BATCH_ERROR', 'Erreur lors de l\'envoi du batch', { batchIndex: i, error: String(err) });
      }
    }

    return sentCount;
  } catch (error) {
    log('ROLE_ERROR', 'Erreur lors de l\'envoi push par rôle', { role, error: String(error) });
    return 0;
  }
};

export default {
  sendPushToUser,
  sendPushToRole,
  sendToToken,
  getPushToken,
};
