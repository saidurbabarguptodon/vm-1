const express = require('express');
const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');

// Prevent a single bot's network error from crashing the entire Express server
process.on('uncaughtException', (err) => console.error('[Global Error]', err));
process.on('unhandledRejection', (err) => console.error('[Global Rejection]', err));

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', __dirname);

const BOTS_FILE = path.join(__dirname, 'bots.json');

let savedBots =[];
if (fs.existsSync(BOTS_FILE)) {
    try {
        savedBots = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
    } catch (e) {
        savedBots = [];
        fs.writeFileSync(BOTS_FILE, JSON.stringify([]));
    }
} else {
    fs.writeFileSync(BOTS_FILE, JSON.stringify([]));
}

const activeBots = {}; 

// --- Helper Functions ---

function getLogFile(botConfig) {
    // Sanitize name to prevent invalid filenames (e.g., "My Bot" -> "My_Bot.json")
    const safeName = botConfig.name.replace(/[^a-z0-9]/gi, '_');
    return path.join(__dirname, `${safeName}.json`);
}

function logToBot(id, msg) {
    const time = new Date().toLocaleTimeString();
    const cleanMsg = String(msg).replace(/§[0-9a-fk-or]/g, ''); 
    const logEntry = `[${time}] ${cleanMsg}`;

    const botConfig = savedBots.find(b => b.id === parseInt(id));
    if (botConfig) {
        const file = getLogFile(botConfig);
        let allLogs =[];
        if (fs.existsSync(file)) {
            try { allLogs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){}
        }
        allLogs.push(logEntry);
        // Hard cap at 2000 lines so the file doesn't crash your server's storage over time
        if (allLogs.length > 2000) allLogs.shift();
        fs.writeFileSync(file, JSON.stringify(allLogs, null, 2));
    }
}

