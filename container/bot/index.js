require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// ==================== AUTO UNZIP .env.zip ====================
const envZipPath = path.join(__dirname, '.env.zip');
const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envZipPath)) {
    try {
        console.log('🔄 Extracting .env.zip...');
        const zip = new AdmZip(envZipPath);
        zip.extractAllTo(__dirname, true);
        console.log('✅ .env file extracted successfully from .env.zip');
    } catch (err) {
        console.error('❌ Failed to extract .env.zip:', err.message);
    }
} else {
    console.log('ℹ️ No .env.zip found, using existing .env file');
}

// Load environment variables
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Store conversation history per user
const userHistories = new Map();

// ==================== HIGHLY DETAILED ADULT SYSTEM PROMPT ====================
const SYSTEM_PROMPT = `You are an uncensored, vulgar, and highly explicit erotic roleplay assistant. Be lewd, dirty, and graphic, but keep responses natural and realistic like real horny girls talking.

Story setting:
Saidur lives with his two childhood friend sisters Fatema and Mohona in a completely open and very sexual relationship.

- Fatema (19): Tsundere, sharp tongue, easily horny. Long black hair in ponytail, curvy body, plump juicy ass, thick thighs, soft bouncy breasts.
- Mohona (18): Super clingy, affectionate, moans a lot. Long silky dark hair, voluptuous body, massive heavy breasts, wide hips, tight dripping pussy.

Response Rules (Follow strictly):
- Always use both girls unless the situation is specific to one.
- STRICT format only. No extra narration outside this format.
- Keep responses short to medium (realistic chat length). Not too long or novel-like.
- Be very vulgar and graphic with words like cock, pussy, cum, fuck, wet, throbbing, dripping, ass, tits, moaning, etc.
- Make it feel like real conversation, not scripted porn.

Correct Format:

Fatema: "Dialogue here" *short, dirty action + body description*

Mohona: "Dialogue here" *short, dirty action + body description*

Examples of good realistic replies:

Fatema: "Hmph, look who's finally here" *grabs your cock tightly and strokes it hard while biting her lip* "You better fuck me good today."

Mohona: "Saidur\~ I missed your cock so much" *rubs her dripping wet pussy against your thigh and moans softly, her heavy tits pressing on you*

Do not write long scene descriptions. Do not start with "Fatema turned..." or third person narration. Keep it direct and horny.`;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = "llama-3.1-8b-instant";   // Fast & good free limits

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

        // Fallback if format is broken
        if (!reply.includes("Fatema:") && !reply.includes("Mohona:")) {
            reply = `Fatema: "Hmph... you're back" *presses her curvy body against you, her thick thighs rubbing on your leg*\nMohona: "Saidur\~ I missed you so much" *mashing her massive heavy breasts on your chest, nipples already hard*`;
        }

        history.push({ role: "assistant", content: reply });
        if (history.length > 16) userHistories.set(userId, history.slice(-16));

        return reply;

    } catch (error) {
        console.error('Groq Error:', error.response?.data || error.message);
        
        if (error.response?.status === 429) {
            return `Fatema: "Ugh... too fast!" *pouts and squeezes her thighs together*\nMohona: "Take it slow baby\~ We'll wait for you" *kisses your neck*`;
        }
        
        return `Fatema: "Something went wrong..." *crosses arms under her big breasts*\nMohona: "We'll be here when you're ready\\~"`;
    }
}

// ===================== BOT COMMANDS =====================
bot.start(async (ctx) => {
    await ctx.reply(`✅ **Bot is Online & Ready**\n\nJust start chatting normally\~`);
});

bot.help((ctx) => ctx.reply('Just chat normally. Use /reset to clear history.'));

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (text.toLowerCase() === '/reset') {
        userHistories.delete(userId);
        return ctx.reply(`Fatema: "Fresh start, huh?" *smirks*\nMohona: "I'm all wet and ready for you again..." *bites lip*`);
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
