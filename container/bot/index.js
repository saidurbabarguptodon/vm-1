require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { SYSTEM_PROMPT } = require('./systemprompt');

const envZipPath = path.join(__dirname, '.env.zip');

if (fs.existsSync(envZipPath)) {
    try {
        const zip = new AdmZip(envZipPath);
        zip.extractAllTo(__dirname, true);
    } catch (err) {
        console.error('Failed to extract .env.zip:', err.message);
    }
}

require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const userHistories = new Map();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = "llama-3.1-8b-instant";

async function getAIResponse(userId, userMessage) {
    if (!userHistories.has(userId)) userHistories.set(userId, []);

    const history = userHistories.get(userId);
    history.push({ role: "user", content: userMessage });

    try {
        const response = await axios.post(GROQ_URL, {
            model: MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...history
            ],
            temperature: 0.88,
            max_tokens: 1000,
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let reply = response.data.choices[0].message.content.trim();

        history.push({ role: "assistant", content: reply });
        if (history.length > 30) userHistories.set(userId, history.slice(-30));

        return reply;

    } catch (error) {
        console.error('Groq Error:', error.response?.data || error.message);
        
        if (error.response?.status === 429) {
            return `[SYSTEM] Rate limit reached. Please wait.`;
        }
        
        return `[SYSTEM] Error occurred. Please try again later.`;
    }
}

bot.start(async (ctx) => {
    await ctx.reply(
`You just came back home after a long day...

Your two childhood friends — Fatema and Mohona — who are so close to you that they're basically like sisters, have been living together with you for a while now.

The relationship between the three of you has long become extremely open... and very sexual.`
    );
});

bot.help((ctx) => ctx.reply(`[SYSTEM] /reset - Use to reset the conversation.`));

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (text.toLowerCase() === '/reset') {
        userHistories.delete(userId);
        return ctx.reply(`[SYSTEM] History reset.`);
    }

    await ctx.replyWithChatAction('typing');
    const reply = await getAIResponse(userId, text);
    await ctx.reply(reply);
});

bot.catch((err) => console.error('Bot Error:', err));

bot.launch()
    .then(() => console.log('✅ Bot started successfully with Groq!'))
    .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
