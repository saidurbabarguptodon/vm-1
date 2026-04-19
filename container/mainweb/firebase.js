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
// 5. HERO DOCUMENT (web/body/hero)
// ===============================
const heroDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('body').collection('hero').doc('content');
      const doc = await docRef.get();
      
      if (!doc.exists) {
        const emptyHero = {
          primaryText: "",
          secondaryText: "",
          footerText: "",
          buttonEnabled: false,
          buttonText: "",
          buttonIcon: "",
          buttonUrl: ""
        };
        await docRef.set(emptyHero);
        console.log(`✅ Hero document created at web/body/hero/content (empty structure)`);
      } else {
        console.log(`ℹ️ Hero document already exists at web/body/hero/content:`, doc.data());
      }
    } catch (err) {
      console.error("Error in hero.create:", err);
    }
  },

  async get() {
    try {
      const docRef = db.collection('web').doc('body').collection('hero').doc('content');
      const doc = await docRef.get();
      
      if (doc.exists) {
        return doc.data();
      } else {
        return {
          primaryText: "",
          secondaryText: "",
          footerText: "",
          buttonEnabled: false,
          buttonText: "",
          buttonIcon: "",
          buttonUrl: ""
        };
      }
    } catch (err) {
      console.error("Error in hero.get:", err);
      return {
        primaryText: "",
        secondaryText: "",
        footerText: "",
        buttonEnabled: false,
        buttonText: "",
        buttonIcon: "",
        buttonUrl: ""
      };
    }
  },

  async update(updates) {
    try {
      const docRef = db.collection('web').doc('body').collection('hero').doc('content');
      await docRef.update(updates);
      console.log(`✅ Hero document updated with:`, updates);
    } catch (err) {
      console.error("Error in hero.update:", err);
      throw err;
    }
  }
};

// ===============================
// 6. SIDEBAR DOCUMENTS (web/sidebar)
// ===============================
const sidebarDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();

      let isCreated = false;

      if (!doc.exists) {
        await docRef.set({
          header: { alticon: "", alttext: "", logourl: "" }
        });

        await docRef.collection('body').doc('navbutton-1').set({
          icon: "fa-solid fa-house",
          url: "/",
          text: "Home",
          description: "Your dashboard overview"
        });

        await docRef.collection('footer').doc('social-1').set({
          icon: "fa-brands fa-discord",
          url: "https://discord.com"
        });

        console.log(`✅ Sidebar document and subcollections created at web/sidebar`);
        isCreated = true;
      }

      if (!isCreated) {
        const bodyRef = docRef.collection('body');
        const bodyDocs = await bodyRef.orderBy(admin.firestore.FieldPath.documentId()).limit(1).get();
        
        let bodyData = {};
        if (!bodyDocs.empty) {
          const firstBodyDoc = bodyDocs.docs[0];
          bodyData[firstBodyDoc.id] = firstBodyDoc.data();
        }

        const footerRef = docRef.collection('footer');
        const footerDocs = await footerRef.orderBy(admin.firestore.FieldPath.documentId()).limit(1).get();
        
        let footerData = {};
        if (!footerDocs.empty) {
          const firstFooterDoc = footerDocs.docs[0];
          footerData[firstFooterDoc.id] = firstFooterDoc.data();
        }

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

  async getBody() {
    try {
      const snapshot = await db.collection('web').doc('sidebar').collection('body').orderBy(admin.firestore.FieldPath.documentId()).get();
      
      return snapshot.docs.map(doc => ({ 
        id: doc.id, 
        icon: doc.data().icon || "",
        url: doc.data().url || "#",
        text: doc.data().text || "Untitled",
        description: doc.data().description || ""
      }));
    } catch (err) {
      console.error("Error in sidebar.getBody:", err);
      return [];
    }
  },

  async getFooter() {
    try {
      const snapshot = await db.collection('web').doc('sidebar').collection('footer').orderBy(admin.firestore.FieldPath.documentId()).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("Error in sidebar.getFooter:", err);
      return [];
    }
  }
};

// ===============================
// 7. WRAPPER FUNCTIONS & EXPORTS
// ===============================

async function initializeFirestore() {
  await headerDoc.create();
  await heroDoc.create();
  await sidebarDoc.create();
}

async function getHeader() {
  return await headerDoc.get();
}

async function getHero() {
  return await heroDoc.get();
}

async function updateHero(updates) {
  return await heroDoc.update(updates);
}

async function getSidebar() {
  const header = await sidebarDoc.getHeader();
  const body = await sidebarDoc.getBody();
  const footer = await sidebarDoc.getFooter();
  
  return { header, body, footer }; 
}

module.exports = {
  initializeFirestore,
  getHeader,
  getHero,
  updateHero,
  getSidebar
};
