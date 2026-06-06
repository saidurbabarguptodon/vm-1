const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Initialize Supabase after env is loaded
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware to verify session via Cookie
const checkSession = async (req, res, next) => {
    const token = req.cookies.sb_token;
    if (!token) return res.redirect('/auth');

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        res.clearCookie('sb_token', { path: '/' });
        return res.redirect('/auth');
    }
    req.user = user;
    next();
};

// GET /auth
router.get('/', (req, res) => {
    if (req.cookies.sb_token) return res.redirect('/');
    res.render('auth', { error: null });
});

// POST /auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) return res.render('auth', { error: error.message });

    res.cookie('sb_token', data.session.access_token, { 
        httpOnly: true, 
        secure: false, // Set to true if using HTTPS
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Days
    });
    res.redirect('/');
});

// POST /auth/signup
router.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return res.render('auth', { error: error.message });
    res.render('auth', { error: "Registration successful. Please verify your email." });
});

// GET /auth/logout
router.get('/logout', (req, res) => {
    res.clearCookie('sb_token', { path: '/' });
    res.redirect('/auth');
});

module.exports = { router, checkSession };
