const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'mobile-app-464022'
});

async function testFirestore() {
  console.log('🔥 Testing Firestore connection...');
  
  try {
    const db = admin.firestore();
    console.log('✅ Firestore instance created');
    
    // Try to list collections
    console.log('📋 Listing collections...');
    const collections = await db.listCollections();
    console.log(`✅ Found ${collections.length} collections:`, collections.map(c => c.id));
    
    // Try to access apiKeys collection
    console.log('🔑 Testing apiKeys collection...');
    const apiKeysRef = db.collection('apiKeys');
    const snapshot = await apiKeysRef.limit(1).get();
    console.log(`✅ apiKeys collection accessible. Found ${snapshot.size} documents`);
    
    // Try to get specific document
    console.log('📄 Testing specific document...');
    const docRef = db.collection('apiKeys').doc('AIzaSyCXrXRvZjrMfIiC7oTjQ7D6rksbFT8Neaw');
    const doc = await docRef.get();
    console.log(`✅ Document query completed. Exists: ${doc.exists}`);
    
    if (doc.exists) {
      console.log('📝 Document data:', doc.data());
    }
    
  } catch (error) {
    console.error('❌ Firestore test failed:', error.message);
    console.error('🔍 Error details:', error);
  }
}

testFirestore().then(() => {
  console.log('🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});
