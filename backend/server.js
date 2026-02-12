const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sharp = require('sharp');
const session = require('express-session');
const bodyParser = require('body-parser');
const compression = require('compression');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(compression());
app.use(session({
    secret: 'your-very-secure-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Constants
const USER = { username: 'placeholder', password: 'placeholder' };
const PUBLIC = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(PUBLIC, 'uploads');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs');
const DATA_FILE = path.join(__dirname, 'photos.json');

// Ensure directories exist
[UPLOAD_DIR, THUMB_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

// Multer config
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// Helpers
const readPhotos = () => JSON.parse(fs.readFileSync(DATA_FILE));
const writePhotos = (arr) => fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2));

// Auth middleware
function auth(req, res, next) {
    if (req.session.user === USER.username) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        return next();
    }
    res.redirect('/login');
}

// Static files
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1d' }));
app.use(express.static(PUBLIC));
app.get('/admin.html', auth, (req, res) => {
    res.sendFile(path.join(PUBLIC, 'admin.html'));
});

// Auth routes
app.get('/login', (req, res) => res.redirect('/'));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USER.username && password === USER.password) {
        req.session.user = username;
        return res.redirect('/admin.html');
    }
    res.status(401).send('Invalid credentials');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// Photo API routes
app.get('/api/photos', (req, res) => {
    const photos = readPhotos().map(p => ({
        filename: p.filename,
        label: p.label,
        url: `/uploads/${p.filename}`,
        thumbUrl: `/uploads/thumbs/${p.filename}`
    }));
    res.json(photos);
});

app.post('/api/upload', auth, upload.single('photo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const label = (req.body.name || '').trim() || req.file.filename;
    const entry = { filename: req.file.filename, label };
    const origPath = path.join(UPLOAD_DIR, req.file.filename);
    const thumbPath = path.join(THUMB_DIR, req.file.filename);

    try {
        const meta = await sharp(origPath).metadata();
        await sharp(origPath)
            .resize(Math.round(meta.width * 0.25))
            .toFile(thumbPath);
    } catch (err) {
        console.error('Thumbnail error:', err);
    }

    writePhotos([entry, ...readPhotos()]);
    res.json({
        filename: entry.filename,
        label: entry.label,
        url: `/uploads/${entry.filename}`,
        thumbUrl: `/uploads/thumbs/${entry.filename}`
    });
});

app.post('/api/order', auth, (req, res) => {
    const arr = req.body;
    if (!Array.isArray(arr)) return res.status(400).json({ error: 'Array required' });

    const existing = new Set(fs.readdirSync(UPLOAD_DIR));
    const filtered = arr.filter(e => existing.has(e.filename));
    writePhotos(filtered.map(e => ({ filename: e.filename, label: e.label })));
    res.sendStatus(200);
});

app.delete('/api/photo/:filename', auth, (req, res) => {
    const file = req.params.filename;
    const origPath = path.join(UPLOAD_DIR, file);
    const thumbPath = path.join(THUMB_DIR, file);

    fs.unlink(origPath, (err) => {
        if (err) return res.status(500).json({ error: 'Error deleting file: ' + err.message });

        fs.unlink(thumbPath, (thumbErr) => {
            if (thumbErr && thumbErr.code !== 'ENOENT') {
                return res.status(500).json({ error: 'Error deleting thumbnail: ' + thumbErr.message });
            }

            const photos = readPhotos().filter(p => p.filename !== file);
            writePhotos(photos);
            res.sendStatus(200);
        });
    });
});

// Start server
const PORT = 8000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));