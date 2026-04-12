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
// 4. HEADER DOCUMENT (web/header)
// ===============================
const headerDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('header');
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set({ logourl: "", alticon: "", alttext: "" });
        console.log(`✅ Header document created at web/header`);
      } else {
        const data = doc.data();
        console.log(`ℹ️ Header document already exists at web/header:`, data);
      }
    } catch (err) {
      console.error("Error in header.create:", err);
    }
  },

  async get() {
    try {
      const docRef = db.collection('web').doc('header');
      const doc = await docRef.get();
      return doc.exists ? doc.data() : { logourl: "", alticon: "", alttext: "" };
    } catch (err) {
      console.error("Error in header.get:", err);
      return { logourl: "", alticon: "", alttext: "" };
    }
  }
};

// ===============================
// 5. HAMBURGER DOCUMENT (web/hamburger) with header map field
// ===============================
const hamburgerDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('hamburger');
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set({
          header: { logourl: "", alticon: "", alttext: "" }
        });
        console.log(`✅ Hamburger document created at web/hamburger with header map`);
      } else {
        const data = doc.data();
        console.log(`ℹ️ Hamburger document already exists at web/hamburger:`, data);
      }
    } catch (err) {
      console.error("Error in hamburger.create:", err);
    }
  },

  async get() {
    try {
      const docRef = db.collection('web').doc('hamburger');
      const doc = await docRef.get();
      if (doc.exists) {
        const data = doc.data();
        return data.header || { logourl: "", alticon: "", alttext: "" };
      }
      return { logourl: "", alticon: "", alttext: "" };
    } catch (err) {
      console.error("Error in hamburger.get:", err);
      return { logourl: "", alticon: "", alttext: "" };
    }
  }
};

// ===============================
// 6. INITIALIZE BOTH DOCUMENTS
// ===============================
async function initializeFirestore() {
  await headerDoc.create();
  await hamburgerDoc.create();
}

// ===============================
// 7. EXPORTS
// ===============================
module.exports = {
  initializeFirestore,
  getHeader: headerDoc.get,
  getHamburger: hamburgerDoc.get
};
