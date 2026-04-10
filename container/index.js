function startBot(id) {
    const numId = parseInt(id);
    const botConfig = savedBots.find(b => b.id === numId);
    if (!botConfig) return;

    if (activeBots[numId] && (activeBots[numId].status === 'Online' || activeBots[numId].status === 'Connecting')) return;

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
            // physics: false is REMOVED so the bot falls to the ground normally
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
                
                // Advanced extractor for Minecraft NBT/JSON nested structures
                const extractText = (obj) => {
                    if (typeof obj === 'string') return obj;
                    if (!obj) return '';
                    
                    // NBT wrapped value: { type: "string", value: "..." }
                    if (obj.type && obj.value !== undefined) return extractText(obj.value);
                    
                    let text = obj.text || obj.translate || '';
                    if (typeof text === 'object') text = extractText(text);

                    if (Array.isArray(obj.extra)) text += obj.extra.map(extractText).join('');
                    if (Array.isArray(obj.with)) text += obj.with.map(extractText).join('');
                    if (Array.isArray(obj)) text += obj.map(extractText).join('');
                    
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

            // Only log "Disconnected" if it isn't the generic socketClosed that duplicates the Kicked message
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
