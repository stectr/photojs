import express from "express";
import multer from "multer";
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8000);
const photosDir = path.join(__dirname, "photos");
const thumbnailsDir = path.join(photosDir, "thumbnails");
const metadataPath = path.join(__dirname, "photos.json");
const publicDir = path.join(__dirname, "dist");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const execFileAsync = promisify(execFile);

function thumbnailFilename(filename) {
    return /\.(heic|heif)$/i.test(filename) ? `${path.parse(filename).name}.jpg` : filename;
}

async function convertHeifToJpeg(buffer) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "photoserver-heic-"));
    const inputPath = path.join(tempDir, "input.heic");
    const outputPath = path.join(tempDir, "output.jpg");
    try {
        await fs.writeFile(inputPath, buffer);
        await execFileAsync("heif-convert", [inputPath, outputPath], { timeout: 30000, killSignal: "SIGKILL" });
        return await fs.readFile(outputPath);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

await fs.mkdir(thumbnailsDir, { recursive: true });
try {
    await fs.access(metadataPath);
} catch {
    await fs.writeFile(metadataPath, "[]");
}

async function readPhotos() {
    try {
        const photos = JSON.parse(await fs.readFile(metadataPath, "utf8"));
        const normalized = photos.map((photo, index) => ({
            ...photo,
            column: Number.isInteger(photo.column) && photo.column >= 0 && photo.column < 3 ? photo.column : index % 3,
        }));
        if (normalized.some((photo, index) => photo.column !== photos[index].column)) {
            await writePhotos(normalized);
        }
        return normalized;
    } catch {
        return [];
    }
}

async function writePhotos(photos) {
    await fs.writeFile(metadataPath, JSON.stringify(photos, null, 2));
}

async function createThumbnail(photo) {
    const originalPath = path.join(photosDir, photo.filename);
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename(photo.filename));
    await sharp(originalPath)
        .rotate()
        .resize({ width: 600, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(thumbnailPath);
}

async function refreshCroppedThumbnails() {
    const photos = await readPhotos();
    await Promise.all(photos.map(async (photo) => {
        const originalPath = path.join(photosDir, photo.filename);
        const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename(photo.filename));
        try {
            const [original, thumbnail] = await Promise.all([
                sharp(originalPath).metadata(),
                sharp(thumbnailPath).metadata(),
            ]);
            if (original.width && original.height && thumbnail.width === 600 && thumbnail.height === 600 && original.width !== original.height) {
                await createThumbnail(photo);
            }
        } catch { }
    }));
}

await refreshCroppedThumbnails();

function photoResponse(photo) {
    const thumbnailUrl = `/photos/thumbnails/${thumbnailFilename(photo.filename)}`;
    return {
        ...photo,
        src: thumbnailUrl,
        fullSrc: /\.(heic|heif)$/i.test(photo.filename) ? thumbnailUrl : `/photos/${photo.filename}`,
    };
}

app.use(express.json());
app.use("/photos", express.static(photosDir, { maxAge: "1d" }));
app.get("/api/photos", async (_req, res) => {
    res.json((await readPhotos()).map(photoResponse));
});

app.post("/api/photos", upload.single("photo"), async (req, res) => {
    const isHeif = req.file && /\.(heic|heif)$/i.test(req.file.originalname);
    if (!req.file || (!req.file.mimetype.startsWith("image/") && !isHeif)) {
        return res.status(400).json({ error: "An image file is required." });
    }

    const extension = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const storageExtension = isHeif ? ".jpg" : extension;
    const filename = `${Date.now()}-${crypto.randomUUID()}${storageExtension}`;
    const originalPath = path.join(photosDir, filename);
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename(filename));
    const tags = String(req.body.tags || "")
        .split(",")
        .map((tag) => tag.trim().toUpperCase())
        .filter(Boolean);
    const requestedColumn = Number(req.body.column);
    const column = Number.isInteger(requestedColumn) && requestedColumn >= 0 && requestedColumn < 3 ? requestedColumn : 0;

    try {
        const sourceBuffer = isHeif ? await convertHeifToJpeg(req.file.buffer) : req.file.buffer;
        const image = sharp(sourceBuffer).rotate();
        const metadata = await image.metadata();
        await image.toFile(originalPath);
        await sharp(sourceBuffer)
            .rotate()
            .resize({ width: 600, withoutEnlargement: true })
            .jpeg({ quality: 82 })
            .toFile(thumbnailPath);

        const photo = {
            id: path.parse(filename).name,
            filename,
            name: req.file.originalname,
            width: metadata.width || 0,
            height: metadata.height || 0,
            tags: [...new Set(tags)],
            column,
        };
        const photos = await readPhotos();
        await writePhotos([...photos, photo]);
        return res.status(201).json(photoResponse(photo));
    } catch (error) {
        await Promise.all([
            fs.rm(originalPath, { force: true }),
            fs.rm(thumbnailPath, { force: true }),
        ]);
        console.error("Photo upload failed", error);
        return res.status(500).json({ error: "Could not save photo." });
    }
});

app.patch("/api/photos/:id", async (req, res) => {
    const photos = await readPhotos();
    const photo = photos.find((item) => item.id === req.params.id);
    if (!photo) return res.status(404).json({ error: "Photo not found." });

    photo.tags = Array.isArray(req.body.tags)
        ? [...new Set(req.body.tags.map((tag) => String(tag).trim().toUpperCase()).filter(Boolean))]
        : photo.tags;
    await writePhotos(photos);
    return res.json(photoResponse(photo));
});

app.put("/api/photos/order", async (req, res) => {
    if (!Array.isArray(req.body.columns) && !Array.isArray(req.body.ids)) {
        return res.status(400).json({ error: "A columns array is required." });
    }
    const photos = await readPhotos();
    const byId = new Map(photos.map((photo) => [photo.id, photo]));
    const ordered = Array.isArray(req.body.columns)
        ? req.body.columns.flatMap((column, columnIndex) => column.map((id) => {
            const photo = byId.get(id);
            return photo ? { ...photo, column: columnIndex } : undefined;
        })).filter(Boolean)
        : req.body.ids.map((id) => byId.get(id)).filter(Boolean);
    const included = new Set(ordered.map((photo) => photo.id));
    await writePhotos([...ordered, ...photos.filter((photo) => !included.has(photo.id))]);
    return res.sendStatus(204);
});

app.delete("/api/photos/:id", async (req, res) => {
    const photos = await readPhotos();
    const photo = photos.find((item) => item.id === req.params.id);
    if (!photo) return res.status(404).json({ error: "Photo not found." });

    await Promise.all([
        fs.rm(path.join(photosDir, photo.filename), { force: true }),
        fs.rm(path.join(thumbnailsDir, thumbnailFilename(photo.filename)), { force: true }),
    ]);
    await writePhotos(photos.filter((item) => item.id !== photo.id));
    return res.sendStatus(204);
});

app.use(express.static(publicDir));
app.use((req, res, next) => {
    if (req.method === "GET" && req.accepts("html")) {
        return res.sendFile(path.join(publicDir, "index.html"));
    }
    return next();
});
app.listen(port, "0.0.0.0", () => console.log(`Photo server listening on ${port}`));
