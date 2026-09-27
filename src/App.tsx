import { useState, useRef, useCallback, useEffect } from "react";

// ─── constants ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "photos123";
interface Photo {
    id: string;
    src: string;
    fullSrc?: string;
    name: string;
    width: number;
    height: number;
    tags: string[];
    column: number;
}

function parseTags(raw: string): string[] {
    return raw
        .split("#")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
}

function tagInputWidth(value: string): number {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return 80;
    context.font = "11px Inter, sans-serif";
    const textWidth = context.measureText(value).width;
    const letterSpacing = value.length * 0.44;
    return Math.max(80, Math.ceil(textWidth + letterSpacing + 19));
}

function packFilteredPhotos(photos: Photo[]): Photo[] {
    const columns = Array.from({ length: 3 }, (_, column) => photos.filter((photo) => photo.column === column));
    const rowOrdered: Photo[] = [];
    const longestColumn = Math.max(0, ...columns.map((column) => column.length));

    for (let row = 0; row < longestColumn; row += 1) {
        columns.forEach((column) => {
            if (column[row]) rowOrdered.push(column[row]);
        });
    }

    return rowOrdered.map((photo, index) => ({ ...photo, column: index % 3 }));
}

async function fetchPhotos(): Promise<Photo[]> {
    const response = await fetch("/api/photos");
    if (!response.ok) throw new Error("Could not load photos");
    const photos = await response.json() as Photo[];
    return photos.map((photo, index) => ({
        ...photo,
        column: Number.isInteger(photo.column) && photo.column >= 0 && photo.column < 3 ? photo.column : 0,
    }));
}

