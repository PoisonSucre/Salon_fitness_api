
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../frontend/salon-fitness-firebase-adminsdk-fbsvc-3d8adf4681.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function migrate() {
  const configRef = db.collection('config').doc('main');
  const configSnap = await configRef.get();
  const oldVotingCoachs = configSnap.data().votingCoachs || [];

  const newVotingCoachs = [];

  for (const oldId of oldVotingCoachs) {
    const coachSnap = await db.collection('coaches').doc(oldId).get();
    if (!coachSnap.exists) {
      console.log(`Coach non trouvé: ${oldId}`);
      continue;
    }
    const coachData = coachSnap.data();
    const email = coachData.email;

    const userSnap = await db.collection('users').where('email', '==', email).get();
    if (userSnap.empty) {
      console.log(`User non trouvé pour email: ${email}`);
      continue;
    }

    const userId = userSnap.docs[0].id;
    newVotingCoachs.push(userId);
    console.log(`Migré: ${email} -> ${userId}`);
  }

  await configRef.update({ votingCoachs: newVotingCoachs });
  console.log('Migration terminée');
}

migrate();
