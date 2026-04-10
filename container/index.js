const express = require('express');
const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');

process.on('uncaughtException', (err) => console.error('[Global Error]', err));
process.on('unhandledRejection', (err) => console.error('[Global Rejection]', err));

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', __dirname);

const BOTS_FILE = path.join(__dirname, 'bots.json');

let savedBots = [];
if (fs.existsSync(BOTS_FILE)) {
    try {
        savedBots = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
        savedBots.forEach(bot => { if (!bot.logs) bot.logs = []; });
    } catch (e) {
        savedBots = [];
        fs.writeFileSync(BOTS_FILE, JSON.stringify([]));
    }
} else {
    fs.writeFileSync(BOTS_FILE, JSON.stringify([]));
}

const activeBots = {};

// --- Helper Functions ---

function logToBot(id, msg) {
    const time = new Date().toLocaleTimeString();
    const cleanMsg = String(msg).replace(/§[0-9a-fk-or]/g, '');
    const logEntry = `[${time}] ${cleanMsg}`;

    const botConfig = savedBots.find(b => b.id === parseInt(id));
    if (botConfig) {
        if (!botConfig.logs) botConfig.logs = [];
        botConfig.logs.push(logEntry);
        if (botConfig.logs.length > 2000) botConfig.logs.shift();
        fs.writeFileSync(BOTS_FILE, JSON.stringify(savedBots, null, 2));
    }
}

function getStatus(id) {
    return activeBots[id] ? activeBots[id].status : 'Offline';
}

