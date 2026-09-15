# Salon du Fitness — API de Paiement & Notifications Push

Serveur backend Node.js/Express sécurisé pour la gestion des paiements Mobile Money (Orange Money, Moov Money, Wallet LigdiCash) et l'envoi de notifications push via Firebase Cloud Messaging / Expo Push API.

## Aperçu

Cette API fait le pont entre l'application mobile **Salon du Fitness** (Expo/React Native) et la passerelle de paiement **LigdiCash**. Elle gère :

- L'initiation et la vérification des paiements Mobile Money
- Le crédit automatique de "Flammes" (énergie virtuelle) dans Firestore
- Les callbacks de confirmation de LigdiCash
- L'envoi de notifications push aux utilisateurs et par rôle

## Stack technique

| Technologie | Rôle |
|-------------|------|
| **Node.js + Express 4** | Serveur HTTP |
| **TypeScript 7** | Typage statique |
| **tsx** | Exécution TypeScript en développement |
| **Firebase Admin SDK 13** | Authentification + Firestore |
| **LigdiCash API** | Passerelle de paiement Mobile Money |
| **Expo Push API** | Notifications push |
| **Helmet** | Sécurité des en-têtes HTTP |
| **express-rate-limit** | Limitation de débit (anti-abus) |

## Architecture du projet

```
server_paiement_salon/
├── index.ts                    # Point d'entrée Express + middleware globaux
├── config/
│   ├── firebase.ts             # Initialisation Firebase Admin (fichier ou env vars)
│   └── ligdicash.ts            # Clés API LigdiCash
├── routes/
│   ├── payInitiate.ts          # POST /api/pay/initiate — Initier un paiement
│   ├── payVerify.ts            # POST /api/pay/verify — Vérifier OTP & créditer
│   ├── confirm.ts              # POST /api/pay/confirm — Polling de statut
│   ├── callback.ts             # POST /api/callback — Callback LigdiCash
│   ├── status.ts               # GET /api/status/:token — Statut transaction
│   └── pushRoutes.ts           # POST /api/push/send & /api/push/send-role
├── services/
│   ├── ligdicashApi.ts         # Appels API LigdiCash (V1 & V2)
│   └── pushService.ts          # Envoi notifications push via Expo
├── middleware/
│   ├── authMiddleware.ts       # Auth Firebase (Bearer token) + rôles
│   └── errorHandler.ts         # Gestion centralisée des erreurs
├── utils/
│   └── packs.ts                # Définition des packs de Flammes + frais
├── scripts/
│   └── migrate-voting-coachs.js
└── .env                        # Configuration (voir ci-dessous)
```

## Endpoints API

### Paiement

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| `POST` | `/api/pay/initiate` | Initie un paiement (envoi OTP ou push USSD) | Non |
| `POST` | `/api/pay/verify` | Vérifie le code OTP et crédite les Flammes | Non |
| `POST` | `/api/pay/confirm` | Polling — vérifie le statut et crédite si complété | Non |
| `POST` | `/api/callback` | Callback webhook LigdiCash | Non |
| `GET` | `/api/status/:token` | Récupère le statut d'une transaction | Non |

### Notifications Push

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| `POST` | `/api/push/send` | Envoie un push à un utilisateur spécifique | Bearer token |
| `POST` | `/api/push/send-role` | Diffuse un push à tous les utilisateurs d'un rôle | Bearer token + Admin |

### Santé

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/health` | Vérification de l'état du serveur |

## Flux de paiement

### Flux 1 — Wallet LigdiCash (avec OTP)

```
Client → POST /api/pay/initiate (operator: "ligdicash")
       ← { token, status: "pending" }  (OTP envoyé par SMS)

Client → POST /api/pay/verify (token, otp)
       ← { status: "completed", flammes }  (Flammes créditées dans Firestore)
```

### Flux 2 — Orange Money (avec OTP)

```
Client → POST /api/pay/initiate (operator: "orange", otp)
       ← { token, status: "pending" }

LigdiCash → POST /api/callback (webhook)
          ← 200 OK  (Flammes créditées)

Client → POST /api/pay/confirm (token)  [polling de secours]
       ← { status: "completed", credited: true }
