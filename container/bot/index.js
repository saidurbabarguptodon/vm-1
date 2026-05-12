const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { SYSTEM_PROMPT } = require('./systemprompt');

const envZipPath = path.join(__dirname, '.env.zip');

// === STRICT .env.zip CHECK ===
if (fs.existsSync(envZipPath)) {
    try {
        const zip = new AdmZip(envZipPath);
        zip.extractAllTo(__dirname, true);
        console.log('✅ .env.zip found and extracted successfully');
    } catch (err) {
        console.error('❌ Failed to extract .env.zip:', err.message);
        process.exit(1);
    }
} else {
    console.error('❌ .env.zip file not found! Please place .env.zip in the bot folder.');
    console.error('Bot is stopping...');
    process.exit(1);
}

// Load environment variables after extraction
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = "llama-3.1-8b-instant";
const MAX_HISTORY = 20;        // Maximum messages to keep in history

const userHistories = new Map();

async function getAIResponse(userId, userMessage) {
    if (!userHistories.has(userId)) {
        userHistories.set(userId, []);
    }

    const history = userHistories.get(userId);
    
    // Add new user message
    history.push({ role: "user", content: userMessage });

    // Keep only the latest MAX_HISTORY messages
    if (history.length > MAX_HISTORY) {
        userHistories.set(userId, history.slice(-MAX_HISTORY));
    }

    try {
        const response = await axios.post(GROQ_URL, {
            model: MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...userHistories.get(userId)
            ],
            temperature: 0.88,
            max_tokens: 1200,
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let reply = response.data.choices[0].message.content.trim();

        // Add assistant reply
        history.push({ role: "assistant", content: reply });

        // Trim again after adding reply
        if (history.length > MAX_HISTORY) {
            userHistories.set(userId, history.slice(-MAX_HISTORY));
        }

        return reply;

    } catch (error) {
        console.error('Groq Error:', error.response?.data || error.message);
        
        if (error.response?.status === 429) {
            return "[SYSTEM] Rate limit reached. Please wait a moment.";
        }
        if (error.response?.status === 413 || String(error).includes("context")) {
            return "[SYSTEM] Conversation too long. Use /reset to start fresh.";
        }
        return "[SYSTEM] Something went wrong... Please try again.";
    }
}

// ==================== COMMANDS ====================

bot.start(async (ctx) => {
    await ctx.reply(
`You just came back home after a long day...

Your two childhood friends — Fatema and Mohona — who are so close to you that they're basically like sisters, have been living together with you for a while now.

The relationship between the three of you has long become extremely open... and very sexual.`
    );
});

bot.help((ctx) => {
    ctx.reply(`Available Commands:\n/start - Start the roleplay\n/reset - Reset conversation history\n/help - Show this message`);
});

bot.command('reset', (ctx) => {
    const userId = ctx.from.id;
    userHistories.delete(userId);
    ctx.reply("✅ Conversation history has been reset.");
});

// ==================== MAIN HANDLER ====================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Ignore unknown commands
    if (text.startsWith('/') && !['/start', '/help', '/reset'].includes(text.split(' ')[0])) {
        return;
    }

    await ctx.replyWithChatAction('typing');
    const reply = await getAIResponse(userId, text);
    await ctx.reply(reply);
});

bot.catch((err) => console.error('Bot Error:', err));

bot.launch()
    .then(() => console.log('✅ Private Roleplay Bot Started Successfully!'))
    .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
