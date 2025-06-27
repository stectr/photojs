const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sharp = require('sharp');

const session = require('express-session');
const bodyParser = require('body-parser');


const app = express();
app.use(cors());
app.use(express.json());

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'your-very-secure-secret', // change this!
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // true if using HTTPS
}));

function auth(req, res, next) {
    if (req.session.user) {
        // Disable caching for authenticated pages
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        next();
    } else {
        res.redirect('/login');
    }
}


const PUBLIC = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(PUBLIC, 'uploads');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs');
const DATA_FILE = path.join(__dirname, 'photos.json');

// Ensure dirs & data file
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

// Multer config
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => {
        const ts = Date.now();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${ts}${ext}`);
    }
});
const upload = multer({ storage });

// Helpers
function readPhotos() { return JSON.parse(fs.readFileSync(DATA_FILE)); }
function writePhotos(arr) { fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2)); }

// Serve uploads (including thumbs) and static
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/admin.html', auth, (req, res) => {
    res.sendFile(path.join(PUBLIC, 'admin.html'));
});
app.use(express.static(PUBLIC));

// GET photos
app.get('/api/photos', (req, res) => {
    const photos = readPhotos().map(p => ({
        filename: p.filename,
        label: p.label,
        url: `/uploads/${p.filename}`,
        thumbUrl: `/uploads/thumbs/${p.filename}`
    }));
    res.json(photos);
});

// POST upload (with thumbnail)
app.post('/api/upload', auth, upload.single('photo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const label = (req.body.name || '').trim() || req.file.filename;
    const entry = { filename: req.file.filename, label };

    const origPath = path.join(UPLOAD_DIR, req.file.filename);
    const thumbPath = path.join(THUMB_DIR, req.file.filename);
    try {
        const meta = await sharp(origPath).metadata();
        await sharp(origPath)
            .resize(Math.round(meta.width * 0.25))   // 25% width
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

// POST reorder/rename
app.post('/api/order', auth, (req, res) => {
    const arr = req.body;
    if (!Array.isArray(arr)) return res.status(400).json({ error: 'Array required' });
    const existing = new Set(fs.readdirSync(UPLOAD_DIR));
    const filtered = arr.filter(e => existing.has(e.filename));
    writePhotos(filtered.map(e => ({ filename: e.filename, label: e.label })));
    res.sendStatus(200);
});

// Hardcoded user for demo
const USER = { username: 'admin', password: 'photoserver' };

// Show login form
app.get('/login', (req, res) => {
    res.redirect('/');
});


// Handle login submission
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USER.username && password === USER.password) {
        req.session.user = username;
        return res.redirect('/admin.html'); // this triggers the browser redirect
    }
    res.status(401).send('Invalid credentials. Please try again.');
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});


// DELETE photo
app.delete('/api/photo/:filename', auth, (req, res) => {
    const file = req.params.filename;
    const origPath = path.join(UPLOAD_DIR, file);
    const thumbPath = path.join(THUMB_DIR, file);

    // Delete original file
    fs.unlink(origPath, (err) => {
        if (err) return res.status(500).json({ error: 'Error deleting original file: ' + err.message });

        // Delete thumbnail file
        fs.unlink(thumbPath, (thumbErr) => {
            // Ignore error if thumbnail doesn't exist (ENOENT)
            if (thumbErr && thumbErr.code !== 'ENOENT') {
                return res.status(500).json({ error: 'Error deleting thumbnail: ' + thumbErr.message });
            }

            // Update photos.json file after both deletes succeeded
            const photos = readPhotos().filter(p => p.filename !== file);
            writePhotos(photos);

            res.sendStatus(200);
        });
    });
});


// Start\
const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
