const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// 1. UNZIP .env.zip BEFORE ANYTHING ELSE
const zipPath = path.join(__dirname, '.env.zip');

if (fs.existsSync(zipPath)) {
    try {
        const zip = new AdmZip(zipPath);
        // Extract to current directory, overwrite true
        zip.extractAllTo(__dirname, true);
        console.log('Successfully unzipped .env.zip');
    } catch (err) {
        console.error('Error unzipping .env.zip:', err);
    }
} else {
    console.log('.env.zip not found, proceeding with existing files...');
}

// 2. NOW LOAD CONFIG AND APP
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { router: authRoutes, checkSession } = require('./auth');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Authentication Routes
app.use('/auth', authRoutes);

// Protected Home Route
app.get('/', checkSession, (req, res) => {
    const view = req.query.view || 'overview';
    res.render('home', { 
        user: req.user, 
        view: view 
    });
});

const PORT = 8000;
app.listen(PORT, () => console.log(`Aeronotics live: http://localhost:${PORT}`));
