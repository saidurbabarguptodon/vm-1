import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import mineflayer from "mineflayer";
import os from "os";
import fs from "fs";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

const app = express();
const PORT = 3000;

app.use(express.json());

interface BotInfo {
  username: string;
  status: "connecting" | "online" | "disconnected" | "error";
  logs: string[];
  connectedAt?: number;
}

interface BotData {
  bot: mineflayer.Bot;
  info: BotInfo;
  options?: any;
  reconnectTimeout?: NodeJS.Timeout;
}

const activeBots = new Map<string, BotData>();
const DATA_FILE = path.join(process.cwd(), 'data.json');

function saveData() {
  try {
    const dataToSave = { bots: {} as any };
    for (const [username, botData] of activeBots.entries()) {
      dataToSave.bots[username] = {
        options: botData.options,
        logs: botData.info.logs
      };
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2));
  } catch (e) {
    console.error("Failed to save data.json", e);
  }
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (data.bots) {
        for (const [username, botData] of Object.entries<any>(data.bots)) {
          activeBots.set(username, {
            bot: null as any,
            info: {
              username,
              status: "disconnected",
              logs: botData.logs || []
            },
            options: botData.options || {}
          });
          if (botData.options?.autoStart) {
            createAndConnectBot(
              username, 
              botData.options.host, 
              botData.options.targetPort, 
              botData.options.version, 
              botData.options.autoJoin, 
              botData.options.autoJoinInterval,
              true
            );
          }
        }
      }
    }
  } catch (e) {
    console.error("Failed to load data.json", e);
  }
}

// Helper to add logs
const addLog = (username: string, message: string) => {
  const botData = activeBots.get(username);
  if (botData) {
    botData.info.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
    if (botData.info.logs.length > 50) {
      botData.info.logs.shift(); // Keep last 50 logs
    }
    saveData();
  }
};

function createAndConnectBot(botName: string, host: string, targetPort: number, version: any, autoJoin: boolean, autoJoinInterval: number, autoStart: boolean = false) {
  const existingData = activeBots.get(botName);
  const info: BotInfo = existingData?.info || {
    username: botName,
    status: "connecting",
    logs: [`Initializing connection to ${host}:${targetPort}...`]
  };

  info.status = "connecting";

  try {
    const bot = mineflayer.createBot({
      host: host,
      port: targetPort,
      username: botName,
      version: version || false,
    });

    activeBots.set(botName, { 
      bot, 
      info, 
      options: { host, targetPort, version, autoJoin, autoJoinInterval, autoStart } 
    });
    saveData();

    bot.on("login", () => {
      info.status = "online";
      info.connectedAt = Date.now();
      addLog(botName, "Logged in successfully.");
    });

    bot.on("spawn", () => {
      addLog(botName, "Spawned in the world.");
    });

    bot.on("end", (reason) => {
      info.status = "disconnected";
      addLog(botName, `Disconnected: ${reason}`);
      handleReconnect(botName);
    });

    bot.on("kicked", (reason) => {
      info.status = "disconnected";
      addLog(botName, `Kicked: ${reason}`);
    });

    bot.on("error", (err) => {
      info.status = "error";
      addLog(botName, `Error: ${err.message}`);
      handleReconnect(botName);
    });

    bot.on("message", (cm) => {
      const msg = cm.toString();
      if (msg.trim()) {
        addLog(botName, msg);
      }
    });

  } catch (err: any) {
    info.status = "error";
    info.logs.push(`Failed to create bot: ${err.message}`);
    activeBots.set(botName, { 
      bot: null as any, 
      info, 
      options: { host, targetPort, version, autoJoin, autoJoinInterval, autoStart } 
    });
    saveData();
    handleReconnect(botName);
  }
}

function handleReconnect(botName: string) {
  const botData = activeBots.get(botName);
  if (!botData || !botData.options?.autoJoin) return;
  
  if (botData.reconnectTimeout) {
    clearTimeout(botData.reconnectTimeout);
  }

  const interval = botData.options.autoJoinInterval || 5;
  addLog(botName, `Auto Join enabled. Reconnecting in ${interval}s...`);
  
  botData.reconnectTimeout = setTimeout(() => {
    if (activeBots.has(botName)) {
      createAndConnectBot(botName, botData.options.host, botData.options.targetPort, botData.options.version, botData.options.autoJoin, botData.options.autoJoinInterval, botData.options.autoStart);
    }
  }, interval * 1000);
}

