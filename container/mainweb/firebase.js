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
// 4. IN-MEMORY CACHE
// ===============================
const serverCache = {
  header: { alticon: "", alttext: "", logourl: "" },
  hero: {
    primarytext: "", secondarytext: "", footertext: "",
    buttonenabled: false, buttontext: "", buttonicon: "", buttonurl: "", hashpath: ""
  },
  sidebar: {
    header: { alticon: "", alttext: "", logourl: "" },
    body: [],
    footer:[]
  }
};

const getCacheSize = (obj) => `${Buffer.byteLength(JSON.stringify(obj), 'utf8')} bytes`;

// ===============================
// 5. HEADER MANAGER
// ===============================
const headerManager = {
  async create() {
    try {
      const docRef = db.collection('web').doc('header');
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set({ alticon: "", alttext: "", logourl: "" });
        console.log(`✅ Header document created successfully at web/header`);
      } else {
        console.log(`✅ Success! Header document already exists at web/header. Data:\n${JSON.stringify(doc.data(), null, 2)}`);
      }
    } catch (err) {
      console.error("Error in headerManager.create:", err);
    }
  }
};

// ===============================
// 6. BODY HERO MANAGER
// ===============================
const bodyHeroManager = {
  _defaultHeroMap: {
    primarytext: "",
    secondarytext: "",
    footertext: "",
    buttonenabled: false,
    buttontext: "",
    buttonicon: "",
    buttonurl: "",
    hashpath: ""
  },

  async create() {
    try {
      // The document is 'body', the map field inside it is 'hero'
      const docRef = db.collection('web').doc('body');
      const doc = await docRef.get();
      
      if (!doc.exists || !doc.data().hero) {
        // We use merge: true so we don't accidentally overwrite other potential fields in 'body'
        await docRef.set({ hero: this._defaultHeroMap }, { merge: true });
        console.log(`✅ Body Hero map created successfully at web/body with lowercase fields`);
      } else {
        console.log(`✅ Success! Body Hero map already exists at web/body:\n${JSON.stringify(doc.data().hero, null, 2)}`);
      }
    } catch (err) {
      console.error("Error in bodyHeroManager.create:", err);
    }
  }
};

// ===============================
// 7. SIDEBAR MANAGER
// ===============================
const sidebarManager = {
  async create() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();

      if (!doc.exists) {
        await docRef.set({
          header: { alticon: "", alttext: "", logourl: "" }
        });
        console.log(`✅ Sidebar document created at web/sidebar (empty body and footer subcollections)`);
      } else {
        const bodySnapshot = await docRef.collection('body').orderBy(admin.firestore.FieldPath.documentId()).get();
        let bodyData = {};
        bodySnapshot.docs.forEach(doc => {
          bodyData[doc.id] = doc.data();
        });

        const footerSnapshot = await docRef.collection('footer').orderBy(admin.firestore.FieldPath.documentId()).get();
        let footerData = {};
        footerSnapshot.docs.forEach(doc => {
          footerData[doc.id] = doc.data();
        });

        const combinedLogObject = {
          header: doc.data().header,
          body: bodyData,
          footer: footerData
        };

        console.log(`✅ Success! Sidebar document already exists at web/sidebar:\n${JSON.stringify(combinedLogObject, null, 2)}`);
      }

    } catch (err) {
      console.error("Error in sidebarManager.create:", err);
    }
  }
};

// ===============================
// 8. REAL-TIME LISTENERS
// ===============================
function startRealtimeListeners() {
  console.log("\n📡 Starting DB Listeners...");

  // Header Listener
  db.collection('web').doc('header').onSnapshot(doc => {
    if (doc.exists) {
      serverCache.header = doc.data();
      console.log(`🔄 Cache Updated:[Header size:${getCacheSize(serverCache.header)}]\n${JSON.stringify(serverCache.header, null, 2)}`);
    }
  });

  // Body Hero Map Listener (Updated to look for the 'hero' map field in the 'body' document)
  db.collection('web').doc('body').onSnapshot(doc => {
    if (doc.exists && doc.data().hero) {
      serverCache.hero = doc.data().hero;
      console.log(`🔄 Cache Updated: [Body hero size:${getCacheSize(serverCache.hero)}]\n${JSON.stringify(serverCache.hero, null, 2)}`);
    }
  });

  // Sidebar Header Listener
  db.collection('web').doc('sidebar').onSnapshot(doc => {
    if (doc.exists && doc.data().header) {
      serverCache.sidebar.header = doc.data().header;
      console.log(`🔄 Cache Updated:[Sidebar size:${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`);
    }
  });

  // Sidebar Body Subcollection Listener
  db.collection('web').doc('sidebar').collection('body').onSnapshot(snapshot => {
    serverCache.sidebar.body = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`🔄 Cache Updated:[Sidebar size:${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`);
  });

  // Sidebar Footer Subcollection Listener
  db.collection('web').doc('sidebar').collection('footer').onSnapshot(snapshot => {
    serverCache.sidebar.footer = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`🔄 Cache Updated: [Sidebar size:${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`);
  });
}

// ===============================
// 9. WRAPPER FUNCTIONS & EXPORTS
// ===============================
async function initializeFirestore() {
  await headerManager.create();
  await bodyHeroManager.create();
  await sidebarManager.create();
  startRealtimeListeners();
}

async function getHeader() { return serverCache.header; }
async function getHero() { return serverCache.hero; }
async function getSidebar() { return serverCache.sidebar; }

module.exports = {
  initializeFirestore,
  getHeader,
  getHero,
  getSidebar
};
