require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { router: authRoutes, checkSession } = require('./auth');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/auth', authRoutes);

app.get('/', checkSession, (req, res) => {
    const view = req.query.view || 'overview';
    res.render('home', { user: req.user, view: view });
});

app.listen(8000, () => console.log('Aeronotics live: http://localhost:8000'));
