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
// 4. IN-MEMORY CACHE (Saves DB Reads!)
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

// ===============================
// 5. DOCUMENT CREATORS (Run once on startup)
// ===============================
const headerDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('header');
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set(serverCache.header);
        console.log(`✅ Header document created`);
      } else {
        console.log(`ℹ️ Header document already exists`);
      }
    } catch (err) { console.error("Error in header.create:", err); }
  }
};

const heroDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('body').collection('hero').doc('content');
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set(serverCache.hero);
        console.log(`✅ Hero document created`);
      } else {
        console.log(`ℹ️ Hero document already exists`);
      }
    } catch (err) { console.error("Error in hero.create:", err); }
  }
};

const sidebarDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set({ header: serverCache.sidebar.header });
        console.log(`✅ Sidebar document created`);
      } else {
        console.log(`ℹ️ Sidebar document already exists`);
      }
    } catch (err) { console.error("Error in sidebar.create:", err); }
  }
};

// ===============================
// 6. REAL-TIME LISTENERS (Updates Cache automatically)
// ===============================
function startRealtimeListeners() {
  console.log("📡 Starting Firebase Real-Time Listeners...");

  // Listen to Header updates
  db.collection('web').doc('header').onSnapshot(doc => {
    if (doc.exists) {
      serverCache.header = doc.data();
      console.log("🔄 Cache Updated: [Header]");
    }
  }, err => console.error("Header listen error:", err));

  // Listen to Hero updates
  db.collection('web').doc('body').collection('hero').doc('content').onSnapshot(doc => {
    if (doc.exists) {
      serverCache.hero = doc.data();
      console.log("🔄 Cache Updated: [Hero]");
    }
  }, err => console.error("Hero listen error:", err));

  // Listen to Sidebar Header updates
  db.collection('web').doc('sidebar').onSnapshot(doc => {
    if (doc.exists && doc.data().header) {
      serverCache.sidebar.header = doc.data().header;
      console.log("🔄 Cache Updated:[Sidebar Header]");
    }
  }, err => console.error("Sidebar listen error:", err));

  // Listen to Sidebar Body updates
  db.collection('web').doc('sidebar').collection('body').onSnapshot(snapshot => {
    serverCache.sidebar.body = snapshot.docs.map(doc => ({
      id: doc.id,
      icon: doc.data().icon || "",
      url: doc.data().url || "#",
      text: doc.data().text || "Untitled",
      description: doc.data().description || ""
    }));
    console.log("🔄 Cache Updated: [Sidebar Body]");
  }, err => console.error("Sidebar Body listen error:", err));

  // Listen to Sidebar Footer updates
  db.collection('web').doc('sidebar').collection('footer').onSnapshot(snapshot => {
    serverCache.sidebar.footer = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log("🔄 Cache Updated: [Sidebar Footer]");
  }, err => console.error("Sidebar Footer listen error:", err));
}

// ===============================
// 7. WRAPPER FUNCTIONS & EXPORTS
// ===============================

async function initializeFirestore() {
  // 1. Ensure structural docs exist on boot
  await headerDoc.create();
  await heroDoc.create();
  await sidebarDoc.create();
  
  // 2. Attach listeners to constantly keep serverCache updated
  startRealtimeListeners();
}

// 🚀 These now fetch instantly from RAM (0 database reads on page refresh!)
async function getHeader() {
  return serverCache.header;
}

async function getHero() {
  return serverCache.hero;
}

async function getSidebar() {
  return serverCache.sidebar; 
}

module.exports = {
  initializeFirestore,
  getHeader,
  getHero,
  getSidebar
};
