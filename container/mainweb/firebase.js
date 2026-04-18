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
// 5. SIDEBAR DOCUMENTS (web/sidebar)
// ===============================
const sidebarDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();

      let isCreated = false;

      // 1. Check if the main sidebar document exists
      if (!doc.exists) {
        // Create Sidebar Header Parent
        await docRef.set({
          header: { alticon: "", alttext: "", logourl: "" }
        });

        // ✦ SEED DEFAULT NAV BUTTON (navbutton-1) ✦
        // This exactly matches your structure: sidebar/body/navbutton-1
        await docRef.collection('body').doc('navbutton-1').set({
          icon: "fa-solid fa-house",
          url: "/",
          text: "Home"
        });

        // ✦ SEED DEFAULT SOCIAL BUTTON (social-1) ✦
        await docRef.collection('footer').doc('social-1').set({
          icon: "fa-brands fa-discord",
          url: "https://discord.com"
        });

        console.log(`✅ Sidebar document and subcollections created at web/sidebar`);
        isCreated = true;
      }

      // 2. Build the exact console log for existing documents
      if (!isCreated) {
        // --- Fetch the BODY subcollection (e.g., navbutton-1) ---
        const bodyRef = docRef.collection('body');
        const bodyDocs = await bodyRef.orderBy(admin.firestore.FieldPath.documentId()).limit(1).get();
        
        let bodyData = {};
        if (!bodyDocs.empty) {
          const firstBodyDoc = bodyDocs.docs[0];
          bodyData[firstBodyDoc.id] = firstBodyDoc.data();
        }

        // --- Fetch the FOOTER subcollection (e.g., social-1) ---
        const footerRef = docRef.collection('footer');
        const footerDocs = await footerRef.orderBy(admin.firestore.FieldPath.documentId()).limit(1).get();
        
        let footerData = {};
        if (!footerDocs.empty) {
          const firstFooterDoc = footerDocs.docs[0];
          footerData[firstFooterDoc.id] = firstFooterDoc.data();
        }

        // Combine header, body, and footer into one single object for the log
        const combinedLogObject = {
          header: doc.data().header,
          body: bodyData,
          footer: footerData
        };

        console.log(`ℹ️ Sidebar document already exists at web/sidebar:`, combinedLogObject);
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

  // ✦ FETCH ALL SIDEBAR BODY DOCUMENTS ✦
  // Fetches navbutton-1, navbutton-2, etc.
  async getBody() {
    try {
      // Order by document ID so navbutton-1 comes before navbutton-2 automatically
      const snapshot = await db.collection('web').doc('sidebar').collection('body').orderBy(admin.firestore.FieldPath.documentId()).get();
      
      // Explicitly map icon, url, and text based on your required structure
      return snapshot.docs.map(doc => ({ 
        id: doc.id, 
        icon: doc.data().icon || "",
        url: doc.data().url || "#",
        text: doc.data().text || "Untitled"
      }));
    } catch (err) {
      console.error("Error in sidebar.getBody:", err);
      return[]; // Return empty array if error occurs
    }
  },

  // Fetch all sidebar footer documents (social-1, social-2, etc.)
  async getFooter() {
    try {
      // Order by document ID so social-1 comes before social-2 automatically
      const snapshot = await db.collection('web').doc('sidebar').collection('footer').orderBy(admin.firestore.FieldPath.documentId()).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("Error in sidebar.getFooter:", err);
      return
