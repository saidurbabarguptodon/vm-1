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
  hero: [], 
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
      if (!doc.exists) {
        await docRef.set({ ...headerData }); 
      }
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

      // Check Sidebar Header
      if (!doc.exists || !doc.data().header) {
        await docRef.set({ header: { ...sidebarHeaderData } }, { merge: true });
      } else {
        console.log("✅ Sidebar header data already exists:\n", doc.data().header);
      }

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

serverCache.hero = [heroData];

const heroDoc = { 
  async create() { 
    try { 
      const collectionRef = db.collection('web').doc('body').collection('hero'); 
      const snapshot = await collectionRef.get(); 
      
      if (snapshot.empty) {
        await collectionRef.add(heroData); 
      }
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

  db.collection('web').doc('body').collection('hero').onSnapshot(snapshot => { 
    serverCache.hero = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
    console.log(`🔄 Cache Updated:[Hero size: ${getCacheSize(serverCache.hero)}]\n${JSON.stringify(serverCache.hero, null, 2)}`); 
  });

  db.collection('web').doc('sidebar').onSnapshot(doc => { 
    if (doc.exists && doc.data().header) { 
      serverCache.sidebar.header = doc.data().header;
      console.log(`🔄 Cache Updated:[Sidebar size: ${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`); 
    } 
  });

  db.collection('web').doc('sidebar').collection('body').onSnapshot(snapshot => {
    serverCache.sidebar.body = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
    console.log(`🔄 Cache Updated:[Sidebar size: ${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`); 
  });

  db.collection('web').doc('sidebar').collection('footer').onSnapshot(snapshot => { 
    serverCache.sidebar.footer = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
    console.log(`🔄 Cache Updated:[Sidebar size: ${getCacheSize(serverCache.sidebar)}]\n${JSON.stringify(serverCache.sidebar, null, 2)}`); 
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
