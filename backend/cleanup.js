// cleanup.js — run with: node cleanup.js
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(PUBLIC, 'uploads');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs');
const DATA_FILE = path.join(__dirname, 'photos.json');

const photos = JSON.parse(fs.readFileSync(DATA_FILE));
const known = new Set(photos.map(p => p.filename));

console.log(`Keeping ${known.size} photos from photos.json`);

let deleted = 0;

for (const file of fs.readdirSync(UPLOAD_DIR)) {
    if (file === 'thumbs') continue;
    if (!known.has(file)) {
        fs.unlinkSync(path.join(UPLOAD_DIR, file));
        console.log('deleted upload:', file);
        deleted++;
    }
}

for (const file of fs.readdirSync(THUMB_DIR)) {
    if (!known.has(file)) {
        fs.unlinkSync(path.join(THUMB_DIR, file));
        console.log('deleted thumb:', file);
        deleted++;
    }
}

console.log(`Done. Deleted ${deleted} orphaned files.`);