function getStatus(id) { return activeBots[id] ? activeBots[id].status : 'Offline'; }

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
        clearTimeout(activeBots[id].smartJoinTimer); 
        clearInterval(activeBots[id].afkInterval);
        
        activeBots[id].reconnectTimer = null;
        activeBots[id].loginTimeout = null;
        activeBots[id].smartJoinTimer = null;
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
    const botConfig = savedBots.find(b => b.id === numId);
    if (!botConfig) return;
    
    if (activeBots[numId] && (activeBots[numId].status === 'Online' || activeBots[numId].status === 'Connecting')) return;

    const autoReconnect = botConfig.autoReconnect !== false; 
    const smartJoin = botConfig.smartJoin === true; 
    const smartJoinCount = parseInt(botConfig.smartJoinCount) || 2;
    const smartJoinInterval = parseInt(botConfig.smartJoinInterval) || 0; 
    
    const addressParts = botConfig.address.split(':');
    const host = addressParts[0];
    const port = addressParts.length > 1 ? parseInt(addressParts[1]) : null;

    const currentSmartIndex = activeBots[numId] ? (activeBots[numId].currentSmartIndex || 1) : 1;
    
    // Uptime retention logic: Keep the process start time if it's already running
    const previousProcessTime = (activeBots[numId] && activeBots[numId].processStartTime) ? activeBots[numId].processStartTime : Date.now();

    clearBotTimers(numId);
    killBotInstance(numId);

    const currentSession = Date.now();

    activeBots[numId] = { 
        botInstance: null, 
        status: 'Connecting', 
        processStartTime: previousProcessTime, // Does not reset during rotation
        intentionalDisconnect: false,
        reconnectTimer: null,
        loginTimeout: null,
        smartJoinTimer: null,
        afkInterval: null,
        currentSmartIndex: currentSmartIndex,
        session: currentSession
    };
    
    let actualUsername = botConfig.username;
    if (smartJoin && smartJoinCount > 1) {
        if (currentSmartIndex > 1) actualUsername = `${botConfig.username}_${currentSmartIndex}`;
        activeBots[numId].currentSmartIndex = (currentSmartIndex % smartJoinCount) + 1; 
    }

    logToBot(numId, `Connecting ${actualUsername} to ${host}${port ? ':'+port : ''}...`);

    try {
        const botOptions = { host: host, username: actualUsername, hideErrors: true };
        if (port) botOptions.port = port;

        const bot = mineflayer.createBot(botOptions);
        activeBots[numId].botInstance = bot;

        activeBots[numId].loginTimeout = setTimeout(() => {
            if (activeBots[numId] && activeBots[numId].session === currentSession && activeBots[numId].status !== 'Online') {
                logToBot(numId, `Connection timed out (Server unresponsive). Forcing end...`);
                if (activeBots[numId].botInstance) activeBots[numId].botInstance.end('Timeout');
            }
        }, 35000);

        bot.on('spawn', () => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;
            
            clearTimeout(activeBots[numId].loginTimeout); 
            clearInterval(activeBots[numId].afkInterval);
            clearTimeout(activeBots[numId].smartJoinTimer);

            logToBot(numId, `Successfully spawned in world as ${actualUsername}!`);
            activeBots[numId].status = 'Online';

            // Auto-Join Message Logic (Delayed to ensure server is ready to accept chat)
            if (botConfig.joinMessage && botConfig.joinMessage.trim() !== '') {
                setTimeout(() => {
                    if (activeBots[numId] && activeBots[numId].botInstance && activeBots[numId].status === 'Online') {
                        activeBots[numId].botInstance.chat(botConfig.joinMessage);
                        logToBot(numId, `Auto-Sent message: ${botConfig.joinMessage}`);
                    }
                }, 2000); 
            }

            // Smart Join Interval Rotation
            if (smartJoin && smartJoinInterval > 0) {
                const msDelay = smartJoinInterval * 60 * 1000;
                logToBot(numId, `Smart Join timer started. Bot will natively rotate in ${smartJoinInterval} minute(s).`);
                
                activeBots[numId].smartJoinTimer = setTimeout(() => {
                    if (activeBots[numId] && activeBots[numId].botInstance && activeBots[numId].status === 'Online') {
                        logToBot(numId, `Smart Join limit reached (${smartJoinInterval}m). Disconnecting to rotate...`);
                        activeBots[numId].botInstance.end('SmartJoinLimitReached');
                    }
                }, msDelay);
            }

            // Anti-AFK
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
            logToBot(numId, `Bot died! Mineflayer is attempting to respawn...`);
        });

        bot.on('kicked', (reason) => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;
            let parsedReason = reason;
            try { 
                const json = JSON.parse(reason); 
                parsedReason = json.text || json.translate || reason;
            } catch (e) {}
            logToBot(numId, `Kicked: ${parsedReason}`);
        });

        bot.on('error', err => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;
            logToBot(numId, `Network Error: ${err.message}`);
        });

        bot.on('end', (reason) => {
            if (!activeBots[numId] || activeBots[numId].session !== currentSession) return;

            logToBot(numId, `Disconnected. Reason: ${reason}`);
            
            activeBots[numId].status = 'Offline';
            activeBots[numId].botInstance = null;
            clearBotTimers(numId);

            // Reconnection / Smart Join Logic
            if (!activeBots[numId].intentionalDisconnect && (autoReconnect || smartJoin)) {
                const delay = smartJoin ? 5000 : 15000;
                const msg = smartJoin ? `Smart Join rotating to next bot in 5s...` : `Auto-reconnecting in 15s...`;
                
                logToBot(numId, msg);
                
                activeBots[numId].reconnectTimer = setTimeout(() => {
                    if (activeBots[numId] && !activeBots[numId].intentionalDisconnect) {
                        startBot(numId);
                    }
                }, delay);
            } else {
                // If the bot naturally disconnected without loops, clear uptime
                activeBots[numId].processStartTime = null; 
            }
        });
    } catch (err) {
        if (activeBots[numId] && activeBots[numId].session === currentSession) {
            logToBot(numId, `Critical Failure: ${err.message}`);
            activeBots[numId].status = 'Offline';
            
            if (!activeBots[numId].intentionalDisconnect && (autoReconnect || smartJoin)) {
                logToBot(numId, `Retrying connection in 15 seconds...`);
                activeBots[numId].reconnectTimer = setTimeout(() => startBot(numId), 15000);
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
        activeBots[numId].processStartTime = null; // Kill uptime display
        
        clearBotTimers(numId); 
        killBotInstance(numId); 

        logToBot(numId, 'Bot was stopped manually.');
    }
}

// --- Routes ---

app.get('/', (req, res) => {
    const botsWithStatus = savedBots.map(b => ({ ...b, status: getStatus(b.id), uptime: getUptime(b.id) }));
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
        smartJoin: false, 
        smartJoinCount: 2, 
        smartJoinInterval: 0 
    });
    fs.writeFileSync(BOTS_FILE, JSON.stringify(savedBots, null, 2));
    res.redirect('/');
});

