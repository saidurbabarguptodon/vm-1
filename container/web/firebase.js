// ===============================
// 1. IMPORTS & ENV
// ===============================
const admin = require('firebase-admin');
require('dotenv').config();

const { FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_DATABASE_URL } = process.env;

// ===============================
// 2. INITIALIZE FIREBASE
// ===============================
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      privateKey: FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: FIREBASE_CLIENT_EMAIL,
    }),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.firestore();

// ===============================
// 3. IN-MEMORY CACHE
// ===============================
const serverCache = {
  header: { alticon: '', alttext: '', logourl: '' },
  hero:   { primarytext: '', secondarytext: '', footertext: '', buttonenabled: true, buttontext: '', buttonicon: '', buttonurl: '' },
  cards:  { data: { title: '', description: '', buttonenabled: true, buttonicon: '', buttontext: '', buttonurl: '' }, items: [] },
  faqs:   { data: { title: '', description: '', buttonenabled: true, buttonicon: '', buttontext: '', buttonurl: '' }, items: [] },
  sidebar:{ header: { alticon: '', alttext: '', logourl: '' }, body: [], footer: [] },
};

// ===============================
// 4. CACHE HELPERS
// ===============================
function setCache(key, value) {
  const [root, sub] = key.split('.');
  sub ? (serverCache[root][sub] = value) : (serverCache[root] = value);
}

function getCache(key) {
  const [root, sub] = key.split('.');
  return sub ? serverCache[root][sub] : serverCache[root];
}

// ===============================
// 5. LISTENER CONFIG
// ===============================
const refs = () => {
  const web     = db.collection('web');
  const body    = web.doc('body');
  const cards   = body.collection('cards');
  const faqs    = body.collection('faqs');
  const sidebar = web.doc('sidebar');

  return [
    { ref: web.doc('header'),         key: 'header',         type: 'doc' },
    { ref: body,                       key: 'hero',           type: 'doc', pick: d => d.hero || null },
    { ref: cards.doc('data'),          key: 'cards.data',     type: 'doc' },
    { ref: cards,                      key: 'cards.items',    type: 'col' },
    { ref: faqs.doc('data'),           key: 'faqs.data',      type: 'doc' },
    { ref: faqs,                       key: 'faqs.items',     type: 'col' },
    { ref: sidebar,                    key: 'sidebar.header', type: 'doc', pick: d => d.header },
    { ref: sidebar.collection('body'), key: 'sidebar.body',   type: 'col' },
    { ref: sidebar.collection('footer'),key:'sidebar.footer', type: 'col' },
  ];
};

// ===============================
// 6. ATTACH LISTENERS
// ===============================
function colDocs(snapshot) {
  return snapshot.docs.filter(d => d.id !== 'data').map(d => ({ id: d.id, ...d.data() }));
}

function attach({ ref, key, type, pick }) {
  if (type === 'col') {
    ref.onSnapshot(snap => setCache(key, colDocs(snap)), console.error);
    return ref.get().then(snap => setCache(key, colDocs(snap))).catch(console.error);
  }
  // doc
  const extract = pick ? (d => d.exists ? pick(d.data()) : null) : (d => d.exists ? d.data() : null);
  ref.onSnapshot(doc => { const v = extract(doc); if (v !== null) setCache(key, v); }, console.error);
  return ref.get().then(snap => { const v = extract(snap); if (v !== null) setCache(key, v); }).catch(console.error);
}

async function initializeCacheAndListeners() {
  console.log('\n📡 Initializing Firestore cache and real-time listeners...');
  await Promise.all(refs().map(attach));
  console.log('✅ Cache populated and listeners active.');
}

// ===============================
// 7. SEED DEFAULTS (create if missing)
// ===============================
async function seedDoc(ref, defaults) {
  const snap = await ref.get();
  if (!snap.exists) { await ref.set(defaults); console.log(`Created ${ref.path}`); }
}

async function seedSubcollection(colRef, docId, defaults, prefix) {
  const snap = await colRef.get();
  const exists = snap.docs.some(d => d.id.startsWith(prefix));
  if (!exists) { await colRef.doc(docId).set(defaults); console.log(`Created ${colRef.path}/${docId}`); }
}

async function initializeFirestore() {
  const web     = db.collection('web');
  const body    = web.doc('body');
  const cards   = body.collection('cards');
  const faqs    = body.collection('faqs');
  const sidebar = web.doc('sidebar');

  // Header
  await seedDoc(web.doc('header'), serverCache.header);

  // Body / Hero
  const bodySnap = await body.get();
  if (!bodySnap.exists) {
    await body.set({ hero: serverCache.hero });
    console.log(`Created web/body`);
  } else if (!bodySnap.data().hero) {
    await body.update({ hero: serverCache.hero });
    console.log(`Added missing hero to web/body`);
  }

  // Cards
  await seedDoc(cards.doc('data'), serverCache.cards.data);
  await seedSubcollection(cards, 'card-1', { title: '', description: '', icon: '', url: '', rating: 0, status: '' }, 'card-');

  // FAQs
  await seedDoc(faqs.doc('data'), serverCache.faqs.data);
  await seedSubcollection(faqs, 'faq-1', { title: '', description: '' }, 'faq-');

  // Sidebar
  const sidebarSnap = await sidebar.get();
  if (!sidebarSnap.exists) { await sidebar.set({ header: serverCache.sidebar.header }); console.log(`Created web/sidebar`); }

  await seedSubcollection(sidebar.collection('body'),   'navbutton-1', { text: 'Home', icon: 'fa-solid fa-house', url: '#home' }, 'navbutton-');
  await seedSubcollection(sidebar.collection('footer'), 'social-1',    { icon: 'fa-brands fa-discord', url: '#' }, 'social-');

  await initializeCacheAndListeners();
}

// ===============================
// 8. EXPORTS
// ===============================
module.exports = {
  initializeFirestore,
  getHeader:  () => serverCache.header,
  getHero:    () => serverCache.hero,
  getCards:   () => serverCache.cards,
  getFaqs:    () => serverCache.faqs,
  getSidebar: () => serverCache.sidebar,
};
