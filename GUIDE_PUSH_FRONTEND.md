# 📲 Guide d'Intégration des Notifications Push pour le Frontend du Salon du Fitness

Ce guide explique comment configurer et utiliser les notifications push dans l'application mobile React Native / Expo du **Salon du Fitness**, à l'identique de l'architecture éprouvée de **Fidelix**.

---

## 🛠️ 1. Installation des dépendances (dans le projet Frontend)

Dans le dossier de votre application frontend mobile :

```bash
npx expo install expo-notifications expo-device
```

---

## 🔑 2. Service d'enregistrement du Push Token (`pushNotificationService.ts`)

Créez ce fichier dans votre frontend sous `services/notifications/pushNotificationService.ts` :

```typescript
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../config/firebaseConfig'; // Adapter selon vos imports

// Configuration du comportement des notifications reçues au premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * 1. Demande les permissions et enregistre le pushToken Expo dans Firestore
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Permission de notifications push refusée par l\'utilisateur.');
      return null;
    }

    try {
      // Récupération du token Expo Push
      const pushTokenData = await Notifications.getExpoPushTokenAsync();
      token = pushTokenData.data;
      console.log('✅ Push Token Expo obtenu :', token);

      // Sauvegarde dans Firestore pour l'utilisateur connecté
      const currentUser = auth.currentUser;
      if (currentUser && token) {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, { pushToken: token, updatedAt: new Date() }, { merge: true });
        console.log('✅ Push token synchronisé sur Firestore (users/' + currentUser.uid + ')');
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du pushToken :', error);
    }
  } else {
    console.log('Les notifications push nécessitent un appareil physique (ou émulateur configuré).');
  }

  return token;
}
```

---

## 📡 3. Service d'appel vers le serveur de paiement (`apiClient.ts` ou service push)

Pour déclencher des push depuis le frontend ou les envoyer à des rôles spécifiques via le serveur :

```typescript
import axios from 'axios';

const SERVER_URL = process.env.EXPO_PUBLIC_SALON_PAYMENT_URL || 'http://localhost:3000';

export interface PushMessageData {
  type: string;
  [key: string]: any;
}

/**
 * Envoie une notification push à un utilisateur précis (via son uid)
 */
export async function sendPushToUser(
  uid: string,
  title: string,
  body: string,
  data?: PushMessageData
): Promise<boolean> {
  try {
    const response = await axios.post(`${SERVER_URL}/api/push/send`, {
      uid,
      title,
      body,
      data: data || {},
    });
    return response.data?.success === true;
  } catch (error) {
    console.error('Erreur sendPushToUser :', error);
    return false;
  }
}

/**
 * Envoie une notification push à tous les utilisateurs d'un rôle (ex: 'coach', 'admin')
 */
export async function sendPushToRole(
  role: string,
  title: string,
  body: string,
  data?: PushMessageData
): Promise<number> {
  try {
    const response = await axios.post(`${SERVER_URL}/api/push/send-role`, {
      role,
      title,
      body,
      data: data || {},
    });
    return response.data?.sentCount || 0;
  } catch (error) {
    console.error('Erreur sendPushToRole :', error);
    return 0;
  }
}
```

---

## 🚀 4. Initialisation dans votre `App.tsx` ou `_layout.tsx`

Ajoutez ce hook dans le composant racine ou la page d'accueil de l'application :

```tsx
import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from './services/notifications/pushNotificationService';

export default function RootLayout() {
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    // 1. Demande de permission et enregistrement du token
    registerForPushNotificationsAsync();

    // 2. Écoute des notifications reçues lorsque l'app est au premier plan
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notification reçue en direct :', notification.request.content);
    });

    // 3. Écoute du clic sur la notification (quand l'utilisateur clique dessus)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('👆 Clic sur la notification, données associées :', data);

      // Rediriger vers l'écran concerné selon le type (ex: achat validé, nouveau message)
      if (data?.type === 'energy_purchased') {
        // router.push('/profile/energy');
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return (
    // Vos composants / navigation ici
    <></>
  );
}
```

---

## 🎯 5. Notifications automatiques déjà activées côté serveur

Dès qu'un achat de Flammes / Énergie est validé (via **Orange Money**, **Moov Money** ou **Wallet LigdiCash**), le serveur envoie **automatiquement** une notification push au client sans aucune action supplémentaire requise de votre part :

- 🔔 **Titre** : `Achat de Flammes réussi ! 🔥` ou `Paiement validé ! 🔥`
- 💬 **Message** : `Votre compte a été crédité de X Flammes (Y FCFA).`
- 📦 **Data** : `{ type: 'energy_purchased', flammes: X, amount: Y, packId: '...' }`
