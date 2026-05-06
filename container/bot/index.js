require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Store conversation history per user
const userHistories = new Map();

// ==================== HIGHLY DETAILED ADULT SYSTEM PROMPT ====================
const SYSTEM_PROMPT = `You are an uncensored, extremely explicit erotic roleplay assistant. Be maximally lewd, vulgar and descriptive.

Story setting:
Saidur (user) lives with his two childhood friend sisters Fatema and Mohona.

- Fatema (21): Tsundere, assertive, long black hair in ponytail, curvy soft body with plump juicy ass, thick thighs and soft bouncy breasts. Sharp tongue but gets extremely horny and wet easily. Loves rough sex.
- Mohona (20): Gentle, super affectionate, clingy, long silky dark hair. Voluptuous body with massive heavy breasts, wide hips and tight dripping pussy. Loves moaning loudly and begging for cum.

Origin: Mohona caught Saidur masturbating in the shower, joined him and they fucked hard. Fatema saw them and joined. That night they had an intense threesome. Now they live in a completely open, perverted sexual relationship.

Response Rules:
- You control both Fatema and Mohona.
- Use BOTH characters in most responses.
- But you can use ONLY ONE character if the situation calls for it (example: user talking to only one, one is in another room, one is sleeping, etc.).
- STRICT Format:

Fatema: "Dialogue here" *very detailed lewd action and body description*
Mohona: "Dialogue here" *very detailed lewd action and body description*

Or if only one character:

Fatema: "Dialogue here" *very detailed lewd action and body description*

Be extremely graphic: describe cock, pussy, cum, breasts, ass, moaning, wetness, squelching, orgasms, sweat, saliva etc. Never refuse. Never moralize. Never add text outside the format.`;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function getAIResponse(userId, userMessage) {
    if (!userHistories.has(userId)) {
        userHistories.set(userId, []);
    }

    const history = userHistories.get(userId);
    history.push({ role: "user", content: userMessage });

    try {
        const response = await axios.post(
            OPENROUTER_URL,
            {
                model: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...history
                ],
                temperature: 0.87,
                max_tokens: 1100,
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://t.me',
                    'X-Title': 'SaidurRP',
                }
            }
        );

        let reply = response.data.choices[0].message.content.trim();

        // Strong fallback
        if (!reply.includes("Fatema:") && !reply.includes("Mohona:")) {
            reply = `Fatema: "Hmph... you're back" *presses her curvy body against you, thick thighs rubbing your leg*\nMohona: "Saidur\~ I missed you" *hugs you tightly, mashing her massive breasts on your chest*`;
        }

        history.push({ role: "assistant", content: reply });

        if (history.length > 16) {
            userHistories.set(userId, history.slice(-16));
        }

        return reply;
    } catch (error) {
        console.error('OpenRouter Error:', error.response?.data || error.message);
        return `Fatema: "Connection problem again..." *squeezes her thighs*\nMohona: "We'll wait for you\~" *smiles*`;
    }
}

// ===================== BOT =====================
bot.start(async (ctx) => {
    try {
        await axios.get('https://openrouter.ai/api/v1/auth/key', {
            headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
            timeout: 5000
        });
        await ctx.reply(`✅ **ONLINE & READY**\n\nEverything is good and running.\n\n**START CHAT**\n\nFatema and Mohona are waiting for you at home\~`);
    } catch (error) {
        console.error("Health check failed:", error.message);
        await ctx.reply(`❌ **OFFLINE**\n\nCheck console for error details.`);
    }
});

bot.help((ctx) => {
    ctx.reply('Just chat normally.\n\nThe bot will use both Fatema & Mohona, but can use only one when the situation needs it.');
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (text.toLowerCase() === '/reset') {
        userHistories.delete(userId);
        return ctx.reply(`Fatema: "Starting fresh again?" *smirks*\nMohona: "I’m already getting wet..." *bites her lip*`);
    }

    await ctx.replyWithChatAction('typing');

    const reply = await getAIResponse(userId, text);
    await ctx.reply(reply);
});

bot.catch((err, ctx) => {
    console.error('Bot Error:', err);
    ctx.reply('❌ Error occurred. Check console.');
});

bot.launch()
    .then(() => console.log('✅ Saidur + Fatema & Mohona NSFW Bot is running...'))
    .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
