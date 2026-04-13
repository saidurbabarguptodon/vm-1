// ===============================
// 1. EXTRACT .ENV FROM ZIP
// ===============================
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const envPath = path.join(__dirname, '.env');
const zipPath = path.join(__dirname, '.env.zip');

try {
  // Check if .env already exists
  if (!fs.existsSync(envPath)) {
    console.log('.env not found, checking for .env.zip...');
    
    // If no .env, check if we have a zip file to extract
    if (fs.existsSync(zipPath)) {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(__dirname, true);
      console.log('Success: .env extracted from zip.');
    } else {
      console.log('.env.zip not found, skipping extraction.');
    }
  } else {
    // If .env exists, skip everything
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

// UPDATED: Import the entire module so we can dynamically fetch new functions
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
// 6. ROUTE: HOME PAGE
// ===============================
app.get('/', async (req, res) => {
  try {
    const templateData = {};

    // DYNAMIC DATA FETCHER: 
    // Loops through everything exported in firebase.js. You never have to update this
    // again when adding new getFunctions (like getFooter, getNavigation, etc).
    for (const [key, value] of Object.entries(firebase)) {
      // Skip the initialization function
      if (key === 'initializeFirestore') continue;

      if (typeof value === 'function') {
        // Formats names automatically (e.g., "getHeader" becomes "header", "getSidebar" becomes "sidebar")
        let propName = key;
        if (key.startsWith('get') && key.length > 3) {
          propName = key.charAt(3).toLowerCase() + key.slice(4);
        }
        
        // Execute the function and add the result to our template data
        templateData[propName] = await value();
      } else {
        // If it's a regular variable/object export, pass it straight to the view
        templateData[key] = value;
      }
    }

    // Render the view with our dynamically built data object
    res.render('index', templateData);
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
