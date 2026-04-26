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
  hero: null,
  sidebar: {
    header: null,
    body: [],
    footer: []
  }
};

function attachListenerAndInit(ref, cacheKey, transform = (doc) => doc.data()) {
  const isCollection = cacheKey === 'sidebar.body' || cacheKey === 'sidebar.footer';

  // ─── FIX 1: Don't return early — attach listeners first, then do initial fetch ───
  // ─── FIX 2: Use !snap.empty for collection refs, snap.exists for document refs ───

  if (isCollection) {
    // Real-time listener for collections
    ref.onSnapshot(snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (cacheKey === 'sidebar.body') serverCache.sidebar.body = data;
      else serverCache.sidebar.footer = data;
    }, console.error);

    // Initial fetch for collections
    return ref.get().then(snap => {
      if (!snap.empty) {
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (cacheKey === 'sidebar.body') serverCache.sidebar.body = data;
        else serverCache.sidebar.footer = data;
      }
    }).catch(console.error);

  } else if (cacheKey === 'sidebar.header') {
    // Real-time listener for sidebar header document
    ref.onSnapshot(doc => {
      if (doc.exists) {
        serverCache.sidebar.header = doc.data().header;
      }
    }, console.error);

    // Initial fetch for sidebar header
    return ref.get().then(snap => {
      if (snap.exists) {
        serverCache.sidebar.header = transform(snap);
      }
    }).catch(console.error);

  } else if (cacheKey === 'hero') {
    // Real-time listener for hero (nested in body doc)
    ref.onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data();
        serverCache.hero = data.hero || null;
      }
    }, console.error);

    // Initial fetch for hero
    return ref.get().then(snap => {
      if (snap.exists) {
        const data = snap.data();
        serverCache.hero = data.hero || null;
      }
    }).catch(console.error);

  } else {
    // Real-time listener for generic documents (e.g. header)
    ref.onSnapshot(doc => {
      if (doc.exists) {
        serverCache[cacheKey] = doc.data();
      }
    }, console.error);

    // Initial fetch for generic documents
    return ref.get().then(snap => {
      if (snap.exists) {
        serverCache[cacheKey] = transform(snap);
      }
    }).catch(console.error);
  }
}

async function initializeCacheAndListeners() {
  console.log("\n📡 Initializing Firestore cache and real-time listeners...");
  
  const headerRef = db.collection('web').doc('header');
  await attachListenerAndInit(headerRef, 'header');
  
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
  url: "/"
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
// 7. BODY (HERO + CARDS)
// ===============================
const defaultHero = {
  primarytext: "", secondarytext: "", footertext: "",
  buttonenabled: true,  
  buttontext: "", buttonicon: "", buttonurl: ""
};
serverCache.hero = defaultHero;

const defaultCard = {
  title: "",
  description: "",
  icon: ""
};

const bodyDoc = {
  async create() {
    try {
      const bodyDocRef = db.collection('web').doc('body');
      const bodyDocSnap = await bodyDocRef.get();
      
      // ---------- HERO ----------
      if (!bodyDocSnap.exists) {
        await bodyDocRef.set({ hero: defaultHero });
        console.log(`Successfully created body document with hero ${JSON.stringify(defaultHero)}`);
      } else {
        const existingHero = bodyDocSnap.data().hero;
        if (!existingHero) {
          await bodyDocRef.update({ hero: defaultHero });
          console.log(`Hero field missing; added successfully ${JSON.stringify(defaultHero)}`);
        } else {
          console.log(`Hero already exists in body document: ${JSON.stringify(existingHero)}`);
        }
      }

      // ---------- CARDS ----------
      const cardsSnapshot = await bodyDocRef.collection('cards').get();
      const hasCards = cardsSnapshot.docs.some(docSnap => docSnap.id.startsWith('card-'));
      
      if (!hasCards) {
        await bodyDocRef.collection('cards').doc('card-1').set(defaultCard);
        console.log(`Successfully created body/cards/card-1 ${JSON.stringify(defaultCard)}`);
      } else {
        const existingCards = cardsSnapshot.docs
          .filter(d => d.id.startsWith('card-'))
          .map(d => ({ id: d.id, ...d.data() }));
        console.log(`Body cards already exist: ${JSON.stringify(existingCards)}`);
      }
    } catch (err) { console.error(err); }
  }
};

// ===============================
// 8. WRAPPER FUNCTIONS & EXPORTS
// ===============================
async function initializeFirestore() {
  await headerDoc.create();
  await bodyDoc.create();
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