function getUptime(id) {
    if (!activeBots[id] || !activeBots[id].processStartTime) return 'Offline';
    const diff = Math.floor((Date.now() - activeBots[id].processStartTime) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function clearBotTimers(id) {
    if (activeBots[id]) {
        clearTimeout(activeBots[id].reconnectTimer);
        clearTimeout(activeBots[id].loginTimeout);
        clearTimeout(activeBots[id].smartRejoinTimer);
        clearInterval(activeBots[id].afkInterval);

        activeBots[id].reconnectTimer = null;
        activeBots[id].loginTimeout = null;
        activeBots[id].smartRejoinTimer = null;
        activeBots[id].afkInterval = null;
    }
}

function killBotInstance(id) {
    if (activeBots[id] && activeBots[id].botInstance) {
        try { activeBots[id].botInstance.end('Disconnecting'); } catch (e) {}
    }
}

// --- Main Bot Logic ---

function startBot(id) {
    const numId = parseInt(id);
    console.log(`[Manager] Attempting to start bot ID: ${numId}`);
    
    const botConfig = savedBots.find(b => b.id === numId);
    if (!botConfig) {
        console.log(`[Manager] Bot ID ${numId} not found in saved configs.`);
        return;
    }

    // If it's already running, don't start it again
    if (activeBots[numId] && (activeBots[numId].status === 'Online' || activeBots[numId].status === 'Connecting')) {
        console.log(`[Manager] Bot ${numId} is already ${activeBots[numId].status}.`);
        return;
    }

    const autoReconnect = botConfig.autoReconnect !== false;
    const autoReconnectDelay = (parseInt(botConfig.autoReconnectDelay) || 15) * 1000;
    const smartRejoin = botConfig.smartRejoin === true;
    const smartRejoinCount = parseInt(botConfig.smartRejoinCount) || 2;
    const smartRejoinDelay = (parseInt(botConfig.smartRejoinDelay) || 5) * 1000;
    const smartRejoinIntervalSec = (parseInt(botConfig.smartRejoinIntervalSec) || 300) * 1000;

    const addressParts = botConfig.address.split(':');
    const host = addressParts[0];
    const port = addressParts.length > 1 ? parseInt(addressParts[1]) : null;

    const currentSmartIndex = activeBots[numId] ? (activeBots[numId].currentSmartIndex || 1) : 1;
    const previousProcessTime = (activeBots[numId] && activeBots[numId].processStartTime) ? activeBots[numId].processStartTime : Date.now();

    clearBotTimers(numId);
    killBotInstance(numId);

    const currentSession = Date.now();

    activeBots[numId] = {
        botInstance: null,
        status: 'Connecting',
        processStartTime: previousProcessTime,
        intentionalDisconnect: false,
        reconnectTimer: null,
        loginTimeout: null,
        smartRejoinTimer: null,
        afkInterval: null,
        currentSmartIndex: currentSmartIndex,
        session: currentSession
    };

    let actualUsername = botConfig.username;
    if (smartRejoin && smartRejoinCount > 1) {
        if (currentSmartIndex > 1) actualUsername = `${botConfig.username}_${currentSmartIndex}`;
        activeBots[numId].currentSmartIndex = (currentSmartIndex % smartRejoinCount) + 1;
    }

    logToBot(numId, `Connecting ${actualUsername} to ${host}${port ? ':'+port : ''}...`);

    try {
        const botOptions = { 
            host: host, 
            username: actualUsername, 
            hideErrors: true
            // Physics removed so the bot falls normally and isn't kicked for invalid movement
        };
        if (port) botOptions.port = port;

        const bot = mineflayer.createBot(botOptions);
        activeBots[numId].botInstance = bot;

        activeBots[numId].loginTimeout = setTimeout(() => {
            if (activeBots[numId] && activeBots[numId].session === currentSession && activeBots[numId].status !== 'Online') {
                logToBot(numId, `Connection timed out. Forcing end...`);
                if (activeBots[numId].botInstance) activeBots[numId].botInstance.end('Timeout');
            }
        }, 35000);

        bot.on('spawn', () => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;

            clearTimeout(activeBots[numId].loginTimeout);
            clearInterval(activeBots[numId].afkInterval);
            clearTimeout(activeBots[numId].smartRejoinTimer);

            logToBot(numId, `Successfully spawned as ${actualUsername}!`);
            activeBots[numId].status = 'Online';

            if (botConfig.joinMessage && botConfig.joinMessage.trim() !== '') {
                setTimeout(() => {
                    if (activeBots[numId] && activeBots[numId].botInstance && activeBots[numId].status === 'Online') {
                        activeBots[numId].botInstance.chat(botConfig.joinMessage);
                        logToBot(numId, `Sent join message: ${botConfig.joinMessage}`);
                    }
                }, 2000);
            }

            if (smartRejoin && smartRejoinIntervalSec > 0) {
                logToBot(numId, `Smart Rejoin timer: rotating in ${smartRejoinIntervalSec / 1000}s.`);
                activeBots[numId].smartRejoinTimer = setTimeout(() => {
                    if (activeBots[numId] && activeBots[numId].botInstance && activeBots[numId].status === 'Online') {
                        logToBot(numId, `Smart Rejoin interval reached. Disconnecting to rotate...`);
                        activeBots[numId].botInstance.end('SmartRejoinRotation');
                    }
                }, smartRejoinIntervalSec);
            }

            activeBots[numId].afkInterval = setInterval(() => {
                if (activeBots[numId] && activeBots[numId].botInstance && activeBots[numId].status === 'Online') {
                    try {
                        if (activeBots[numId].botInstance.entity) {
                            activeBots[numId].botInstance.setControlState('sneak', true);
                            setTimeout(() => {
                                if (activeBots[numId] && activeBots[numId].botInstance && activeBots[numId].botInstance.entity) {
                                    activeBots[numId].botInstance.setControlState('sneak', false);
                                }
                            }, 500);
                        }
                    } catch (err) {}
                }
            }, 300000);
        });

        bot.on('death', () => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;
            logToBot(numId, `Bot died! Respawning...`);
        });

        bot.on('kicked', (reason) => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;
            let parsedReason = '';
            try {
                const parsed = typeof reason === 'string' ? JSON.parse(reason) : reason;
                
                // Safe, depth-limited text extractor to prevent freezing
                const extractText = (obj, depth = 0) => {
                    if (depth > 10) return ''; // Prevent infinite loops
                    if (typeof obj === 'string') return obj;
                    if (!obj || typeof obj !== 'object') return '';
                    
                    if (obj.type && obj.value !== undefined) return extractText(obj.value, depth + 1);
                    
                    let text = obj.text || obj.translate || '';
                    if (typeof text === 'object') text = extractText(text, depth + 1);

                    if (Array.isArray(obj.extra)) text += obj.extra.map(o => extractText(o, depth + 1)).join('');
                    if (Array.isArray(obj.with)) text += obj.with.map(o => extractText(o, depth + 1)).join('');
                    if (Array.isArray(obj)) text += obj.map(o => extractText(o, depth + 1)).join('');
                    
                    return text;
                };
                
                parsedReason = extractText(parsed);
                if (!parsedReason) parsedReason = JSON.stringify(parsed);
            } catch (e) {
                parsedReason = typeof reason === 'object' ? JSON.stringify(reason) : String(reason);
            }
            logToBot(numId, `Kicked: ${parsedReason}`);
        });

        bot.on('error', err => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;
            logToBot(numId, `Network Error: ${err.message}`);
        });

        bot.on('end', (reason) => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;

            if (reason !== 'socketClosed') {
                logToBot(numId, `Disconnected. Reason: ${reason}`);
            }

            activeBots[numId].status = 'Offline';
            activeBots[numId].botInstance = null;
            clearBotTimers(numId);

            if (!activeBots[numId].intentionalDisconnect) {
                let delay;
                if (smartRejoin) {
                    delay = smartRejoinDelay;
                    logToBot(numId, `Smart Rejoin: reconnecting in ${smartRejoinDelay / 1000}s...`);
                } else if (autoReconnect) {
                    delay = autoReconnectDelay;
                    logToBot(numId, `Auto Reconnect: reconnecting in ${autoReconnectDelay / 1000}s...`);
                }

                if (delay) {
                    activeBots[numId].reconnectTimer = setTimeout(() => {
                        if (activeBots[numId] && !activeBots[numId].intentionalDisconnect) {
                            startBot(numId);
                        }
                    }, delay);
                } else {
                    activeBots[numId].processStartTime = null;
                }
            } else {
                activeBots[numId].processStartTime = null;
            }
        });
    } catch (err) {
        console.error(`[Manager] Bot ${numId} threw an error immediately:`, err);
        if (activeBots[numId] && activeBots[numId].session === currentSession) {
            logToBot(numId, `Critical Failure: ${err.message}`);
            activeBots[numId].status = 'Offline';

            if (!activeBots[numId].intentionalDisconnect && (autoReconnect || smartRejoin)) {
                const delay = smartRejoin ? smartRejoinDelay : autoReconnectDelay;
                logToBot(numId, `Retrying in ${delay / 1000}s...`);
                activeBots[numId].reconnectTimer = setTimeout(() => startBot(numId), delay);
            } else {
                activeBots[numId].processStartTime = null;
            }
        }
    }
}

