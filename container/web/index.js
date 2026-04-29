// ===============================
// 1. EXTRACT .ENV FROM ZIP
// ===============================
const fs   = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const zipPath = path.join(__dirname, '.env.zip');

try {
  if (!fs.existsSync(envPath)) {
    console.log('.env not found, checking for .env.zip...');
    if (fs.existsSync(zipPath)) {
      const AdmZip = require('adm-zip');
      new AdmZip(zipPath).extractAllTo(__dirname, true);
      console.log('✅ .env extracted from zip.');
    } else {
      console.log('⚠️  .env.zip not found, skipping extraction.');
    }
  } else {
    console.log('✅ .env already exists, skipping extraction.');
  }
} catch (err) {
  console.error('❌ Error extracting zip:', err);
  process.exit(1);
}

// ===============================
// 2. LOAD ENVIRONMENT VARIABLES
// ===============================
require('dotenv').config();

// ===============================
// 3. IMPORTS
// ===============================
const express      = require('express');
const { execSync } = require('child_process');
const firebase     = require('./firebase');

// ===============================
// 4. AUTO-BUILD PROTECTION
// ===============================
const srcView   = path.join(__dirname, 'views', 'index.ejs');
const builtView = path.join(__dirname, 'views', 'index.min.ejs');

function needsBuild() {
  if (!fs.existsSync(builtView)) return true;
  return fs.statSync(srcView).mtimeMs > fs.statSync(builtView).mtimeMs;
}

if (needsBuild()) {
  console.log('🔨 Building protected view...');
  try {
    execSync('node build.js', { stdio: 'inherit' });
    console.log('✅ Protected view ready.');
  } catch (err) {
    console.error('❌ Build failed:', err.message);
    process.exit(1);
  }
} else {
  console.log('✅ Protected view is up to date.');
}

// ===============================
// 5. INITIALIZE FIRESTORE
// ===============================
if (typeof firebase.initializeFirestore === 'function') {
  firebase.initializeFirestore().catch(console.error);
}

// ===============================
// 6. EXPRESS SETUP
// ===============================
const app  = express();
const PORT = process.env.PORT || 9000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===============================
// 7. TEMPLATE HELPER
// ===============================
async function getTemplateData() {
  const data = {};
  for (const [key, fn] of Object.entries(firebase)) {
    if (key === 'initializeFirestore' || typeof fn !== 'function') continue;
    const prop = key.startsWith('get') && key.length > 3
      ? key.charAt(3).toLowerCase() + key.slice(4)
      : key;
    data[prop] = await fn();
  }
  return data;
}

// ===============================
// 8. ROUTES
// ===============================

// HOME — always serves the protected build
app.get('/', async (req, res) => {
  try {
    res.render('index.min.ejs', await getTemplateData());
  } catch (err) {
    console.error('❌ Route error:', err);
    res.status(500).send('Server error');
  }
});

// DISCORD REDIRECT
app.get('/discord', (req, res) => {
  res.redirect('https://discord.gg/aB8QAYhjpf');
});

// ===============================
// 9. START SERVER
// ===============================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running → http://0.0.0.0:${PORT}`);
  console.log(`🔒 View protection → always ON\n`);
});
