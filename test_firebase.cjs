const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const firebaseConfig = require('./firebase-applet-config.json');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    console.log('Testing Firestore connection...');
    const querySnapshot = await getDocs(collection(db, 'users'));
    console.log(`Success! Found ${querySnapshot.size} users.`);
    process.exit(0);
  } catch (error) {
    console.error('Firestore Error:', error.message);
    process.exit(1);
  }
}

test();
