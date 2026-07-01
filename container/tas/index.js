const express = require('express');
const path = require('path');

const app = express();

// Set EJS as the viewing engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Render the frontend page
app.get('/', (req, res) => {
    res.render('index');
});

// Define host and port
const PORT = 6000;
const HOST = '0.0.0.0';

// Start the server
app.listen(PORT, HOST, () => {
    console.log(`Server is live at http://${HOST}:${PORT}`);
    console.log(`(You can also access it locally at http://localhost:${PORT})`);
});
