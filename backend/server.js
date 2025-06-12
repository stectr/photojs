const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PUBLIC = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(PUBLIC, 'uploads');
const DATA_FILE = path.join(__dirname, 'photos.json');

// Ensure dirs & data file
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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

// Serve uploads and static
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC));

// GET photos
app.get('/api/photos', (req, res) => {
    const photos = readPhotos().map(p => ({ ...p, url: `/uploads/${p.filename}` }));
    res.json(photos);
});

// POST upload (with name)
app.post('/api/upload', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const label = (req.body.name || '').trim() || req.file.filename;
    const entry = { filename: req.file.filename, label };
    writePhotos([entry, ...readPhotos()]);
    res.json({ ...entry, url: `/uploads/${entry.filename}` });
});

// POST reorder/rename
app.post('/api/order', (req, res) => {
    const arr = req.body;
    if (!Array.isArray(arr)) return res.status(400).json({ error: 'Array required' });
    const existing = new Set(fs.readdirSync(UPLOAD_DIR));
    const filtered = arr.filter(e => existing.has(e.filename));
    writePhotos(filtered.map(e => ({ filename: e.filename, label: e.label })));
    res.sendStatus(200);
});

// DELETE photo
app.delete('/api/photo/:filename', (req, res) => {
    const file = req.params.filename;
    fs.unlink(path.join(UPLOAD_DIR, file), err => {
        if (err) return res.status(500).json({ error: err.message });
        writePhotos(readPhotos().filter(p => p.filename !== file));
        res.sendStatus(200);
    });
});

// Start
app.listen(3000, () => console.log('Server http://localhost:3000'));