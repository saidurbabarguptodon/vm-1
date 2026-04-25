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
// 4. IN-MEMORY CACHE WITH REAL-TIME LISTENERS
// ===============================
const serverCache = {
  header: null,
  hero: null,           // will hold the hero map from web/body.hero
  sidebar: {
    header: null,
    body: [],
    footer: []
  }
};

function attachListenerAndInit(ref, cacheKey, transform = (doc) => doc.data()) {
  // Initial fetch
  return ref.get().then(snap => {
    if (snap.exists) {
      if (cacheKey === 'sidebar.body' || cacheKey === 'sidebar.footer') {
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (cacheKey === 'sidebar.body') serverCache.sidebar.body = data;
        else serverCache.sidebar.footer = data;
      } else if (cacheKey === 'sidebar.header') {
        serverCache.sidebar.header = transform(snap);
      } else if (cacheKey === 'hero') {
        // hero is a field inside web/body document
        const data = snap.data();
        serverCache.hero = data.hero || null;
      } else {
        serverCache[cacheKey] = transform(snap);
      }
    }
  }).catch(console.error);
  
  if (cacheKey === 'sidebar.body' || cacheKey === 'sidebar.footer') {
    ref.onSnapshot(snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (cacheKey === 'sidebar.body') serverCache.sidebar.body = data;
      else serverCache.sidebar.footer = data;
    }, console.error);
  } else if (cacheKey === 'hero') {
    ref.onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data();
        serverCache.hero = data.hero || null;
      }
    }, console.error);
  } else {
    ref.onSnapshot(doc => {
      if (doc.exists) {
        if (cacheKey === 'sidebar.header') serverCache.sidebar.header = doc.data();
        else serverCache[cacheKey] = doc.data();
      }
    }, console.error);
  }
}

async function initializeCacheAndListeners() {
  console.log("\n📡 Initializing Firestore cache and real-time listeners...");
  
  const headerRef = db.collection('web').doc('header');
  await attachListenerAndInit(headerRef, 'header');
  
  // Hero: listen to the web/body document and extract the 'hero' field
  const bodyRef = db.collection('web').doc('body');
  await attachListenerAndInit(bodyRef, 'hero');
  
  const sidebarMainRef = db.collection('web').doc('sidebar');
  await attachListenerAndInit(sidebarMainRef, 'sidebar.header', (doc) => doc.data().header);
  
  const sidebarBodyRef = sidebarMainRef.collection('body');
  await attachListenerAndInit(sidebarBodyRef, 'sidebar.body');
  
  const sidebarFooterRef = sidebarMainRef.collection('footer');
  await attachListenerAndInit(sidebarFooterRef, 'sidebar.footer');
  
  console.log("✅ Cache populated and listeners active.");
}

// ===============================
// 5. HEADER
// ===============================
const defaultHeader = { alticon: "", alttext: "", logourl: "" };
serverCache.header = defaultHeader;

const headerDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('header');
      const doc = await docRef.get();
      if (!doc.exists) {
        await docRef.set(defaultHeader);
        console.log(`Successfully create header ${JSON.stringify(defaultHeader)}`);
      } else {
        console.log(`Header already exists ${JSON.stringify(doc.data())}`);
      }
    } catch (err) { console.error(err); }
  }
};

// ===============================
// 6. SIDEBAR
// ===============================
const defaultSidebarHeader = { alticon: "", alttext: "", logourl: "" };
serverCache.sidebar.header = defaultSidebarHeader;

const defaultNavButton = { 
  text: "Home", 
  icon: "fa-solid fa-house", 
  url: "/", 
  enabled: true
};
const defaultSocialLink = { icon: "fa-brands fa-discord", url: "#" };

const sidebarDoc = {
  async create() {
    try {
      const docRef = db.collection('web').doc('sidebar');
      const doc = await docRef.get();
      
      if (!doc.exists) {
        await docRef.set({ header: defaultSidebarHeader });
        console.log(`Successfully create sidebar document ${JSON.stringify({ header: defaultSidebarHeader })}`);
      } else {
        console.log(`Sidebar document already exists ${JSON.stringify(doc.data())}`);
      }

      const bodySnapshot = await docRef.collection('body').get();
      const hasNavButton = bodySnapshot.docs.some(docSnap => docSnap.id.startsWith('navbutton-'));
      if (!hasNavButton) {
        await docRef.collection('body').doc('navbutton-1').set(defaultNavButton);
        console.log(`Successfully create sidebar body navbutton-1 ${JSON.stringify(defaultNavButton)}`);
      } else {
        const existingNavButtons = bodySnapshot.docs
          .filter(d => d.id.startsWith('navbutton-'))
          .map(d => ({ id: d.id, ...d.data() }));
        console.log(`Sidebar body navbuttons already exist: ${JSON.stringify(existingNavButtons)}`);
      }

      const footerSnapshot = await docRef.collection('footer').get();
      if (footerSnapshot.empty) {
        await docRef.collection('footer').doc('social-1').set(defaultSocialLink);
        console.log(`Successfully create sidebar footer social-1 ${JSON.stringify(defaultSocialLink)}`);
      } else {
        const existingFooter = footerSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(`Sidebar footer already exists: ${JSON.stringify(existingFooter)}`);
      }
    } catch (err) { console.error(err); }
  }
};

// ===============================
// 7. BODY / HERO (hero as a map field inside web/body document)
// ===============================
const defaultHero = {
  primarytext: "", secondarytext: "", footertext: "",
  buttonenabled: false, buttontext: "", buttonicon: "", buttonurl: ""
};
serverCache.hero = defaultHero;

const heroDoc = {
  async create() {
    try {
      const bodyDocRef = db.collection('web').doc('body');
      const bodyDoc = await bodyDocRef.get();
      
      if (!bodyDoc.exists) {
        // Create the body document with the hero field
        await bodyDocRef.set({ hero: defaultHero });
        console.log(`Successfully create body document with hero ${JSON.stringify(defaultHero)}`);
      } else {
        // Check if the hero field exists; if not, add it without overwriting other fields
        const existingHero = bodyDoc.data().hero;
        if (!existingHero) {
          await bodyDocRef.update({ hero: defaultHero });
          console.log(`Hero field missing; added successfully ${JSON.stringify(defaultHero)}`);
        } else {
          console.log(`Hero already exists in body document: ${JSON.stringify(existingHero)}`);
        }
      }
    } catch (err) { console.error(err); }
  }
};

// ===============================
// 8. WRAPPER FUNCTIONS & EXPORTS
// ===============================
async function initializeFirestore() {
  await headerDoc.create();
  await heroDoc.create();
  await sidebarDoc.create();
  await initializeCacheAndListeners();
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
