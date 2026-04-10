const express = require('express');
const mineflayer = require('mineflayer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // For generating UUIDs

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'bots.json');

// --- Middleware ---
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true })); // Parse form data
app.use(express.json());

// --- Utilities ---
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

function formatUptime(ms) {
    if (!ms || ms <= 0) return '0s';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));
    return `${hours}h ${minutes}m ${seconds}s`;
}

// --- Data Persistence ---
let botConfigs =[];
if (fs.existsSync(DATA_FILE)) {
    try {
        botConfigs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading bots.json:", e);
    }
}

function saveConfigs() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(botConfigs, null, 4));
}

// --- Advanced Minecraft Bot Controller ---
const activeBots = {}; // Memory storage for active running bot instances

class McBot {
    constructor(config) {
        this.config = config;
        this.bot = null;
        this.status = 'Offline';
        this.startTime = null;
        this.logs =[];
        this.intendedState = 'stopped'; // 'running' or 'stopped'
        this.accountIndex = 0; // For Smart Rejoin looping
        
        // Timers
        this.reconnectTimer = null;
        this.rotationTimer = null;
        this.joinMessageTimer = null;
    }

    log(msg) {
        const timestamp = new Date().toLocaleTimeString();
        const safeMsg = escapeHTML(msg);
        this.logs.push(`[${timestamp}] ${safeMsg}`);
        // Memory leak prevention: Keep only the last 200 logs
        if (this.logs.length > 200) this.logs.shift();
    }

    start() {
        this.intendedState = 'running';
        this.clearTimers();
        
        if (this.bot) {
            this.bot.quit();
            this.bot = null;
        }

        // Handle Smart Rejoin Username
        let currentUsername = this.config.username;
        if (this.config.smartRejoin) {
            const suffix = this.accountIndex === 0 ? '' : `_${this.accountIndex + 1}`;
            currentUsername = `${this.config.username}${suffix}`;
        }

        // Parse host and port
        let host = this.config.address;
        let port = 25565;
        if (host.includes(':')) {
            const parts = host.split(':');
            host = parts[0];
            port = parseInt(parts[1]);
        }

        this.status = 'Connecting';
        this.log(`Attempting to connect as ${currentUsername} to ${host}:${port}...`);

        try {
            this.bot = mineflayer.createBot({
                host: host,
                port: port,
                username: currentUsername,
                version: false // Auto-detect
            });

            this.setupEvents();
        } catch (err) {
            this.log(`Failed to create bot: ${err.message}`);
            this.scheduleReconnect();
        }
    }

    setupEvents() {
        this.bot.once('spawn', () => {
            this.status = 'Online';
            this.startTime = Date.now();
            this.log(`Bot spawned successfully in the world!`);

            // Join Message Logic
            if (this.config.joinMessage) {
                this.joinMessageTimer = setTimeout(() => {
                    if (this.bot && this.status === 'Online') {
                        this.bot.chat(this.config.joinMessage);
                        this.log(`Sent join message: ${this.config.joinMessage}`);
                    }
                }, 2000);
            }

            // Smart Rejoin Interval Logic (Force Rotation)
            if (this.config.smartRejoin && this.config.smartRejoinIntervalSec > 0) {
                this.rotationTimer = setTimeout(() => {
                    this.log(`Rotation interval reached (${this.config.smartRejoinIntervalSec}s). Rotating account...`);
                    this.stop(true); // Stop but intent remains 'running'
                    this.rotateAccount();
                }, this.config.smartRejoinIntervalSec * 1000);
            }
        });

        this.bot.on('message', (message) => {
            this.log(`[CHAT] ${message.toAnsi()}`); // Retains basic text representation
        });

        this.bot.on('kicked', (reason) => {
            let reasonStr = typeof reason === 'object' ? JSON.stringify(reason) : reason;
            this.log(`Kicked from server. Reason: ${reasonStr}`);
        });

        this.bot.on('error', (err) => {
            this.log(`Bot Error: ${err.message}`);
        });

        this.bot.on('end', () => {
            this.status = 'Offline';
            this.startTime = null;
            this.log(`Disconnected from server.`);
            this.clearTimers();

            if (this.intendedState === 'running') {
                if (this.config.smartRejoin) {
                    this.rotateAccount();
                } else {
                    this.scheduleReconnect();
                }
            }
        });
    }

    rotateAccount() {
        this.accountIndex = (this.accountIndex + 1) % (this.config.smartRejoinCount || 2);
        const delayMs = (this.config.smartRejoinDelay || 5) * 1000;
        
        this.log(`Smart Rejoin: Waiting ${delayMs/1000}s before joining with next account...`);
        this.reconnectTimer = setTimeout(() => this.start(), Math.max(delayMs, 1000));
    }

    scheduleReconnect() {
        if (!this.config.autoReconnect && !this.config.smartRejoin) {
            this.log("Auto-reconnect is disabled. Bot will stay offline.");
            this.intendedState = 'stopped';
            return;
        }

        const delayMs = (this.config.autoReconnectDelay || 15) * 1000;
        this.log(`Auto Reconnect: Waiting ${delayMs/1000}s before reconnecting...`);
        this.reconnectTimer = setTimeout(() => this.start(), Math.max(delayMs, 1000));
    }