function stopBot(id) {
    const numId = parseInt(id);
    if (activeBots[numId]) {
        activeBots[numId].intentionalDisconnect = true;
        activeBots[numId].currentSmartIndex = 1;
        activeBots[numId].status = 'Offline';
        activeBots[numId].processStartTime = null;

        clearBotTimers(numId);
        killBotInstance(numId);

        logToBot(numId, 'Bot stopped manually.');
    }
}

// --- Routes ---

app.get('/', (req, res) => {
    const botsWithStatus = savedBots.map(b => ({
        ...b,
        status: getStatus(b.id),
        uptime: getUptime(b.id)
    }));
    res.render('index', { view: 'home', bots: botsWithStatus, bot: null });
});

app.post('/create', (req, res) => {
    const { name, username, address, joinMessage } = req.body;
    const newId = savedBots.length > 0 ? Math.max(...savedBots.map(b => b.id)) + 1 : 1;
    savedBots.push({
        id: newId,
        name,
        username,
        address,
        joinMessage: joinMessage || '',
        autoReconnect: true,
        autoReconnectDelay: 15,
        smartRejoin: false,
        smartRejoinCount: 2,
        smartRejoinDelay: 5,
        smartRejoinIntervalSec: 300,
        logs: []
    });
    fs.writeFileSync(BOTS_FILE, JSON.stringify(savedBots, null, 2));
    res.redirect('/');
});