// API Routes
app.post("/api/bots/edit", (req, res) => {
  const { username, newUsername, address, version, autoJoin, autoJoinInterval, autoStart } = req.body;
  const botData = activeBots.get(username);
  if (!botData) return res.status(404).json({ error: "Bot not found" });

  let host = address;
  let targetPort = 25565;
  if (address && address.includes(':')) {
    const parts = address.split(':');
    host = parts[0];
    targetPort = parseInt(parts[1]) || 25565;
  } else if (address) {
    host = address;
  } else {
    host = botData.options.host;
    targetPort = botData.options.targetPort;
  }

  const updatedOptions = { 
    host, 
    targetPort, 
    version: version !== undefined ? version : botData.options.version, 
    autoJoin: autoJoin !== undefined ? autoJoin : botData.options.autoJoin, 
    autoJoinInterval: autoJoinInterval !== undefined ? parseInt(autoJoinInterval) : botData.options.autoJoinInterval,
    autoStart: autoStart !== undefined ? autoStart : botData.options.autoStart
  };

  if (newUsername && newUsername !== username) {
    if (activeBots.has(newUsername)) {
      return res.status(400).json({ error: "New username already exists" });
    }
    
    if (botData.reconnectTimeout) clearTimeout(botData.reconnectTimeout);
    if (botData.bot) botData.bot.quit();
    
    activeBots.delete(username);
    
    const info = {
      ...botData.info,
      username: newUsername,
      status: "disconnected" as const
    };
    
    activeBots.set(newUsername, {
      bot: null as any,
      info,
      options: updatedOptions
    });
  } else {
    botData.options = updatedOptions;
  }
  
  saveData();
  res.json({ success: true, newUsername: newUsername || username });
});