function uploadPhoto(file: File, tags: string[], column: number, onProgress: (progress: number) => void, signal?: AbortSignal): Promise<Photo> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("photo", file);
        formData.append("tags", tags.join(","));
        formData.append("column", String(column));
        request.open("POST", "/api/photos");
        request.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
            let body: { error?: string } & Partial<Photo> = {};
            try { body = JSON.parse(request.responseText); } catch { /* handled below */ }
            if (request.status >= 200 && request.status < 300) {
                resolve(body as Photo);
            } else {
                reject(new Error(body.error || `upload failed (${request.status})`));
            }
        };
        request.onerror = () => reject(new Error("could not reach the photo server."));
        request.onabort = () => reject(Object.assign(new Error("upload cancelled."), { name: "AbortError" }));
        signal?.addEventListener("abort", () => request.abort(), { once: true });
        request.send(formData);
    });
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────
function TagChip({
    tag,
    active,
    onClick,
    onRemove,
}: {
    tag: string;
    active?: boolean;
    onClick?: () => void;
    onRemove?: () => void;
}) {
    return (
        <span
            onClick={onClick}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.04em",
                cursor: onClick ? "pointer" : "default",
                border: active ? "1.5px solid #0071e3" : "1.5px solid #d2d2d7",
                backgroundColor: active ? "#e8f1fb" : "#fff",
                color: active ? "#0071e3" : "#86868b",
                userSelect: "none",
            }}
        >
            #{tag}
            {onRemove && (
                <span
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    style={{ cursor: "pointer", display: "flex", alignItems: "center", opacity: 0.6, marginLeft: 2 }}
                >
                    <XIcon size={8} />
                </span>
            )}
        </span>
    );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.9)",
                zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            }}
        >
            <button onClick={onClose} style={closeBtn} aria-label="close"><XIcon /></button>
            <img
                src={photo.fullSrc || photo.src}
                alt={photo.name}
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "92vw", maxHeight: "88vh", width: "auto", height: "auto", borderRadius: 12, display: "block" }}
            />
            <div style={{
                position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}>
                {photo.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                        {photo.tags.map((t) => (
                            <span key={t} style={{
                                fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.55)",
                                backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 20,
                                padding: "2px 9px", letterSpacing: "0.04em",
                            }}>#{t}</span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Photo grid ───────────────────────────────────────────────────────────────
function PhotoGrid({
    photos,
    onRemove,
    onUpdateTags,
    onTagClick,
    onReorder,
    activeTags = [],
    compactColumns = false,
}: {
    photos: Photo[];
    onRemove?: (id: string) => void;
    onUpdateTags?: (id: string, tags: string[]) => void;
    onTagClick?: (tag: string) => void;
    onReorder?: (draggedId: string, targetId: string | null, placeAfter: boolean, targetColumn: number) => void;
    activeTags?: string[];
    compactColumns?: boolean;
}) {
    const displayPhotos = compactColumns ? packFilteredPhotos(photos) : photos;
    const [isSingleColumn, setIsSingleColumn] = useState(() => window.matchMedia("(max-width: 720px)").matches);
    const [lightbox, setLightbox] = useState<Photo | null>(null);
    const [editingTags, setEditingTags] = useState<string | null>(null);
    const [editingTag, setEditingTag] = useState<{ photoId: string; tag: string } | null>(null);
    const [tagInput, setTagInput] = useState("");
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; placeAfter: boolean } | null>(null);
    const [dropColumn, setDropColumn] = useState<number | null>(null);
    const [draggedTag, setDraggedTag] = useState<{ photoId: string; tag: string } | null>(null);
    const canReorder = Boolean(onReorder) && !isSingleColumn;

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 720px)");
        const update = () => setIsSingleColumn(mediaQuery.matches);
        mediaQuery.addEventListener("change", update);
        return () => mediaQuery.removeEventListener("change", update);
    }, []);

    const commitTags = (id: string) => {
        if (!onUpdateTags) return;
        const existing = photos.find((p) => p.id === id)?.tags ?? [];
        const added = parseTags(tagInput);
        const merged = Array.from(new Set([...existing, ...added]));
        onUpdateTags(id, merged);
        setEditingTags(null);
        setTagInput("");
    };
    const commitTagEdit = () => {
        if (!onUpdateTags || !editingTag) return;
        const photo = photos.find((item) => item.id === editingTag.photoId);
        if (!photo) return;
        const replacement = parseTags(tagInput);
        const updated = Array.from(new Set(photo.tags.flatMap((tag) => tag === editingTag.tag ? replacement : [tag])));
        onUpdateTags(photo.id, updated);
        setEditingTag(null);
        setTagInput("");
    };

    const mobilePhotos: Photo[] = [];
    const mobileColumns = Array.from({ length: 3 }, (_, column) => displayPhotos.filter((photo) => photo.column === column));
    const longestColumn = Math.max(0, ...mobileColumns.map((column) => column.length));
    for (let row = 0; row < longestColumn; row += 1) {
        mobileColumns.forEach((column) => {
            if (column[row]) mobilePhotos.push(column[row]);
        });
    }

    const renderPhoto = (photo: Photo) => (
        <div
            key={photo.id}
            draggable={canReorder}
            onDragOver={(e) => {
                if (!canReorder || !draggedId || draggedId === photo.id || draggedTag) return;
                e.preventDefault();
                e.stopPropagation();
                setDropTarget({ id: photo.id, placeAfter: false });
            }}
            onDrop={(e) => {
                if (!canReorder || !draggedId || draggedId === photo.id || draggedTag) return;
                e.preventDefault();
                e.stopPropagation();
                onReorder(draggedId, photo.id, false, photo.column);
                setDraggedId(null);
                setDropTarget(null);
                setDropColumn(null);
            }}
            onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", photo.id);
                setDraggedId(photo.id);
            }}
            onDragEnd={() => { setDraggedId(null); setDropTarget(null); setDropColumn(null); }}
            style={{
                display: "flex", flexDirection: "column", gap: 8,
                opacity: draggedId === photo.id ? 0.45 : 1,
                cursor: canReorder ? "grab" : "default",
                paddingTop: 2, paddingBottom: 2,
            }}
        >
            {/* Image */}
            <div
                onClick={() => setLightbox(photo)}
                style={{
                    position: "relative", borderRadius: 10, overflow: "hidden",
                    backgroundColor: "#e8e8ed", cursor: "pointer",
                    outline: dropTarget?.id === photo.id && !dropTarget.placeAfter ? "2px solid #0071e3" : "none",
                    outlineOffset: 3,
                }}
                className="photo-card"
            >
                <img
                    src={photo.src}
                    alt={photo.name}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", height: "auto", display: "block" }}
                    className="photo-img"
                />
                {onRemove && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(photo.id); }}
                        style={{
                            position: "absolute", top: 8, right: 8, width: 26, height: 26,
                            borderRadius: "50%", border: "none", backgroundColor: "rgba(0,0,0,0.5)",
                            backdropFilter: "blur(8px)", color: "#fff", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            cursor: "pointer", opacity: 0,
                        }}
                        className="remove-btn"
                        aria-label="remove"
                    >
                        <XIcon size={9} />
                    </button>
                )}
            </div>

            {/* Tags row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingLeft: 2 }}>
                {photo.tags.map((t) => editingTag?.photoId === photo.id && editingTag.tag === t ? (
                    <form
                        key={t}
                        onSubmit={(e) => { e.preventDefault(); commitTagEdit(); }}
                        style={{ display: "flex", gap: 4 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            autoFocus
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onBlur={commitTagEdit}
                            placeholder="#TAG"
                            style={{
                                height: 24, borderRadius: 20, border: "1.5px solid #0071e3",
                                padding: "0 8px", fontSize: 11, outline: "none",
                                color: "#0071e3", width: tagInputWidth(tagInput), backgroundColor: "#e8f1fb",
                                letterSpacing: "0.04em",
                            }}
                        />
                    </form>
                ) : (
                    <span
                        key={t}
                        draggable={Boolean(onUpdateTags)}
                        onDragStart={() => setDraggedTag({ photoId: photo.id, tag: t })}
                        onDragEnd={() => setDraggedTag(null)}
                        onDragOver={(e) => { if (onUpdateTags) e.preventDefault(); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (!onUpdateTags || !draggedTag || draggedTag.photoId !== photo.id || draggedTag.tag === t) return;
                            const reordered = [...photo.tags];
                            const draggedIndex = reordered.indexOf(draggedTag.tag);
                            let targetIndex = reordered.indexOf(t);
                            reordered.splice(draggedIndex, 1);
                            if (draggedIndex < targetIndex) targetIndex -= 1;
                            reordered.splice(targetIndex, 0, draggedTag.tag);
                            onUpdateTags(photo.id, reordered);
                            setDraggedTag(null);
                        }}
                        style={{ display: "inline-flex", cursor: onUpdateTags ? "grab" : "default" }}
                    >
                        <TagChip
                            tag={t}
                            active={activeTags.includes(t)}
                            onClick={onUpdateTags ? () => {
                                setEditingTag({ photoId: photo.id, tag: t });
                                setTagInput(`#${t}`);
                            } : onTagClick ? () => onTagClick(t) : undefined}
                            onRemove={onUpdateTags ? () => onUpdateTags(photo.id, photo.tags.filter((x) => x !== t)) : undefined}
                        />
                    </span>
                ))}
                {onUpdateTags && (
                    editingTags === photo.id ? (
                        <form
                            onSubmit={(e) => { e.preventDefault(); commitTags(photo.id); }}
                            style={{ display: "flex", gap: 4 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <input
                                autoFocus
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onBlur={() => commitTags(photo.id)}
                                placeholder="#TAG"
                                style={{
                                    height: 24, borderRadius: 20, border: "1.5px solid #0071e3",
                                    padding: "0 8px", fontSize: 11, outline: "none",
                                    color: "#0071e3", width: 80, backgroundColor: "#e8f1fb",
                                    letterSpacing: "0.04em",
                                }}
                            />
                        </form>
                    ) : (
                        <button
                            onClick={() => {
                                setEditingTags(photo.id);
                                setTagInput("");
                            }}
                            style={{
                                height: 24, padding: "0 8px", borderRadius: 20,
                                border: "1.5px dashed #d2d2d7", backgroundColor: "transparent",
                                fontSize: 11, color: "#86868b", cursor: "pointer",
                            }}
                        >
                            + tag
                        </button>
                    )
                )}
            </div>
        </div>
    );

    return (
        <>
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                alignItems: canReorder ? "stretch" : "start",
                gap: "24px 16px",
            }} className={`photo-grid ${canReorder ? "photo-grid--arrange" : "photo-grid--mural"}`}>
                {Array.from({ length: 3 }, (_, column) => {
                    const columnPhotos = displayPhotos.filter((photo) => photo.column === column);
                    return (
                        <div
                            className="photo-column"
                            key={column}
                            onDragOver={(e) => {
                                if (!canReorder || !draggedId) return;
                                e.preventDefault();
                                if (e.currentTarget === e.target) setDropTarget(null);
                            }}
                            onDragEnter={() => { if (canReorder && draggedId) setDropColumn(column); }}
                            onDragLeave={(e) => {
                                if (e.currentTarget === e.target) setDropColumn(null);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (canReorder && draggedId) onReorder(draggedId, null, true, column);
                                setDraggedId(null);
                                setDropTarget(null);
                                setDropColumn(null);
                            }}
                            style={{
                                width: "100%",
                                gridColumn: column + 1,
                                outline: canReorder && dropColumn === column && !dropTarget ? "2px dashed #0071e3" : "2px dashed transparent",
                                outlineOffset: 6,
                                borderRadius: 8,
                            }}
                        >
                            {canReorder && columnPhotos.length === 0 && (
                                <div style={{
                                    minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center",
                                    border: "1.5px dashed #d2d2d7", borderRadius: 10, color: "#86868b", fontSize: 12,
                                }}>
                                    drop photos here
                                </div>
                            )}
                            {columnPhotos.map(renderPhoto)}
                        </div>
                    );
                })}
            </div>
            <div className="photo-grid-mobile">
                {mobilePhotos.map(renderPhoto)}
            </div>
            {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
        </>
    );
}

// ─── Tag filter bar ───────────────────────────────────────────────────────────
function TagFilter({
    allTags,
    active,
    onChange,
}: {
    allTags: string[];
    active: string[];
    onChange: (tags: string[]) => void;
}) {
    if (allTags.length === 0) return null;

    const toggle = (tag: string) =>
        onChange(active.includes(tag) ? active.filter((t) => t !== tag) : [...active, tag]);

    return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button
                onClick={() => onChange([])}
                style={{
                    padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                    letterSpacing: "0.04em", cursor: "pointer",
                    border: active.length === 0 ? "1.5px solid #0071e3" : "1.5px solid #d2d2d7",
                    backgroundColor: active.length === 0 ? "#e8f1fb" : "#fff",
                    color: active.length === 0 ? "#0071e3" : "#86868b",
                }}
            >
                all
            </button>
            {allTags.map((tag) => (
                <TagChip
                    key={tag}
                    tag={tag}
                    active={active.includes(tag)}
                    onClick={() => toggle(tag)}
                />
            ))}
        </div>
    );
}

// ─── Upload modal with tag input ──────────────────────────────────────────────
function UploadModal({
    files,
    existingTags,
    onConfirm,
    onCancel,
    progress,
    error,
}: {
    files: File[];
    existingTags: string[];
    onConfirm: (tags: string[]) => void;
    onCancel: () => void;
    progress: number | null;
    error: string | null;
}) {
    const [tagInput, setTagInput] = useState("");
    const selectedTags = parseTags(tagInput);

    const toggleExistingTag = (tag: string) => {
        const next = selectedTags.includes(tag)
            ? selectedTags.filter((item) => item !== tag)
            : [...selectedTags, tag];
        setTagInput(next.map((item) => `#${item}`).join(" "));
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(parseTags(tagInput));
    };

    return (
        <div
            onClick={onCancel}
            style={{
                position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)",
                zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: "#fff", borderRadius: 18, padding: "32px 28px",
                    width: "100%", maxWidth: 360, boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
                }}
            >
                <p style={{ fontSize: 17, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.02em", marginBottom: 4 }}>
                    add tags
                </p>
                <p style={{ fontSize: 13, color: "#86868b", marginBottom: 20 }}>
                    {files.length} {files.length === 1 ? "photo" : "photos"} selected
                </p>
                <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input
                        autoFocus
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="#GRIV  #NATURE  #2024"
                        style={{
                            height: 44, borderRadius: 10, border: "1.5px solid #d2d2d7",
                            padding: "0 14px", fontSize: 14, outline: "none",
                            backgroundColor: "#f5f5f7", color: "#1d1d1f",
                            letterSpacing: "0.02em",
                        }}
                    />
                    {existingTags.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ fontSize: 11, color: "#86868b", letterSpacing: "0.04em" }}>existing tags</span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {existingTags.map((tag) => (
                                    <TagChip
                                        key={tag}
                                        tag={tag}
                                        active={selectedTags.includes(tag)}
                                        onClick={progress === null ? () => toggleExistingTag(tag) : undefined}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    {tagInput.trim() && parseTags(tagInput).some((tag) => !existingTags.includes(tag)) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {parseTags(tagInput)
                                .filter((tag) => !existingTags.includes(tag))
                                .map((tag) => <TagChip key={tag} tag={tag} active />)}
                        </div>
                    )}
                    {progress !== null && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ height: 5, borderRadius: 5, backgroundColor: "#e8e8ed", overflow: "hidden" }}>
                                <div style={{ width: `${progress}%`, height: "100%", borderRadius: 5, backgroundColor: "#0071e3" }} />
                            </div>
                            <p style={{ fontSize: 12, color: "#86868b" }}>{progress === 100 ? "processing photos..." : `uploading ${progress}%`}</p>
                        </div>
                    )}
                    {error && <p style={{ fontSize: 12, color: "#ff3b30" }}>{error}</p>}
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button
                            type="button"
                            onClick={onCancel}
                            style={{ ...primaryBtn, flex: 1, backgroundColor: "#f5f5f7", color: "#1d1d1f" }}
                        >
                            cancel
                        </button>
                        <button type="submit" disabled={progress !== null} style={{ ...primaryBtn, flex: 2, opacity: progress !== null ? 0.6 : 1 }}>
                            {progress !== null ? "uploading..." : "upload"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── pages ───────────────────────────────────────────────────────────────────
function GalleryPage({ photos }: { photos: Photo[] }) {
    const [activeTags, setActiveTags] = useState<string[]>([]);

    const allTags = Array.from(new Set(photos.flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b));
    const filtered = activeTags.length === 0
        ? photos
        : photos.filter((p) => activeTags.every((t) => p.tags.includes(t)));
    const availableTags = Array.from(new Set([...activeTags, ...filtered.flatMap((photo) => photo.tags)])).sort((a, b) => a.localeCompare(b));

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f7" }}>
            <Nav>
                <a href="#/admin" style={navLink}>admin</a>
            </Nav>
            <main className="main-wrap" style={mainWrap}>
                {photos.length === 0 ? (
                    <div style={emptyState}>
                        <p style={{ fontSize: 15, color: "#86868b" }}>no photos yet.</p>
                    </div>
                ) : (
                    <>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
                            <h1 style={{ ...pageTitle, marginBottom: 0 }}>gallery</h1>
                            <span style={{ fontSize: 13, color: "#86868b" }}>
                                {filtered.length === photos.length ? photos.length : `${filtered.length} of ${photos.length}`}{" "}
                                {photos.length === 1 ? "photo" : "photos"}
                            </span>
                        </div>
                        <TagFilter allTags={availableTags} active={activeTags} onChange={setActiveTags} />
                        {filtered.length === 0 ? (
                            <div style={emptyState}>
                                <p style={{ fontSize: 14, color: "#86868b" }}>no photos match these tags.</p>
                            </div>
                        ) : (
                            <PhotoGrid
                                photos={filtered}
                                activeTags={activeTags}
                                compactColumns={activeTags.length > 0}
                                onTagClick={(tag) => setActiveTags((current) => current.includes(tag)
                                    ? current.filter((item) => item !== tag)
                                    : [...current, tag])}
                            />
                        )}
                    </>
                )}
            </main>
            <Footer />
        </div>
    );
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
    const [pw, setPw] = useState("");
    const [error, setError] = useState(false);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pw === ADMIN_PASSWORD) { onLogin(); }
        else { setError(true); setPw(""); }
    };

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ backgroundColor: "#fff", borderRadius: 18, padding: "40px 36px", width: "100%", maxWidth: 340, boxShadow: "0 2px 24px rgba(0,0,0,0.06)" }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: "#86868b", letterSpacing: "0.08em", marginBottom: 6 }}>admin</p>
                <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.03em", marginBottom: 28 }}>sign in</h1>
                <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input
                        type="password"
                        placeholder="password"
                        value={pw}
                        autoFocus
                        onChange={(e) => { setPw(e.target.value); setError(false); }}
                        style={{
                            height: 44, borderRadius: 10, border: `1.5px solid ${error ? "#ff3b30" : "#d2d2d7"}`,
                            padding: "0 14px", fontSize: 15, outline: "none", backgroundColor: "#f5f5f7", color: "#1d1d1f",
                        }}
                    />
                    {error && <p style={{ fontSize: 12, color: "#ff3b30", marginTop: -4 }}>incorrect password.</p>}
                    <button type="submit" style={primaryBtn}>continue</button>
                </form>
                <p style={{ marginTop: 16, textAlign: "center" }}>
                    <a href="#/" style={{ fontSize: 13, color: "#0071e3", textDecoration: "none" }}>← back to gallery</a>
                </p>
            </div>
            <Footer />
        </div>
    );
}

function AdminPage({
    photos,
    onAdd,
    onRemove,
    onUpdateTags,
    onReorder,
    onLogout,
}: {
    photos: Photo[];
    onAdd: (file: File, tags: string[], onProgress: (progress: number) => void, signal: AbortSignal) => Promise<void>;
    onRemove: (id: string) => void;
    onUpdateTags: (id: string, tags: string[]) => void;
    onReorder: (draggedId: string, targetId: string | null, placeAfter: boolean, targetColumn: number) => void;
    onLogout: () => void;
}) {
    const [dragging, setDragging] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [activeTags, setActiveTags] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const allTags = Array.from(new Set(photos.flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b));
    const filtered = activeTags.length === 0
        ? photos
        : photos.filter((p) => activeTags.every((t) => p.tags.includes(t)));
    const availableTags = Array.from(new Set([...activeTags, ...filtered.flatMap((photo) => photo.tags)])).sort((a, b) => a.localeCompare(b));

    const pickFiles = (files: FileList | null) => {
        if (!files) return;
        const valid = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
        if (valid.length > 0) {
            setUploadError(null);
            setPendingFiles(valid);
        }
    };

    const uploadController = useRef<AbortController | null>(null);

    const confirmUpload = useCallback(async (tags: string[]) => {
        if (!pendingFiles) return;
        setUploadError(null);
        setUploadProgress(0);
        const controller = new AbortController();
        uploadController.current = controller;
        try {
            for (let index = 0; index < pendingFiles.length; index += 1) {
                const fileStart = index / pendingFiles.length * 100;
                const fileShare = 100 / pendingFiles.length;
                await onAdd(pendingFiles[index], tags, (fileProgress) => {
                    setUploadProgress(Math.round(fileStart + fileProgress / 100 * fileShare));
                }, controller.signal);
            }
            setPendingFiles(null);
        } catch (error) {
            if (!(error instanceof Error && error.name === "AbortError")) {
                setUploadError(error instanceof Error ? error.message : "Upload failed.");
            }
        } finally {
            uploadController.current = null;
            setUploadProgress(null);
        }
    }, [pendingFiles, onAdd]);

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f7" }}>
            <Nav>
                <a href="#/" style={navLink}>view gallery</a>
                <button onClick={onLogout} style={ghostBtn}>sign out</button>
            </Nav>
            <main className="main-wrap" style={mainWrap}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 32 }}>
                    <h1 style={pageTitle}>manage photos</h1>
                    <span style={{ fontSize: 13, color: "#86868b" }}>
                        {filtered.length === photos.length ? photos.length : `${filtered.length} of ${photos.length}`}{" "}
                        {photos.length === 1 ? "photo" : "photos"}
                    </span>
                </div>

                {/* Upload zone */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); pickFiles(e.dataTransfer.files); }}
                    onClick={() => inputRef.current?.click()}
                    style={{
                        border: `1.5px dashed ${dragging ? "#0071e3" : "#d2d2d7"}`,
                        borderRadius: 14, padding: "36px 24px", textAlign: "center", cursor: "pointer",
                        backgroundColor: dragging ? "rgba(0,113,227,0.04)" : "rgba(255,255,255,0.5)",
                        marginBottom: photos.length > 0 ? 32 : 0,
                    }}
                >
                    <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#e8e8ed", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                        <UploadIcon />
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#1d1d1f", marginBottom: 3 }}>
                        {dragging ? "drop to add" : "upload photos"}
                    </p>
                    <p style={{ fontSize: 12, color: "#86868b" }}>drag & drop or click to choose</p>
                    <input ref={inputRef} type="file" accept="image/*,.heic,.heif" multiple style={{ display: "none" }} onChange={(e) => pickFiles(e.target.files)} />
                </div>

                {photos.length > 0 && (
                    <>
                        <TagFilter allTags={availableTags} active={activeTags} onChange={setActiveTags} />
                        <PhotoGrid
                            photos={filtered}
                            onRemove={onRemove}
                            onUpdateTags={onUpdateTags}
                            activeTags={activeTags}
                            compactColumns={activeTags.length > 0}
                            onReorder={activeTags.length === 0 ? onReorder : undefined}
                        />
                    </>
                )}
            </main>

            {pendingFiles && (
                <UploadModal
                    files={pendingFiles}
                    existingTags={allTags}
                    onConfirm={confirmUpload}
                    onCancel={() => {
                        if (uploadProgress === null) setPendingFiles(null);
                        else uploadController.current?.abort();
                    }}
                    progress={uploadProgress}
                    error={uploadError}
                />
            )}
            <Footer />
        </div>
    );
}