app.get('/:id/logs', (req, res) => {
    const id = parseInt(req.params.id);
    const botConfig = savedBots.find(b => b.id === id);
    let logs = [];
    if (botConfig && botConfig.logs) logs = botConfig.logs;
    const uiLogs = logs.length > 300 ? logs.slice(-300) : logs;
    res.json({ logs: uiLogs, status: getStatus(id), uptime: getUptime(id) });
});

app.post('/:id/clear-logs', (req, res) => {
    const id = parseInt(req.params.id);
    const botConfig = savedBots.find(b => b.id === id);
    if (botConfig) {
        botConfig.logs = [];
        fs.writeFileSync(BOTS_FILE, JSON.stringify(savedBots, null, 2));
    }
    res.redirect(`/${id}`);
});

app.post('/:id/start', (req, res) => { 
    // Force status clearance just in case it got stuck
    if (activeBots[req.params.id]) activeBots[req.params.id].status = 'Offline';
    startBot(req.params.id); 
    res.redirect(`/${req.params.id}`); 
});

app.post('/:id/stop', (req, res) => { stopBot(req.params.id); res.redirect(`/${req.params.id}`); });

app.post('/:id/restart', (req, res) => {
    const id = parseInt(req.params.id);
    stopBot(id);
    setTimeout(() => { 
        if(activeBots[id]) {
            activeBots[id].intentionalDisconnect = false; 
            activeBots[id].status = 'Offline'; // Reset status
        }
        startBot(id); 
    }, 2500);
    res.redirect(`/${id}`);
});

app.post('/:id/edit', (req, res) => {
    const id = parseInt(req.params.id);
    const bot = savedBots.find(b => b.id === id);
    if (bot) {
        bot.name = req.body.name;
        bot.username = req.body.username;
        bot.address = req.body.address;
        bot.joinMessage = req.body.joinMessage || '';
        bot.autoReconnect = req.body.autoReconnect === 'on';
        bot.autoReconnectDelay = parseInt(req.body.autoReconnectDelay) || 15;
        bot.smartRejoin = req.body.smartRejoin === 'on';
        bot.smartRejoinCount = parseInt(req.body.smartRejoinCount) || 2;
        bot.smartRejoinDelay = parseInt(req.body.smartRejoinDelay) || 5;
        bot.smartRejoinIntervalSec = parseInt(req.body.smartRejoinIntervalSec) || 300;
        fs.writeFileSync(BOTS_FILE, JSON.stringify(savedBots, null, 2));
    }
    res.redirect(`/${id}`);
});

app.post('/:id/delete', (req, res) => {
    const id = parseInt(req.params.id);
    stopBot(id);
    delete activeBots[id];
    savedBots = savedBots.filter(b => b.id !== id);
    fs.writeFileSync(BOTS_FILE, JSON.stringify(savedBots, null, 2));
    res.redirect('/');
});

app.get('/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const bot = savedBots.find(b => b.id === id);
    if (!bot) return res.status(404).send('Bot not found');
    res.render('index', { view: 'manage', bot, status: getStatus(id), uptime: getUptime(id), bots: [] });
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Manager running at http://0.0.0.0:${PORT}`);
    if (savedBots.length > 0) {
        console.log(`Auto-starting ${savedBots.length} saved bot(s)...`);
        savedBots.forEach((bot, index) => {
            setTimeout(() => {
                if (activeBots[bot.id]) activeBots[bot.id].status = 'Offline';
                startBot(bot.id);
            }, index * 1500);
        });
    }
});
