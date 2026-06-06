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
    // Current tab (overview or settings)
    const view = req.query.view || 'overview';
    
    res.render('home', { 
        user: req.user, 
        view: view 
    });
});

const PORT = 8000;
app.listen(PORT, () => console.log(`Aeronotics running at http://localhost:${PORT}`));
