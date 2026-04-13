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
  privateKey: FIREBASE_PRIVATE_KEY ? FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
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
        // Formatted exactly in the order requested
        await docRef.set({ alticon: "", alttext: "", logourl: "" });
        console.log(`✅ Header document created at web/header`);
      } else {
        console.log(`ℹ️ Header document already exists at web/header:`, doc.data());
      }
    } catch (err) {
      console.error("Error in header.create:", err);
    }
  },

  async get() {
    try {
      const docRef = db.collection('web').doc('header');
      const doc = await docRef.get();
      return doc.exists ? doc.data() : { alticon: "", alttext: "", logourl: "" };
    } catch (err) {
      console.error("Error in header.get:", err);
      return { alticon: "", alttext: "", logourl: "" };
    }
  }
};

// ===============================
// 5. SIDEBAR & FOOTER DOCUMENTS (web/sidebar)
// ===============================
const sidebarDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();
      
      // 1. Create the main sidebar header config
      if (!doc.exists) {
        await docRef.set({
          header: { alticon: "", alttext: "", logourl: "" }
        });
        console.log(`✅ Sidebar document created at web/sidebar`);
      } else {
        console.log(`ℹ️ Sidebar document already exists at web/sidebar:`, doc.data());
      }

      // 2. Initialize Footer Subcollection (for infinite documents)
      const footerRef = db.collection('web').doc('sidebar').collection('footer');
      const footerDocs = await footerRef.limit(1).get();
      if (footerDocs.empty) {
        await footerRef.doc('example_link').set({
          alticon: "fa-solid fa-shield-halved",
          alttext: "Privacy Policy",
          url: "#"
        });
        console.log(`✅ Sidebar footer subcollection initialized at web/sidebar/footer`);
      }

    } catch (err) {
      console.error("Error in sidebar.create:", err);
    }
  },

  async getHeader() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();
      if (doc.exists) {
        return doc.data().header || { alticon: "", alttext: "", logourl: "" };
      }
      return { alticon: "", alttext: "", logourl: "" };
    } catch (err) {
      console.error("Error in sidebar.getHeader:", err);
      return { alticon: "", alttext: "", logourl: "" };
    }
  },

  // 3. Retrieve all mapped documents inside the footer subcollection
  async getFooter() {
    try {
      const snapshot = await db.collection('web').doc('sidebar').collection('footer').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("Error in sidebar.getFooter:", err);
      return
