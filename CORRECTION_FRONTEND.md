# 🛠️ Guide de Correction Frontend pour le Salon du Fitness (Paiements Moov Money & Wallet LigdiCash)

Ce document résume les modifications et bonnes pratiques à intégrer dans le **Frontend du Salon du Fitness** pour que les paiements **Moov Money**, **Orange Money** et **Wallet LigdiCash** fonctionnent exactement comme sur **Fidelix**.

---

## 📌 1. Vue d'ensemble des flux de paiement

| Méthode de paiement | Champ `operator` | Saisie requise dans le formulaire | Déroulement du paiement |
| :--- | :--- | :--- | :--- |
| **Orange Money** | `'orange'` | Numéro de téléphone + **Code OTP** (obtenu via `*144*4*6*montant#`) | L'OTP est envoyé dès l'initiation (`/api/pay/initiate`). Aucun modal secondaire requis si l'OTP est déjà saisi. |
| **Moov Money** | `'moov'` | Numéro de téléphone uniquement | Le serveur initie la requête. Le client reçoit un **push USSD** sur son téléphone ou compose `*155#` pour valider avec son code secret. Le front fait du polling sur `/api/pay/confirm`. |
| **Wallet LigdiCash** | `'ligdicash'` | Numéro de téléphone du compte LigdiCash | **Étape 1 :** L'initiation déclenche l'envoi d'un OTP par SMS / App LigdiCash.<br>**Étape 2 :** Le frontend ouvre une boîte de dialogue pour saisir l'OTP et appelle `/api/pay/verify`. |

---

## 💰 2. Règle essentielle : Montant Minimum Moov Money (100 FCFA)

- **Moov Money / LigdiCash** impose un montant minimum de **100 FCFA** par transaction.
- Si un pack vaut moins de 100 FCFA (ex: 10 FCFA ou 50 FCFA) :
  - Soit bloquer/masquer l'option Moov Money pour ce pack dans l'interface,
  - Soit afficher une alerte claire au client : *"Le montant minimum pour Moov Money est de 100 FCFA. Veuillez choisir Orange Money ou un pack supérieur."*

---

## 💻 3. Code TypeScript / JavaScript pour le Frontend du Salon

Voici l'implémentation complète recommandée pour votre service de paiement ou composant Checkout dans l'application Frontend du Salon :

```typescript
import axios from 'axios';

// URL du serveur de paiement salon (ex: https://votre-serveur-salon.onrender.com ou ngrok)
const PAYMENT_SERVER_URL = process.env.EXPO_PUBLIC_SALON_PAYMENT_URL || 'http://localhost:3000';

export interface PaymentParams {
  userId: string;
  packId: string;
  phone: string;
  operator: 'orange' | 'moov' | 'ligdicash';
  otp?: string; // Requis uniquement pour Orange Money à l'étape 1
}

/**
 * 1. Initialiser le paiement
 */
export async function initiateSalonPayment(params: PaymentParams) {
  try {
    const response = await axios.post(`${PAYMENT_SERVER_URL}/api/pay/initiate`, {
      userId: params.userId,
      packId: params.packId,
      phone: params.phone,
      operator: params.operator,
      otp: params.operator === 'orange' ? params.otp : undefined,
    });

    return response.data; // { token, message, status: 'pending', expiresIn }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || 'Erreur lors de l\'initialisation du paiement';
    throw new Error(errorMsg);
  }
}

/**
 * 2. Vérifier l'OTP pour le Wallet LigdiCash (Étape 2)
 */
export async function verifyWalletOtp(token: string, otp: string, userId: string, packId: string) {
  try {
    const response = await axios.post(`${PAYMENT_SERVER_URL}/api/pay/verify`, {
      token,
      otp,
      userId,
      packId,
    });

    return response.data; // { status: 'completed', flammes, transactionId }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || 'Code OTP invalide ou expiré';
    throw new Error(errorMsg);
  }
}

/**
 * 3. Polling de confirmation (Pour Moov Money et Orange Money)
 * Interroge le serveur toutes les 3 secondes jusqu'à validation par le client
 */
export async function pollPaymentConfirmation(
  token: string,
  userId: string,
  onStatusUpdate?: (status: string) => void,
  maxAttempts: number = 40 // 40 x 3s = 2 minutes max
): Promise<{ success: boolean; flammes?: number; error?: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.post(`${PAYMENT_SERVER_URL}/api/pay/confirm`, {
        token,
        userId,
      });

      if (response.data?.status === 'completed' && response.data?.credited) {
        return { success: true, flammes: response.data.flammes };
      }

      if (onStatusUpdate) {
        onStatusUpdate(response.data?.status || 'pending');
      }
    } catch (error) {
      console.warn(`[Polling] Tentative ${attempt + 1}/${maxAttempts} en attente...`);
    }

    // Attendre 3 secondes avant la tentative suivante
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error('Délai d\'attente dépassé. Si vous avez été débité, vos flammes seront créditées automatiquement sous peu.');
}
```

---

## 📱 4. Logique du flux utilisateur dans l'écran de paiement

```typescript
async function handlePaymentSubmit() {
  setLoading(true);
  try {
    // 1. Initiation
    const initResult = await initiateSalonPayment({
      userId: currentUser.uid,
      packId: selectedPack.id,
      phone: phoneNumber,
      operator: selectedOperator, // 'orange' | 'moov' | 'ligdicash'
      otp: orangeOtpValue, // si orange
    });

    const token = initResult.token;

    // 2. Gestion selon l'opérateur
    if (selectedOperator === 'ligdicash') {
      // Afficher le modal de saisie du code OTP reçu par SMS/LigdiCash
      setSessionToken(token);
      setShowOtpModal(true);
    } else if (selectedOperator === 'moov' || selectedOperator === 'orange') {
      // Afficher un loader avec message : "Veuillez valider sur votre téléphone..."
      setShowWaitingModal(true);
      const result = await pollPaymentConfirmation(token, currentUser.uid);
      if (result.success) {
        showSuccessScreen(`Bravo ! Vous avez reçu ${result.flammes} Flammes.`);
      }
    }
  } catch (error: any) {
    showAlert('Erreur de paiement', error.message);
  } finally {
    setLoading(false);
  }
}
```
