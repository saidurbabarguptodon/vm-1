// ===============================
// 1. IMPORTS
// ===============================
const admin = require('firebase-admin');
require('dotenv').config();

// ===============================
// 2. LOAD ENVIRONMENT VARIABLES
// ===============================
const {
  FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_DATABASE_URL
} = process.env;

// ===============================
// 3. INITIALIZE FIREBASE ADMIN SDK
// ===============================
const serviceAccount = {
  projectId: FIREBASE_PROJECT_ID,
  privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  clientEmail: FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.firestore();

// ===============================
// 4. CREATE HEADER DOCUMENT (collection: "web", doc: "header")
// ===============================
async function createHeader() {
  try {
    const docRef = db.collection('web').doc('header');
    const doc = await docRef.get();

    if (!doc.exists) {
      await docRef.set({
        logourl: "",
        alticon: "",
        alttext: ""
      });
      console.log(`✅ Header created at web/header { logourl: "", alticon: "", alttext: "" }`);
    } else {
      const data = doc.data();
      console.log(`ℹ️ Header already exists { logourl: "${data.logourl}", alticon: "${data.alticon}", alttext: "${data.alttext}" }`);
    }
  } catch (err) {
    console.error("Error in createHeader:", err);
  }
}

// ===============================
// 5. GET HEADER FUNCTION
// ===============================
async function getHeader() {
  try {
    const docRef = db.collection('web').doc('header');
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (err) {
    console.error("Error in getHeader:", err);
  }
  return { logourl: "", alticon: "", alttext: "" };
}

// ===============================
// 6. EXPORTS
// ===============================
module.exports = { createHeader, getHeader };