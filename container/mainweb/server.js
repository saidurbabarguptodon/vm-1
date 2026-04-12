// ===============================
// 1. IMPORTS
// ===============================
require('dotenv').config();
const express = require('express');
const path = require('path');
const { initializeFirestore, getHeader, getHamburger } = require('./firebase');

// ===============================
// 2. INITIALIZE FIRESTORE DOCUMENTS
// ===============================
initializeFirestore().catch(console.error);

// ===============================
// 3. EXPRESS SETUP
// ===============================
const app = express();
const PORT = process.env.PORT || 7595;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files (optional)
app.use(express.static('public'));

// ===============================
// 4. ROUTE: HOME PAGE
// ===============================
app.get('/', async (req, res) => {
  try {
    const header = await getHeader();
    const hamburger = await getHamburger();
    res.render('index', { header, hamburger });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// ===============================
// 5. START SERVER
// ===============================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