    stop(internal = false) {
        if (!internal) {
            this.intendedState = 'stopped';
            this.log(`Bot manually stopped.`);
        }
        this.clearTimers();
        if (this.bot) {
            this.bot.quit();
            this.bot = null;
        }
        this.status = 'Offline';
        this.startTime = null;
    }

    clearTimers() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.rotationTimer) clearTimeout(this.rotationTimer);
        if (this.joinMessageTimer) clearTimeout(this.joinMessageTimer);
    }

    getUptime() {
        if (this.status !== 'Online' || !this.startTime) return '0s';
        return formatUptime(Date.now() - this.startTime);
    }
}

// --- Routes ---

// 1. Dashboard Home
app.get('/', (req, res) => {
    // Map configs to include active status data
    const botsData = botConfigs.map(c => {
        const active = activeBots[c.id];
        return {
            id: c.id,
            name: c.name,
            username: c.username,
            address: c.address,
            status: active ? active.status : 'Offline',
            uptime: active ? active.getUptime() : '0s'
        };
    });

    res.render('index', { view: 'home', bots: botsData });
});

// 2. Create Bot
app.post('/create', (req, res) => {
    const newBot = {
        id: crypto.randomUUID().substring(0, 8),
        name: req.body.name,
        username: req.body.username,
        address: req.body.address,
        joinMessage: req.body.joinMessage || "",
        autoReconnect: true,
        autoReconnectDelay: 15,
        smartRejoin: false,
        smartRejoinCount: 2,
        smartRejoinDelay: 5,
        smartRejoinIntervalSec: 300
    };
    
    botConfigs.push(newBot);
    saveConfigs();
    res.redirect('/');
});

// 3. Manage Bot View
app.get('/:id', (req, res) => {
    const botConfig = botConfigs.find(b => b.id === req.params.id);
    if (!botConfig) return res.status(404).send("Bot not found");

    const active = activeBots[botConfig.id];
    res.render('index', { 
        view: 'manage', 
        bot: botConfig,
        status: active ? active.status : 'Offline',
        uptime: active ? active.getUptime() : '0s'
    });
});

// 4. API: Fetch Live Logs & Status
app.get('/:id/logs', (req, res) => {
    const active = activeBots[req.params.id];
    if (!active) {
        return res.json({ status: 'Offline', uptime: '0s', logs:['System: Bot is offline. Click Start.'] });
    }
    res.json({
        status: active.status,
        uptime: active.getUptime(),
        logs: active.logs
    });
});

// 5. Action: Start Bot
app.post('/:id/start', (req, res) => {
    const botConfig = botConfigs.find(b => b.id === req.params.id);
    if (botConfig) {
        if (!activeBots[botConfig.id]) {
            activeBots[botConfig.id] = new McBot(botConfig);
        }
        activeBots[botConfig.id].start();
    }
    res.redirect(`/${req.params.id}`);
});

// 6. Action: Stop Bot
app.post('/:id/stop', (req, res) => {
    const active = activeBots[req.params.id];
    if (active) active.stop();
    res.redirect(`/${req.params.id}`);
});

// 7. Action: Restart Bot
app.post('/:id/restart', (req, res) => {
    const active = activeBots[req.params.id];
    if (active) {
        active.stop();
        setTimeout(() => active.start(), 1000);
    }
    res.redirect(`/${req.params.id}`);
});

// 8. Action: Delete Bot
app.post('/:id/delete', (req, res) => {
    const active = activeBots[req.params.id];
    if (active) active.stop();
    delete activeBots[req.params.id];

    botConfigs = botConfigs.filter(b => b.id !== req.params.id);
    saveConfigs();
    res.redirect('/');
});

// 9. Action: Clear Logs
app.post('/:id/clear-logs', (req, res) => {
    const active = activeBots[req.params.id];
    if (active) active.logs =[];
    res.redirect(`/${req.params.id}`);
});

// 10. Edit Bot Settings
app.post('/:id/edit', (req, res) => {
    const botIndex = botConfigs.findIndex(b => b.id === req.params.id);
    if (botIndex === -1) return res.redirect('/');

    const oldConfig = botConfigs[botIndex];
    
    // Process Checkboxes (HTML forms only send 'on' if checked)
    const isAutoReconnect = req.body.autoReconnect === 'on';
    const isSmartRejoin = req.body.smartRejoin === 'on';

    botConfigs[botIndex] = {
        ...oldConfig,
        name: req.body.name,
        username: req.body.username,
        address: req.body.address,
        joinMessage: req.body.joinMessage,
        
        autoReconnect: isAutoReconnect,
        autoReconnectDelay: parseInt(req.body.autoReconnectDelay) || 15,
        
        smartRejoin: isSmartRejoin,
        smartRejoinCount: parseInt(req.body.smartRejoinCount) || 2,
        smartRejoinDelay: parseInt(req.body.smartRejoinDelay) || 5,
        smartRejoinIntervalSec: parseInt(req.body.smartRejoinIntervalSec) || 300
    };

    saveConfigs();

    // Hot-reload configuration if the bot is actively running
    if (activeBots[req.params.id]) {
        activeBots[req.params.id].config = botConfigs[botIndex];
    }

    res.redirect(`/${req.params.id}`);
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`🚀 Minecraft Bot Manager is running!`);
    console.log(`👉 Access the dashboard at: http://localhost:${PORT}`);
    console.log(`==========================================`);
});