app.post("/api/bots/start", async (req, res) => {
  const { address, username, count, version, autoJoin, autoJoinInterval, autoStart } = req.body;

  if (!address || !username || !count) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let host = address;
  let targetPort = 25565;
  if (address.includes(':')) {
    const parts = address.split(':');
    host = parts[0];
    targetPort = parseInt(parts[1]) || 25565;
  }

  const numBots = Math.min(Math.max(parseInt(count) || 1, 1), 20); // Limit to 20 bots max
  const startedBots = [];

  for (let i = 0; i < numBots; i++) {
    const botName = numBots === 1 ? username : `${username}_${i + 1}`;
    
    if (activeBots.has(botName)) {
      continue; // Skip if bot already exists
    }

    createAndConnectBot(botName, host, targetPort, version, autoJoin || false, parseInt(autoJoinInterval) || 5, autoStart || false);
    startedBots.push(botName);

    // Small delay to prevent overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  res.json({ success: true, started: startedBots });
});

app.post("/api/bots/action", (req, res) => {
  const { username, action } = req.body;
  const botData = activeBots.get(username);
  
  if (!botData) return res.status(404).json({ error: "Bot not found" });

  if (action === 'stop') {
    if (botData.reconnectTimeout) clearTimeout(botData.reconnectTimeout);
    botData.options.autoJoin = false;
    if (botData.bot) botData.bot.quit();
    botData.info.status = 'disconnected';
    addLog(username, "Manually stopped.");
    saveData();
  } else if (action === 'start') {
    if (botData.info.status === 'disconnected' || botData.info.status === 'error') {
      createAndConnectBot(username, botData.options.host, botData.options.targetPort, botData.options.version, botData.options.autoJoin, botData.options.autoJoinInterval, botData.options.autoStart);
    }
  } else if (action === 'restart') {
    if (botData.reconnectTimeout) clearTimeout(botData.reconnectTimeout);
    if (botData.bot) botData.bot.quit();
    setTimeout(() => {
      createAndConnectBot(username, botData.options.host, botData.options.targetPort, botData.options.version, botData.options.autoJoin, botData.options.autoJoinInterval, botData.options.autoStart);
    }, 1000);
  } else if (action === 'terminate') {
    if (botData.reconnectTimeout) clearTimeout(botData.reconnectTimeout);
    if (botData.bot) botData.bot.quit();
    activeBots.delete(username);
    saveData();
  }
  
  res.json({ success: true });
});

app.post("/api/bots/move", (req, res) => {
  const { username, control, state } = req.body;
  const botData = activeBots.get(username);
  
  if (botData && botData.bot && botData.info.status === 'online') {
    try {
      botData.bot.setControlState(control, state);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to set control state" });
    }
  } else {
    res.status(400).json({ error: "Bot not online" });
  }
});

app.post("/api/bots/chat", (req, res) => {
  const { username, message } = req.body;
  const botData = activeBots.get(username);
  
  if (botData && botData.bot && botData.info.status === 'online') {
    try {
      botData.bot.chat(message);
      addLog(username, `[YOU] ${message}`);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to send chat" });
    }
  } else {
    res.status(400).json({ error: "Bot not online" });
  }
});

app.post("/api/bots/stop", (req, res) => {
  const { username } = req.body;

  if (username) {
    const botData = activeBots.get(username);
    if (botData) {
      if (botData.reconnectTimeout) clearTimeout(botData.reconnectTimeout);
      if (botData.bot) botData.bot.quit();
      botData.info.status = 'disconnected';
      saveData();
      return res.json({ success: true, message: `Bot ${username} stopped.` });
    }
    return res.status(404).json({ error: "Bot not found" });
  } else {
    // Stop all bots
    let count = 0;
    for (const [name, botData] of activeBots.entries()) {
      if (botData.reconnectTimeout) clearTimeout(botData.reconnectTimeout);
      if (botData.bot) botData.bot.quit();
      botData.info.status = 'disconnected';
      count++;
    }
    saveData();
    return res.json({ success: true, message: `Stopped ${count} bots.` });
  }
});

app.get("/api/bots/status", (req, res) => {
  const statuses = Array.from(activeBots.values()).map(b => {
    let ping = 0;
    let health = 20;
    let food = 20;
    let position = { x: 0, y: 0, z: 0 };
    let nearbyEntities: any[] = [];

    if (b.bot && b.bot.player) {
      ping = b.bot.player.ping || 0;
    } else if (b.bot && b.bot.players && b.bot.players[b.info.username]) {
      ping = b.bot.players[b.info.username].ping || 0;
    }

    if (b.bot) {
      health = b.bot.health || 20;
      food = b.bot.food || 20;
      if (b.bot.entity && b.bot.entity.position) {
        position = b.bot.entity.position;
        
        // Calculate nearby entities
        if (b.bot.entities) {
          for (const id in b.bot.entities) {
            const entity = b.bot.entities[id];
            if (entity !== b.bot.entity && entity.position) {
              const dx = entity.position.x - position.x;
              const dy = entity.position.y - position.y;
              const dz = entity.position.z - position.z;
              const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
              
              if (dist <= 32) {
                nearbyEntities.push({
                  id: entity.id,
                  type: entity.type,
                  name: entity.username || entity.name || entity.displayName || 'Unknown',
                  x: dx,
                  z: dz
                });
              }
            }
          }
        }
      }
    }

    const uptime = b.info.connectedAt && b.info.status === 'online' 
      ? Math.floor((Date.now() - b.info.connectedAt) / 1000) 
      : 0;

    return { 
      ...b.info, 
      ping,
      health,
      food,
      position,
      nearbyEntities,
      uptime,
      host: b.options?.host,
      port: b.options?.targetPort,
      version: b.options?.version,
      autoJoin: b.options?.autoJoin,
      autoJoinInterval: b.options?.autoJoinInterval,
      autoStart: b.options?.autoStart
    };
  });
  res.json({ 
    bots: statuses,
    system: {
      memory: process.memoryUsage().rss,
      uptime: process.uptime(),
      cpu: os.loadavg()[0],
      totalMem: os.totalmem(),
      freeMem: os.freemem()
    }
  });
});

async function startServer() {
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, { path: '/viewer/socket.io' });

  // Serve prismarine-viewer static files
  app.use('/viewer', express.static(path.join(process.cwd(), 'node_modules/prismarine-viewer/public')));

  let WorldView: any;
  try {
    WorldView = require('prismarine-viewer/viewer').WorldView;
  } catch (e) {
    console.error("Failed to load prismarine-viewer", e);
  }

  io.on('connection', (socket) => {
    const botName = socket.handshake.query.bot as string;
    if (!botName) {
      socket.disconnect();
      return;
    }

    const botData = activeBots.get(botName);
    if (!botData || !botData.bot || !botData.bot.entity) {
      socket.disconnect();
      return;
    }

    const bot = botData.bot;
    socket.emit('version', bot.version);

    if (WorldView) {
      const worldView = new WorldView(bot.world, 6, bot.entity.position, socket);
      worldView.init(bot.entity.position);

      function botPosition() {
        if (!bot || !bot.entity) return;
        const packet = { pos: bot.entity.position, yaw: bot.entity.yaw, addMesh: true };
        socket.emit('position', packet);
        worldView.updatePosition(bot.entity.position);
      }

      bot.on('move', botPosition);
      worldView.listenToBot(bot);

      socket.on('disconnect', () => {
        bot.removeListener('move', botPosition);
        worldView.removeListenersFromBot(bot);
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    loadData();
  });
}

startServer();
