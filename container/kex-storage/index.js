const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const envZipPath = path.join(__dirname, '.env.zip');

if (fs.existsSync(envZipPath)) {
    try {
        const zip = new AdmZip(envZipPath);
        zip.extractAllTo(__dirname, true);
    } catch (err) {}
}

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN; 
const CHANNEL_ID = process.env.CHANNEL_ID; 
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: 'uploads/' });

const dbPath = path.join(__dirname, 'db.json');
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ items: [] }));

const getDb = () => JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const saveDb = (data) => fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

async function uploadToTelegram(filePath, fileName) {
    const form = new FormData();
    form.append('chat_id', CHANNEL_ID);
    form.append('document', fs.createReadStream(filePath), { filename: fileName });
    
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
    const res = await axios.post(url, form, { headers: form.getHeaders() });
    return res.data.result.document.file_id;
}

async function getTelegramFileUrl(fileId) {
    const res = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const filePath = res.data.result.file_path;
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

app.get('/', (req, res) => {
    const parentId = req.query.dir || 'root';
    const db = getDb();
    const items = db.items.filter(item => item.parentId === parentId);
    
    let breadcrumbs = [];
    let curr = db.items.find(i => i.id === parentId);
    while (curr) {
        breadcrumbs.unshift(curr);
        curr = db.items.find(i => i.id === curr.parentId);
    }

    let totalSize = 0;
    let fileCount = 0;
    let folderCount = 0;

    db.items.forEach(i => {
        if (i.type === 'file') {
            fileCount++;
            totalSize += (i.size || 0);
        } else {
            folderCount++;
        }
    });

    const stats = {
        totalSize: formatBytes(totalSize),
        fileCount,
        folderCount
    };

    res.render('index', { items, parentId, breadcrumbs, stats, formatBytes });
});

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { parentId } = req.body;
        const file = req.file;
        if (!file) return res.redirect(`/?dir=${parentId}`);

        const telegramId = await uploadToTelegram(file.path, file.originalname);
        
        const db = getDb();
        db.items.push({
            id: crypto.randomUUID(),
            name: file.originalname,
            type: 'file',
            parentId: parentId,
            telegramId: telegramId,
            size: file.size
        });
        saveDb(db);

        fs.unlinkSync(file.path);
        res.redirect(`/?dir=${parentId}`);
    } catch (err) {
        res.status(500).send("Upload failed.");
    }
});

app.post('/create-folder', (req, res) => {
    const { name, parentId } = req.body;
    const db = getDb();
    db.items.push({
        id: crypto.randomUUID(),
        name: name,
        type: 'folder',
        parentId: parentId
    });
    saveDb(db);
    res.redirect(`/?dir=${parentId}`);
});

app.post('/create-file', async (req, res) => {
    try {
        const { name, content, parentId } = req.body;
        const fileName = name.endsWith('.txt') ? name : `${name}.txt`;
        const tempPath = path.join(uploadDir, fileName);
        
        fs.writeFileSync(tempPath, content || '');
        const size = Buffer.byteLength(content || '', 'utf8');
        const telegramId = await uploadToTelegram(tempPath, fileName);
        
        const db = getDb();
        db.items.push({
            id: crypto.randomUUID(),
            name: fileName,
            type: 'file',
            parentId: parentId,
            telegramId: telegramId,
            size: size
        });
        saveDb(db);
        fs.unlinkSync(tempPath);
        
        res.redirect(`/?dir=${parentId}`);
    } catch (err) {
        res.status(500).send("File creation failed.");
    }
});

app.get('/download/:id', async (req, res) => {
    try {
        const db = getDb();
        const file = db.items.find(i => i.id === req.params.id);
        if (!file || file.type !== 'file') return res.status(404).send("File not found");

        const url = await getTelegramFileUrl(file.telegramId);
        const response = await axios.get(url, { responseType: 'stream' });
        
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        response.data.pipe(res);
    } catch (err) {
        res.status(500).send("Download failed.");
    }
});

app.post('/zip/:id', async (req, res) => {
    try {
        const folderId = req.params.id;
        const db = getDb();
        const folder = db.items.find(i => i.id === folderId);
        const files = db.items.filter(i => i.parentId === folderId && i.type === 'file');

        const zip = new AdmZip();
        
        for (const file of files) {
            const url = await getTelegramFileUrl(file.telegramId);
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            zip.addFile(file.name, Buffer.from(response.data));
        }

        const zipName = `${folder.name}.zip`;
        const zipPath = path.join(uploadDir, zipName);
        zip.writeZip(zipPath);
        
        const size = fs.statSync(zipPath).size;
        const telegramId = await uploadToTelegram(zipPath, zipName);
        
        db.items.push({
            id: crypto.randomUUID(),
            name: zipName,
            type: 'file',
            parentId: folder.parentId,
            telegramId: telegramId,
            size: size
        });
        saveDb(db);
        fs.unlinkSync(zipPath);

        res.redirect(`/?dir=${folder.parentId}`);
    } catch (err) {
        res.status(500).send("Zipping failed.");
    }
});

app.post('/unzip/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const db = getDb();
        const file = db.items.find(i => i.id === fileId);

        const url = await getTelegramFileUrl(file.telegramId);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const zipPath = path.join(uploadDir, file.name);
        fs.writeFileSync(zipPath, Buffer.from(response.data));

        const zip = new AdmZip(zipPath);
        const extractDir = path.join(uploadDir, `ext_${file.id}`);
        zip.extractAllTo(extractDir, true);

        const newFolderId = crypto.randomUUID();
        const folderName = file.name.replace('.zip', '');
        db.items.push({ id: newFolderId, name: folderName, type: 'folder', parentId: file.parentId });

        const extractedFiles = fs.readdirSync(extractDir);
        for (const exFile of extractedFiles) {
            const exPath = path.join(extractDir, exFile);
            if (fs.statSync(exPath).isFile()) {
                const size = fs.statSync(exPath).size;
                const tgId = await uploadToTelegram(exPath, exFile);
                db.items.push({
                    id: crypto.randomUUID(),
                    name: exFile,
                    type: 'file',
                    parentId: newFolderId,
                    telegramId: tgId,
                    size: size
                });
            }
        }
        saveDb(db);

        fs.unlinkSync(zipPath);
        fs.rmSync(extractDir, { recursive: true, force: true });

        res.redirect(`/?dir=${file.parentId}`);
    } catch (err) {
        res.status(500).send("Unzipping failed.");
    }
});

app.post('/delete/:id', (req, res) => {
    try {
        const db = getDb();
        const item = db.items.find(i => i.id === req.params.id);
        if (!item) return res.redirect('/');
        const parentId = item.parentId;
        
        function deleteItem(id) {
            const children = db.items.filter(i => i.parentId === id);
            children.forEach(c => deleteItem(c.id));
            db.items = db.items.filter(i => i.id !== id);
        }
        
        deleteItem(req.params.id);
        saveDb(db);
        res.redirect(`/?dir=${parentId}`);
    } catch (err) {
        res.status(500).send("Deletion failed.");
    }
});

app.listen(PORT);
