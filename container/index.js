const express = require('express');
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 9000;
const DATA_FILE = path.join(__dirname, 'bots.json');

// --- Middleware ---
app.set('views', __dirname);
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
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

// --- Port checker (NEW) ---
function checkPort(host, port, timeout = 5000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('error', () => resolve(false));
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

// --- Data Persistence ---
let botConfigs = [];
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

// --- Bot System ---
const activeBots = {};

class McBot {
    constructor(config) {
        this.config = config;
        this.bot = null;
        this.status = 'Offline';
        this.startTime = null;
        this.logs = [];
        this.intendedState = 'stopped';
        this.accountIndex = 0;

        this.reconnectTimer = null;
        this.rotationTimer = null;
        this.joinMessageTimer = null;
    }

    log(msg) {
        const timestamp = new Date().toLocaleTimeString();
        this.logs.push(`[${timestamp}] ${escapeHTML(msg)}`);
        if (this.logs.length > 200) this.logs.shift();
    }

    async start() {
        this.intendedState = 'running';
        this.clearTimers();

        // SAFE quit
        if (this.bot && typeof this.bot.quit === 'function') {
            try { this.bot.quit(); } catch {}
        }
        this.bot = null;

        let currentUsername = this.config.username;
        if (this.config.smartRejoin) {
            const suffix = this.accountIndex === 0 ? '' : `_${this.accountIndex + 1}`;
            currentUsername = `${this.config.username}${suffix}`;
        }

        let host = this.config.address;
        let port = 25565;

        if (host.includes(':')) {
            const parts = host.split(':');
            host = parts[0];
            port = parseInt(parts[1]);
        }

        this.status = 'Checking Server';
        this.log(`Checking ${host}:${port}...`);

        const isOpen = await checkPort(host, port);
        if (!isOpen) {
            this.log(`❌ Cannot connect (server offline / port closed)`);
            this.scheduleReconnect();
            return;
        }

        this.status = 'Connecting';
        this.log(`Connecting as ${currentUsername} to ${host}:${port}`);

        try {
            this.bot = mineflayer.createBot({
                host,
                port,
                username: currentUsername,
                version: this.config.version || false,
                checkTimeoutInterval: 30000,
                skipValidation: true,
                hideErrors: false
            });

            this.setupEvents();
        } catch (err) {
            this.log(`Create error: ${err.message}`);
            this.scheduleReconnect();
        }
    }

    setupEvents() {
        this.bot.once('spawn', () => {
            this.status = 'Online';
            this.startTime = Date.now();
            this.log(`✅ Spawned`);

            this.bot.loadPlugin(pathfinder);
            const defaultMove = new Movements(this.bot);
            defaultMove.canDig = false;
            defaultMove.scaffoldingBlocks = [];
            this.bot.pathfinder.setMovements(defaultMove);

            if (this.config.joinMessage) {
                this.joinMessageTimer = setTimeout(() => {
                    if (this.bot) this.bot.chat(this.config.joinMessage);
                }, 2000);
            }
        });

        this.bot.on('message', msg => this.log(`[CHAT] ${msg.toString()}`));

        this.bot.on('kicked', r => this.log(`Kicked: ${r}`));

        this.bot.on('error', err => this.log(`❌ ${err.message}`));

        this.bot.on('end', () => {
            this.status = 'Offline';
            this.startTime = null;
            this.log(`Disconnected`);
            this.clearTimers();

            if (this.intendedState === 'running') {
                this.scheduleReconnect();
            }
        });
    }

    scheduleReconnect() {
        const delay = (this.config.autoReconnectDelay || 15) * 1000;
        this.log(`Reconnect in ${delay / 1000}s`);
        this.reconnectTimer = setTimeout(() => this.start(), delay);
    }

    stop(internal = false) {
        if (!internal) {
            this.intendedState = 'stopped';
            this.log(`Stopped`);
        }

        this.clearTimers();

        if (this.bot && typeof this.bot.quit === 'function') {
            try { this.bot.quit(); } catch (e) {
                this.log(`Quit error: ${e.message}`);
            }
        }

        this.bot = null;
        this.status = 'Offline';
        this.startTime = null;
    }

    clearTimers() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.rotationTimer) clearTimeout(this.rotationTimer);
        if (this.joinMessageTimer) clearTimeout(this.joinMessageTimer);
    }

    getUptime() {
        if (!this.startTime) return '0s';
        return formatUptime(Date.now() - this.startTime);
    }
}

// --- Routes ---
app.get('/', (req, res) => {
    const botsData = botConfigs.map(c => {
        const active = activeBots[c.id];
        return {
            ...c,
            status: active ? active.status : 'Offline',
            uptime: active ? active.getUptime() : '0s'
        };
    });
    res.render('index', { view: 'home', bots: botsData });
});

app.post('/create', (req, res) => {
    const newBot = {
        id: crypto.randomUUID().substring(0, 8),
        name: req.body.name,
        username: req.body.username,
        address: req.body.address,
        version: req.body.version || "",
        joinMessage: req.body.joinMessage || "",
        autoReconnectDelay: 15
    };
    botConfigs.push(newBot);
    saveConfigs();
    res.redirect('/');
});

app.post('/:id/start', (req, res) => {
    const cfg = botConfigs.find(b => b.id === req.params.id);
    if (cfg) {
        if (!activeBots[cfg.id]) activeBots[cfg.id] = new McBot(cfg);
        activeBots[cfg.id].start();
    }
    res.redirect('/');
});

app.post('/:id/stop', (req, res) => {
    const bot = activeBots[req.params.id];
    if (bot) bot.stop();
    res.redirect('/');
});

// --- Start ---
app.listen(PORT, () => {
    console.log(`🚀 Running on http://localhost:${PORT}`);
});
