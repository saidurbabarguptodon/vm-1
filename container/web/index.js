// ===============================
// 1. EXTRACT .ENV FROM ZIP
// ===============================
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const envPath = path.join(__dirname, '.env');
const zipPath = path.join(__dirname, '.env.zip');

try {
  if (!fs.existsSync(envPath)) {
    console.log('.env not found, checking for .env.zip...');
    
    if (fs.existsSync(zipPath)) {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(__dirname, true);
      console.log('Success: .env extracted from zip.');
    } else {
      console.log('.env.zip not found, skipping extraction.');
    }
  } else {
    console.log('.env file already exists, skipping zip extraction.');
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
const firebase = require('./firebase');

// ===============================
// 4. INITIALIZE FIRESTORE DOCUMENTS
// ===============================
if (typeof firebase.initializeFirestore === 'function') {
  firebase.initializeFirestore().catch(console.error);
}

// ===============================
// 5. EXPRESS SETUP
// ===============================
const app = express();
const PORT = process.env.PORT || 9000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===============================
// 6. ROUTES
// ===============================

// Cache variables for optimization
let cachedData = null;
let lastFetch = 0;
const CACHE_TTL = 300000; // 5 minutes in milliseconds

// ROUTE: HOME PAGE
app.get('/', async (req, res) => {
  try {
    // Serve from cache if valid
    if (cachedData && (Date.now() - lastFetch < CACHE_TTL)) {
      return res.render('index', cachedData);
    }

    const templateData = {};
    const promises = [];

    for (const [key, value] of Object.entries(firebase)) {
      if (key === 'initializeFirestore') continue;

      if (typeof value === 'function') {
        const propName = key.startsWith('get') && key.length > 3 
          ? key.charAt(3).toLowerCase() + key.slice(4) 
          : key;
        
        // Fetch concurrently using Promise.resolve to safely handle both sync and async functions
        promises.push(Promise.resolve(value()).then(res => ({ key: propName, val: res })));
      } else {
        templateData[key] = value;
      }
    }

    // Wait for all Firebase queries to finish simultaneously
    const results = await Promise.all(promises);
    for (const { key, val } of results) {
      templateData[key] = val;
    }

    // Update cache
    cachedData = templateData;
    lastFetch = Date.now();

    res.render('index', templateData);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// ROUTE: DISCORD REDIRECT
app.get('/discord', (req, res) => {
  res.redirect('https://discord.gg/aB8QAYhjpf');
});

// ===============================
// 7. START SERVER
// ===============================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
