const crypto = require('crypto');

const SECRET_KEY = crypto.scryptSync(process.env.BOT_TOKEN || 'KexSuperSecretFallbackKey', 'salt', 32);
const DELIMITER = '\x00';

function encodeFileToken(path, name, size, telegramFileId, updatedAt = Date.now()) {
    const sizeB36 = Number(size).toString(36);
    const timeB36 = Number(updatedAt).toString(36);
    const payload = [path, name, sizeB36, telegramFileId, timeB36].join(DELIMITER);
    const iv = crypto.randomBytes(8);
    const fullIv = Buffer.concat([iv, Buffer.alloc(8, 0)]);
    const cipher = crypto.createCipheriv('aes-256-ctr', SECRET_KEY, fullIv);
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    const finalBuffer = Buffer.concat([iv, encrypted]);
    return finalBuffer.toString('base64url').replace(/=/g, '');
}

function decodeFileToken(token) {
    try {
        const buffer = Buffer.from(token, 'base64url');
        const iv = buffer.subarray(0, 8);
        const fullIv = Buffer.concat([iv, Buffer.alloc(8, 0)]);
        const encrypted = buffer.subarray(8);
        const decipher = crypto.createDecipheriv('aes-256-ctr', SECRET_KEY, fullIv);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        const payload = decrypted.toString('utf8');
        const [path, name, sizeB36, telegramFileId, timeB36] = payload.split(DELIMITER);
        return {
            path,
            name,
            size: parseInt(sizeB36, 36),
            telegramFileId,
            updatedAt: parseInt(timeB36, 36)
        };
    } catch (err) {
        return null;
    }
}

module.exports = { encodeFileToken, decodeFileToken };
