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
const MAX_HISTORY = 20;

const userHistories = new Map();

async function getAIResponse(userId, userMessage) {
    if (!userHistories.has(userId)) {
        userHistories.set(userId, []);
    }

    const history = userHistories.get(userId);
    
    history.push({ role: "user", content: userMessage });

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

        history.push({ role: "assistant", content: reply });

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
`You open the door and enter your own small 1-bedroom apartment after a long tiring day.

Zara — the girl you've lived with since childhood and always treated as your little sister — is waiting for you.

Even though you're not blood-related, the two of you have always been extremely close. 
Over time that closeness turned into something much deeper... and very sexual.

It's a hot summer evening.`
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
