# photojs - [sctruong.com](https://sctruong.com)

A small, filesystem-backed photo gallery running on Node.js and Express. The frontend is built with React and Vite and is designed for a simple personal gallery deployment.

## Features

- Responsive three-column photo gallery.
- Full-size image viewer with keyboard escape support.
- Upload images with live upload progress.
- Add, edit, filter, and remove tags.
- Drag-and-drop photo reordering on desktop.
- Automatic thumbnails for faster browsing.
- EXIF orientation handling through Sharp.
- HEIC/HEIF upload conversion through `heif-convert`.
- Persistent photo metadata stored in `photos.json`.
- 50 MB upload limit.
- Optional admin controls protected by the frontend admin password.

## Stack

- React 19 and TypeScript
- Vite
- Express 5
- Multer for multipart uploads
- Sharp for image processing
- Nginx and systemd for the production deployment

## Requirements

- Node.js 20 or newer
- pnpm or npm
- `heif-convert` installed and available on `PATH` if HEIC/HEIF uploads are needed

On Ubuntu, the HEIF converter is provided by `libheif-examples`:

```sh
sudo apt install libheif-examples
```

## Local development

Install dependencies:

```sh
pnpm install
```

Start the Express API and production-style static server:

```sh
pnpm start
```

The server listens on `http://localhost:8000` by default. Set `PORT` to use a different port:

```sh
PORT=9000 pnpm start
```

For frontend development with Vite hot reload, run both processes in separate terminals:

```sh
pnpm start
pnpm dev
```

Vite serves the frontend at `http://localhost:5173` and proxies `/api` and `/photos` to the Express server on port 8000.

## Production build

Build the frontend into `dist/`:

```sh
pnpm build
```

Then start the server with:

```sh
NODE_ENV=production pnpm start
```

The Express server serves the built frontend, the API, and stored photos. The included deployment files provide the production configuration:

- `deploy/photoserver.service` runs the Node server with systemd.
- `deploy/sctruong.nginx` serves the frontend and proxies API/photo requests to port 8000.

Typical systemd setup:

```sh
sudo cp deploy/photoserver.service /etc/systemd/system/photoserver.service
sudo systemctl daemon-reload
sudo systemctl enable --now photoserver
```

## Data and storage

Uploaded originals are stored in `photos/`, generated thumbnails are stored in `photos/thumbnails/`, and photo metadata is stored in `photos.json`. Back up all three locations before moving or reinstalling the server.

The application creates `photos/`, `photos/thumbnails/`, and `photos.json` when they are missing. The Node process must have write access to the project directory.

## API routes

- `GET /api/photos` - list photos and generated image URLs
- `POST /api/photos` - upload a photo, tags, and a column position
- `PATCH /api/photos/:id` - update a photo's tags
- `PUT /api/photos/order` - save the gallery order
- `DELETE /api/photos/:id` - delete a photo and its thumbnail

## Formatting

Format the project with:

```sh
pnpm format
```
