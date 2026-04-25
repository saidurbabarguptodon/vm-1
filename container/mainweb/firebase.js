// =============================== // 1. IMPORTS // ===============================
const admin = require('firebase-admin');
require('dotenv').config();

// =============================== // 2. LOAD ENVIRONMENT VARIABLES // ===============================
const { 
  FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY, 
  FIREBASE_CLIENT_EMAIL, 
  FIREBASE_DATABASE_URL 
} = process.env;

// =============================== // 3. INITIALIZE FIREBASE ADMIN SDK // ===============================
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

// =============================== // 4. IN-MEMORY CACHE // ===============================
const serverCache = { 
  header: {}, 
  hero: {}, 
  sidebar: { header: {}, body: [], footer:[] } 
};

const getCacheSize = (obj) => `${Buffer.byteLength(JSON.stringify(obj), 'utf8')} bytes`;


// =============================== // 5. HEADER DOC // ===============================
const headerData = {
  alticon: "",
  alttext: "",
  logourl: ""
};

serverCache.header = { ...headerData };

const headerDoc = { 
  async create() { 
    try { 
      const docRef = db.collection('web').doc('header'); 
      const doc = await docRef.get(); 
      
      // Smart merge: adds missing default fields without deleting existing data
      const existingData = doc.exists ? doc.data() : {};
      await docRef.set({ ...headerData, ...existingData }, { merge: true }); 
    } catch (err) {
      console.error(err); 
    } 
  } 
};


// =============================== // 6. SIDEBAR DOC // ===============================
const sidebarHeaderData = {
  alticon: "",
  alttext: "",
  logourl: ""
};

serverCache.sidebar.header = { ...sidebarHeaderData };

const sidebarDoc = { 
  async create() { 
    try { 
      const docRef = db.collection('web').doc('sidebar'); 
      const doc = await docRef.get();

      // Smart merge Sidebar Header Map
      const existingHeader = (doc.exists && doc.data().header) ? doc.data().header : {};
      await docRef.set({ header: { ...sidebarHeaderData, ...existingHeader } }, { merge: true });

      // Check Sidebar Body (navbutton-{num})
      const bodySnapshot = await docRef.collection('body').get();
      const hasNavButton = bodySnapshot.docs.some(d => /^navbutton-\d+$/.test(d.id));
      
      if (!hasNavButton) {
        await docRef.collection('body').doc('navbutton-1').set({ 
          text: "Home", 
          icon: "fa-solid fa-house", 
          hash: "#" 
        });
      }

      // Check Sidebar Footer (social-{num})
      const footerSnapshot = await docRef.collection('footer').get();
      const hasSocial = footerSnapshot.docs.some(d => /^social-\d+$/.test(d.id));
      
      if (!hasSocial) {
        await docRef.collection('footer').doc('social-1').set({ 
          text: "Discord",
          icon: "fa-brands fa-discord", 
          url: "#" 
        });
      }
    } catch (err) { 
      console.error(err); 
    }
  } 
};


// =============================== // 7. BODY-HERO DOC // ===============================
const heroData = {
  primarytext: "",
  secondarytext: "",
  footertext: "",
  buttonenabled: true,
  buttontext: "",
  buttonicon: "",
  buttonurl: ""
};

serverCache.hero = { ...heroData };

const heroDoc = { 
  async create() { 
    try { 
      const docRef = db.collection('web').doc('body'); 
      const doc = await docRef.get(); 
      
      // Smart merge: Gets existing hero data and injects any missing default fields
      const existingHero = (doc.exists && doc.data().hero) ? doc.data().hero : {};
      const mergedHero = { ...heroData, ...existingHero };

      await docRef.set({ hero: mergedHero }, { merge: true }); 
    } catch (err) { 
      console.error(err); 
    } 
  } 
};


// =============================== // 8. REAL-TIME LISTENERS // ===============================
function startRealtimeListeners() {
  console.log("\n📡 Starting DB Listeners...");

  db.collection('web').doc('header').onSnapshot(doc => { 
    if (doc.exists) {
      serverCache.header = { id: doc.id, ...doc.data() }; 
      console.log(`🔄 Cache Updated:[Header size: ${getCacheSize(serverCache.header)}]\n${JSON.stringify(serverCache.header, null, 2)}`); 
    } 
  });

  db.collection('web').doc('body').onSnapshot(doc => { 
    if (doc.exists && doc.data().hero) { 
      serverCache.hero = doc.data().hero; 
      console.log(`🔄 Cache Updated:[Hero size: ${getCacheSize(serverCache.hero)}]\n${JSON.stringify(serverCache.hero, null, 2)}`); 
    } 
  });

  db.collection('web').doc('sidebar').onSnapshot(doc => { 
    if (doc.exists && doc.data().header) { 
      serverCache.sidebar.header = doc.data().header;
      console.log(`🔄 Cache Updated:[Sidebar size: ${getCacheSize(serverCache.sidebar.header)}]\n${JSON.stringify(serverCache.sidebar.header, null, 2)}`); 
    } 
  });

  db.collection('web').doc('sidebar').collection('body').onSnapshot(snapshot => {
    serverCache.sidebar.body = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
    console.log(`🔄 Cache Updated:[Sidebar Body size: ${getCacheSize(serverCache.sidebar.body)}]\n${JSON.stringify(serverCache.sidebar.body, null, 2)}`); 
  });

  db.collection('web').doc('sidebar').collection('footer').onSnapshot(snapshot => { 
    serverCache.sidebar.footer = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
    console.log(`🔄 Cache Updated:[Sidebar Footer size: ${getCacheSize(serverCache.sidebar.footer)}]\n${JSON.stringify(serverCache.sidebar.footer, null, 2)}`); 
  }); 
}


// =============================== // 9. WRAPPER FUNCTIONS & EXPORTS // ===============================
async function initializeFirestore() { 
  await headerDoc.create();
  await sidebarDoc.create(); 
  await heroDoc.create();  
  startRealtimeListeners(); 
}

async function getHeader() { return serverCache.header; } 
async function getHero() { return serverCache.hero; } 
async function getSidebar() { return serverCache.sidebar; }

module.exports = { initializeFirestore, getHeader, getHero, getSidebar };