app.get('/:id/logs', (req, res) => {
    const id = parseInt(req.params.id);
    const botConfig = savedBots.find(b => b.id === id);
    let fileLogs =[];

    // Load logs directly from {botname}.json
    if (botConfig) {
        const file = getLogFile(botConfig);
        if (fs.existsSync(file)) {
            try { fileLogs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){}
        }
    }
    
    // Send only the last 300 logs to the UI to prevent browser lag, 
    // but the actual file keeps everything (up to 2000 lines).
    const uiLogs = fileLogs.length > 300 ? fileLogs.slice(-300) : fileLogs;

    res.json({ logs: uiLogs, status: getStatus(id), uptime: getUptime(id) });
});

app.post('/:id/clear-logs', (req, res) => {
    const id = parseInt(req.params.id);
    const botConfig = savedBots.find(b => b.id === id);
    if (botConfig) {
        const file = getLogFile(botConfig);
        fs.writeFileSync(file, JSON.stringify([], null, 2)); // Empties the file safely
    }
    res.redirect(`/${id}`);
});

app.post('/:id/start', (req, res) => { startBot(req.params.id); res.redirect(`/${req.params.id}`); });
app.post('/:id/stop', (req, res) => { stopBot(req.params.id); res.redirect(`/${req.params.id}`); });
app.post('/:id/restart', (req, res) => { 
    const id = parseInt(req.params.id);
    stopBot(id); 
    setTimeout(() => { if(activeBots[id]) activeBots[id].intentionalDisconnect = false; startBot(id); }, 2500);
    res.redirect(`/${id}`); 
});

app.post('/:id/edit', (req, res) => {
    const id = parseInt(req.params.id);
    const bot = savedBots.find(b => b.id === id);
    if(bot) {
        bot.name = req.body.name;
        bot.username = req.body.username;
        bot.address = req.body.address;
        bot.joinMessage = req.body.joinMessage || '';
        bot.autoReconnect = req.body.autoReconnect === 'on';
        bot.smartJoin = req.body.smartJoin === 'on';
        bot.smartJoinCount = parseInt(req.body.smartJoinCount) || 2;
        bot.smartJoinInterval = parseInt(req.body.smartJoinInterval) || 0;
        fs.writeFileSync(BOTS_FILE, JSON.stringify(savedBots, null, 2));
    }
    res.redirect(`/${id}`);
});

app.post('/:id/delete', (req, res) => {
    const id = parseInt(req.params.id);
    stopBot(id);
    
    const botConfig = savedBots.find(b => b.id === id);
    if (botConfig) {
        const file = getLogFile(botConfig);
        if (fs.existsSync(file)) fs.unlinkSync(file); // Deletes the JSON log file entirely
    }

    delete activeBots[id];
    savedBots = savedBots.filter(b => b.id !== id);
    fs.writeFileSync(BOTS_FILE, JSON.stringify(savedBots, null, 2));
    res.redirect('/');
});

app.get('/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const bot = savedBots.find(b => b.id === id);
    if (!bot) return res.status(404).send('Bot not found');
    res.render('index', { view: 'manage', bot, status: getStatus(id), uptime: getUptime(id), bots:[] });
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Manager running at http://0.0.0.0:${PORT}`);
    
    // --- Start all bots on boot automatically ---
    if (savedBots.length > 0) {
        console.log(`Auto-starting ${savedBots.length} saved bot(s)...`);
        
        savedBots.forEach((bot, index) => {
            // Add a staggered delay (1.5 seconds) per bot to avoid network throttling or lag spikes
            setTimeout(() => {
                startBot(bot.id);
            }, index * 1500); 
        });
    }
});
