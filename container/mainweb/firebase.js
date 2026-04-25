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
      if (!doc.exists) await docRef.set(serverCache.header);
    } catch (err) { console.error(err); }
  }
};

const heroDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('body').collection('hero').doc('content');
      const doc = await docRef.get();
      if (!doc.exists) await docRef.set(serverCache.hero);
    } catch (err) { console.error(err); }
  }
};

const sidebarDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();
      
      if (!doc.exists) await docRef.set({ header: serverCache.sidebar.header });

      const bodySnapshot = await docRef.collection('body').get();
      if (bodySnapshot.empty) {
        await docRef.collection('body').doc('navbutton-1').set({ text: "Home", icon: "fa-solid fa-house", url: "/", description: "" });
        await docRef.collection('body').doc('navbutton-2').set({ text: "Features", icon: "fa-solid fa-star", url: "#features", description: "" });
      }

      const footerSnapshot = await docRef.collection('footer').get();
      if (footerSnapshot.empty) {
        await docRef.collection('footer').doc('social-1').set({ icon: "fa-brands fa-discord", url: "#" });
        await docRef.collection('footer').doc('social-2').set({ icon: "fa-brands fa-twitter", url: "#" });
      }
    } catch (err) { console.error(err); }
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