// ─── shared UI ────────────────────────────────────────────────────────────────
function Nav({ children }: { children: React.ReactNode }) {
    return (
        <header style={{
            borderBottom: "1px solid #d2d2d7",
            backgroundColor: "rgba(245,245,247,0.85)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            position: "sticky", top: 0, zIndex: 10,
        }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <a href="#/" style={{ fontSize: 17, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.02em", textDecoration: "none" }}>ste photos</a>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>{children}</div>
            </div>
        </header>
    );
}

function Footer() {
    return (
        <footer style={{ width: "100%", padding: "28px 24px 32px", textAlign: "center", color: "#86868b", fontSize: 12 }}>
            <div>© 2026 ste, all rights reserved (⌐■_■)</div>
            <a href="https://map.beeffilet.com" target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#16803c", textDecoration: "none", fontWeight: 500 }}>
                minecraft server
            </a>
        </footer>
    );
}

function XIcon({ size = 10 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

function UploadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ color: "#1d1d1f" }}>
            <path d="M10 3v10M5 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 17h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const mainWrap: React.CSSProperties = { margin: "0 auto" };
const pageTitle: React.CSSProperties = { fontSize: 28, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.03em", marginBottom: 28 };
const emptyState: React.CSSProperties = { paddingTop: 80, textAlign: "center" };
const navLink: React.CSSProperties = { fontSize: 13, color: "#0071e3", textDecoration: "none", fontWeight: 500 };
const primaryBtn: React.CSSProperties = { height: 44, borderRadius: 10, border: "none", backgroundColor: "#0071e3", color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer", letterSpacing: "-0.01em" };
const ghostBtn: React.CSSProperties = { fontSize: 13, color: "#86868b", background: "none", border: "none", cursor: "pointer", fontWeight: 400, padding: 0 };
const closeBtn: React.CSSProperties = { position: "absolute", top: 18, right: 18, width: 34, height: 34, borderRadius: "50%", border: "none", backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

// ─── router ───────────────────────────────────────────────────────────────────
function useHash() {
    const [hash, setHash] = useState(window.location.hash || "#/");
    useEffect(() => {
        const onKey = () => setHash(window.location.hash || "#/");
        window.addEventListener("hashchange", onKey);
        return () => window.removeEventListener("hashchange", onKey);
    }, []);
    return hash;
}

// ─── root ─────────────────────────────────────────────────────────────────────
export default function App() {
    const hash = useHash();
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [authed, setAuthed] = useState(false);

    useEffect(() => {
        fetchPhotos().then(setPhotos).catch((error) => console.error(error));
    }, []);

    const addPhoto = async (file: File, tags: string[], onProgress: (progress: number) => void, signal: AbortSignal) => {
        const counts = [0, 0, 0];
        photos.forEach((photo) => {
            if (photo.column >= 0 && photo.column < 3) counts[photo.column] += 1;
        });
        const column = counts.indexOf(Math.min(...counts));
        const photo = await uploadPhoto(file, tags, column, onProgress, signal);
        setPhotos((prev) => [...prev, { ...photo, column }]);
    };

    const removePhoto = async (id: string) => {
        const response = await fetch(`/api/photos/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Could not delete photo");
        setPhotos((prev) => prev.filter((p) => p.id !== id));
    };

    const updateTags = async (id: string, tags: string[]) => {
        const response = await fetch(`/api/photos/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags }),
        });
        if (!response.ok) throw new Error("Could not update tags");
        const updated = await response.json() as Photo;
        setPhotos((prev) => prev.map((photo) => photo.id === id ? { ...photo, ...updated } : photo));
    };

    const reorderPhotos = async (draggedId: string, targetId: string | null, placeAfter: boolean, targetColumn: number) => {
        const columns = Array.from({ length: 3 }, (_, column) => photos.filter((photo) => photo.column === column));
        const sourceColumn = columns.findIndex((column) => column.some((photo) => photo.id === draggedId));
        if (sourceColumn < 0 || targetColumn < 0 || targetColumn > 2) return;
        const draggedIndex = columns[sourceColumn].findIndex((photo) => photo.id === draggedId);
        const [draggedPhoto] = columns[sourceColumn].splice(draggedIndex, 1);
        draggedPhoto.column = targetColumn;
        const targetIndex = targetId ? columns[targetColumn].findIndex((photo) => photo.id === targetId) : -1;
        const insertionIndex = targetIndex < 0 ? columns[targetColumn].length : targetIndex + (placeAfter ? 1 : 0);
        columns[targetColumn].splice(insertionIndex, 0, draggedPhoto);
        const next = columns.flat();
        setPhotos(next);

        const response = await fetch("/api/photos/order", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                columns: columns.map((column) => column.map((photo) => photo.id)),
                ids: next.map((photo) => photo.id),
            }),
        });
        if (!response.ok) fetchPhotos().then(setPhotos).catch((error) => console.error(error));
    };

    const logout = () => { setAuthed(false); window.location.hash = "#/"; };

    const isAdmin = hash.startsWith("#/admin");

    if (isAdmin) {
        if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;
        return (
            <>
                <AdminPage photos={photos} onAdd={addPhoto} onRemove={removePhoto} onUpdateTags={updateTags} onReorder={reorderPhotos} onLogout={logout} />
                <PhotoCardStyles />
            </>
        );
    }

    return (
        <>
            <GalleryPage photos={photos} />
            <PhotoCardStyles />
        </>
    );
}

function PhotoCardStyles() {
    return (
        <style>{`
      .main-wrap {
        max-width: 1500px;
        padding: 44px 16px 80px;
      }
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 24px 16px;
      }
      .photo-grid-mobile {
        display: none;
      }
      .photo-grid--mural {
        align-items: start;
      }
      .photo-grid--arrange {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-auto-flow: row;
        align-items: start;
        gap: 24px 16px;
      }
      .photo-grid > div {
        break-inside: avoid;
        margin-bottom: 12px;
      }
      .photo-grid--arrange > div {
        min-width: 0;
        margin-bottom: 0;
      }
      .photo-column {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 24px;
        min-width: 0;
        min-height: 80px;
      }
      .photo-column > div {
        margin-bottom: 0;
      }
      @media (max-width: 720px) {
        .main-wrap {
          padding: 32px 16px 64px;
        }
        .photo-grid {
          display: none !important;
        }
        .photo-grid-mobile {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .photo-grid--arrange {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        .photo-column {
          width: 100%;
          gap: 18px;
        }
      }
      @media (min-width: 721px) and (max-width: 960px) {
        .photo-grid--arrange { gap: 16px 12px; }
      }
      .photo-card:hover .remove-btn { opacity: 1 !important; }
    `}</style>
    );
}
