const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// 1. UNZIP CONFIG BEFORE STARTING
const zipPath = path.join(__dirname, '.env.zip');
if (fs.existsSync(zipPath)) {
    try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(__dirname, true);
        console.log('✅ Configuration unzipped successfully.');
    } catch (err) {
        console.error('❌ Error unzipping .env.zip:', err);
    }
}

// 2. INITIALIZE APP
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { router: authRoutes, checkSession } = require('./auth');

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 3. ROUTES
// Auth routes handled at /auth
app.use('/auth', authRoutes);

// Home route handled at / (Protected by cookie)
app.get('/', checkSession, (req, res) => {
    const view = req.query.view || 'overview';
    res.render('home', { 
        user: req.user, 
        view: view 
    });
});

const PORT = 8000;
app.listen(PORT, () => console.log(`🚀 Aeronotics Console live at http://localhost:${PORT}`));
