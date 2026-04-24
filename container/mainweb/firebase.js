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
    buttonenabled: false, buttontext: "", buttonicon: "", buttonurl: ""
  },
  sidebar: {
    header: { alticon: "", alttext: "", logourl: "" },
    body: [],
    footer:[]
  }
};

const getCacheSize = (obj) => `${Buffer.byteLength(JSON.stringify(obj), 'utf8')} bytes`;

// ===============================
// 5. DOCUMENT CREATORS
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
        console.log(`ℹ️ Header document already exists at web/header:\n${JSON.stringify(doc.data(), null, 2)}`);
      }
    } catch (err) {
      console.error("Error in header.create:", err);
    }
  }
};

const heroDoc = {
  _defaultFields: {
    primarytext: "",
    secondarytext: "",
    footertext: "",
    buttonenabled: false,
    buttontext: "",
    buttonicon: "",
    buttonurl: ""
  },

  async create() {
    try {
      const docRef = db.collection('web').doc('body').collection('hero').doc('content');
      const doc = await docRef.get();
      
      if (!doc.exists) {
        await docRef.set(this._defaultFields);
        console.log(`✅ Hero document created at web/body/hero/content with lowercase fields`);
      } else {
        console.log(`ℹ️ Hero document already exists at web/body/hero/content:\n${JSON.stringify(doc.data(), null, 2)}`);
      }
    } catch (err) {
      console.error("Error in hero.create:", err);
    }
  }
};

const sidebarDoc = {
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

        console.log(`ℹ️ Sidebar document already exists at web/sidebar:\n${JSON.stringify(combinedLogObject, null, 2)}`);
      }

    } catch (err) {
      console.error("Error in sidebar.create:", err);
    }
  }
};

// ===============================
// 6. REAL-TIME LISTENERS
// ===============================
function startRealtimeListeners() {
  console.log("\n📡 Starting DB Listeners...");

  db.collection('web').doc('header').onSnapshot(doc => {
    if (doc.exists) {
      serverCache.header = doc.data();
      console.log(`🔄 Cache Updated:[Header size:${getCacheSize(serverCache.header)}]\n${JSON.stringify(serverCache.header, null, 2)}`);
    }
  });

  db.collection('web').doc('body').collection('hero').doc('content').onSnapshot(doc => {
    if (doc.exists) {
      serverCache.hero = doc.data();
      console.log(`🔄 Cache Updated: [Bodysize:${getCacheSize(serverCache.hero)}]\n${JSON.stringify(serverCache.hero, null, 2)}`);
    }
  });

  db.collection('web').doc('sidebar').onSnapshot(doc => {
    if (doc.exists && doc.data().header) {
      serverCache.sidebar.header = doc.data().header;
      console.log(`🔄 Cache Updated: [Sidebarsize:${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`);
    }
  });

  db.collection('web').doc('sidebar').collection('body').onSnapshot(snapshot => {
    serverCache.sidebar.body = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`🔄 Cache Updated:[Sidebarsize:${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`);
  });

  db.collection('web').doc('sidebar').collection('footer').onSnapshot(snapshot => {
    serverCache.sidebar.footer = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`🔄 Cache Updated:[Sidebarsize:${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`);
  });
}

// ===============================
// 7. WRAPPER FUNCTIONS & EXPORTS
// ===============================
async function initializeFirestore() {
  await headerDoc.create();
  await heroDoc.create();
  await sidebarDoc.create();
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
