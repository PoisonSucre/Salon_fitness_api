import { db } from '../config/firebase';
import admin from 'firebase-admin';

export interface Pack {
  id: string;
  flammes: number;
  price: number;
  popular?: boolean;
  order?: number;
}

export interface PackWithFee extends Pack {
  fee: number;
  total: number;
  _feeRate: number;
}

export const DEFAULT_GATEWAY_FEE_RATE = 0.015;

const DEFAULT_PACKS: Record<string, Pack> = {
  small: { id: 'small', flammes: 20, price: 10 },
  medium: { id: 'medium', flammes: 60, price: 10, popular: true },
  large: { id: 'large', flammes: 150, price: 10 },
};

async function getPacksFromFirestore(): Promise<Record<string, Pack> | null> {
  try {
    const snapshot = await db.collection('packs').orderBy('order', 'asc').get();
    if (snapshot.empty) return null;
    const packs: Record<string, Pack> = {};
    snapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      packs[doc.id] = { id: doc.id, ...doc.data() } as Pack;
    });
    return packs;
  } catch {
    return null;
  }
}

async function getGatewayFeeFromFirestore(): Promise<number> {
  try {
    const doc = await db.collection('config').doc('salon').get();
    if (doc.exists && typeof doc.data()?.gatewayFeeRate === 'number') {
      return doc.data()!.gatewayFeeRate as number;
    }
    return DEFAULT_GATEWAY_FEE_RATE;
  } catch {
    return DEFAULT_GATEWAY_FEE_RATE;
  }
}

export async function getPack(packId: string): Promise<Pack | null> {
  const firestorePacks = await getPacksFromFirestore();
  const packs = firestorePacks || DEFAULT_PACKS;
  return packs[packId] || null;
}

export async function getTotalWithFee(packId: string): Promise<PackWithFee | null> {
  const firestorePacks = await getPacksFromFirestore();
  const packs = firestorePacks || DEFAULT_PACKS;
  const pack = packs[packId];
  if (!pack) return null;
  const feeRate = await getGatewayFeeFromFirestore();
  const fee = Math.round(pack.price * feeRate);
  return {
    ...pack,
    fee,
    total: pack.price + fee,
    _feeRate: feeRate,
  };
}