```

### Flux 3 — Moov Money (push USSD)

```
Client → POST /api/pay/initiate (operator: "moov")
       ← { token, status: "pending" }  (Client valide via *155#)

LigdiCash → POST /api/callback (webhook)
          ← 200 OK  (Flammes créditées)
```

## Sécurité

- **Helmet** : en-têtes HTTP de sécurité (CSP, XSS, etc.)
- **CORS** configurable via `FRONTEND_URL` (multi-domaines supportés)
- **Rate limiting** :
  - Global : 600 requêtes / 15 min
  - Paiement : 20 tentatives / 5 min
  - Push : 30 requêtes / 1 min
- **Auth Firebase** : vérification du Bearer token pour les routes push
- **Middleware Admin** : restriction des routes sensibles aux administrateurs
- **Trust proxy** : configuré pour Render / reverse proxy
- **Transactions atomiques Firestore** : empêche tout double-crédit (ACID)

## Configuration (.env)

```env
# Serveur
PORT=3000

# LigdiCash
LIGDICASH_API_KEY=your_api_key
LIGDICASH_AUTH_TOKEN=your_jwt_token

# Firebase
FIREBASE_PROJECT_ID=salon-fitness
FIREBASE_SERVICE_ACCOUNT_PATH=./path/to/service-account.json
# OU via variables d'environnement :
FIREBASE_CLIENT_EMAIL=your-client@email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# URL publique (pour les callbacks LigdiCash)
CALLBACK_BASE_URL=https://your-domain.com

# CORS — URLs du frontend séparées par des virgules
FRONTEND_URL=https://your-frontend.com,https://another-frontend.com

# Environnement
NODE_ENV=production
```

## Installation

```bash
# Cloner le repo
git clone git@github.com:PoisonSucre/Salon_fitness_api.git
cd Salon_fitness_api

# Installer les dépendances
npm install

# Copier et configurer l'environnement
cp .env.example .env
# Éditer .env avec vos clés

# Démarrer en développement
npm run dev

# Démarrer en production
npm start

# Compiler en JavaScript
npm run build
```

## Packs de Flammes

Les packs sont définis dans Firestore (collection `packs`) avec fallback sur des valeurs par défaut :

| Pack | Flammes | Prix (FCFA) | Frais (1.5%) | Total |
|------|---------|-------------|--------------|-------|
| small | 20 | 10 | ~0 | ~10 |
| medium | 60 | 10 | ~0 | ~10 |
| large | 150 | 10 | ~0 | ~10 |

> Le taux de frais est configurable dans Firestore (`config/salon.gatewayFeeRate`).
> **Note** : Moov Money impose un minimum de 100 FCFA par transaction.

## Structure Firestore

```
participant_energy/{userId}
├── balance: number              # Solde de Flammes
├── transactions: array          # Historique des achats
│   ├── type: "purchase"
│   ├── packId: string
│   ├── energy: number           # Flammes créditées
│   ├── amount: number           # Montant payé
│   ├── token: string            # Token de transaction
│   ├── phone: string
│   ├── operator: string
│   ├── callbackVerified?: boolean
│   ├── pollVerified?: boolean
│   └── createdAt: Date
├── createdAt: Date
└── updatedAt: Date

users/{uid}
├── pushToken / expoPushToken: string   # Token Expo pour les push
└── role: string                         # "admin" | "coach" | "participant"

callback_logs/{autoId}                   # Traçabilité des callbacks (tests validation)
├── receivedAt: Date
├── method: string
├── ip: string
├── contentType: string
├── headers: object
├── body: object                         # Payload brut reçu
├── outcome: string                      # "credited" | "already_processed" | "rejected_*" | "transaction_*" | "error_*"
└── respondedAt: Date
```

## Déploiement

### Render / Railway / VPS

1. Définir les variables d'environnement sur la plateforme
2. Commande de démarrage : `npm start`
3. URL publique à définir dans `CALLBACK_BASE_URL`
4. Configurer l'URL de callback dans le dashboard LigdiCash

### Avec ngrok (développement)

```bash
ngrok http 3000
# Utiliser l'URL ngrok comme CALLBACK_BASE_URL
```

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Démarrage en mode watch (tsx watch) |
| `npm start` | Démarrage production (tsx) |
| `npm run build` | Compilation TypeScript → JavaScript |

## Licence

Projet privé — © Salon du Fitness
