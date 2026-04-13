// ===============================
// 1. EXTRACT .ENV FROM ZIP
// ===============================
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const zipPath = path.join(__dirname, '.env.zip');

try {
  if (fs.existsSync(zipPath)) {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(__dirname, true);
    console.log('Success');
  } else {
    console.log('Not found, Skipping');
  }
} catch (err) {
  console.error('Error extracting zip:', err);
  process.exit(1); 
}

// ===============================
// 2. LOAD ENVIRONMENT VARIABLES
// ===============================
require('dotenv').config();

// ===============================
// 3. IMPORTS (MUST BE AFTER DOTENV)
// ===============================
const express = require('express');
const { initializeFirestore, getHeader, getHamburger } = require('./firebase');

// ===============================
// 4. INITIALIZE FIRESTORE DOCUMENTS
// ===============================
initializeFirestore().catch(console.error);

// ===============================
// 5. EXPRESS SETUP
// ===============================
const app = express();
const PORT = process.env.PORT || 9000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===============================
// 6. ROUTE: HOME PAGE
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
// 7. START SERVER
// ===============================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
