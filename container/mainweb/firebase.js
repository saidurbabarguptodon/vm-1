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
  // Added double backslash (\\n) so .env string newlines are parsed correctly
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

      // 2. Initialize Footer Subcollection (footer/social-1)
      const footerRef = db.collection('web').doc('sidebar').collection('footer');
      const footerDocs = await footerRef.limit(1).get();
      
      if (footerDocs.empty) {
        // UPDATED: Now creates social-1 with { icon, url }
        await footerRef.doc('social-1').set({
          icon: "fa-brands fa-twitter", // Example icon
          url: "https://twitter.com"
        });
        console.log(`✅ Sidebar footer subcollection initialized at web/sidebar/footer/social-1`);
      }
    } catch (err) {
      console.error("Error in sidebar.create:", err);
    }
  },

  async getHeader() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();
      if (doc.exists && doc.data().header) {
        return doc.data().header;
      }
      return { alticon: "", alttext: "", logourl: "" };
    } catch (err) {
      console.error("Error in sidebar.getHeader:", err);
      return { alticon: "", alttext: "", logourl: "" };
    }
  },

  async getFooter() {
    try {
      // Retrieves all social documents (social-1, social-2, etc.)
      const snapshot = await db.collection('web').doc('sidebar').collection('footer').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("Error in sidebar.getFooter:", err);
      return [];
    }
  }
};

// ===============================
// 6. WRAPPER FUNCTIONS & EXPORTS
// ===============================

// This creates the database structures automatically on startup
async function initializeFirestore() {
  await headerDoc.create();
  await sidebarDoc.create();
}

// Packages the header data to be exported to index.js
async function getHeader() {
  return await headerDoc.get();
}

// Combines the sidebar header and footer into one object for index.js
async function getSidebar() {
  const header = await sidebarDoc.getHeader();
  const footer = await sidebarDoc.getFooter();
  return { header, footer }; 
}

// Export everything so index.js can see them
module.exports = {
  initializeFirestore,
  getHeader,
  getSidebar
};
