const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware to verify if user is logged in via Cookie
const checkSession = async (req, res, next) => {
    const token = req.cookies.sb_token;
    if (!token) return res.redirect('/auth');

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        res.clearCookie('sb_token');
        return res.redirect('/auth');
    }
    req.user = user; // Pass user data to the next route
    next();
};

// Auth Page Route
router.get('/', (req, res) => {
    if (req.cookies.sb_token) return res.redirect('/');
    res.render('auth', { error: null });
});

// Login Logic
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) return res.render('auth', { error: error.message });

    res.cookie('sb_token', data.session.access_token, { 
        httpOnly: true, 
        maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
    });
    res.redirect('/');
});

// Signup Logic
router.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return res.render('auth', { error: error.message });
    res.render('auth', { error: "Verification email sent. Please check your inbox." });
});

// Logout Logic
router.get('/logout', (req, res) => {
    res.clearCookie('sb_token');
    res.redirect('/auth');
});

module.exports = { router, checkSession };
