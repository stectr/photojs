import { Fragment, useState, useRef, useCallback, useEffect } from "react";
import { flushSync } from "react-dom";

// ─── constants ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "photos123";
const ADMIN_SESSION_COOKIE = "photoserver_admin";
type TagCategory = "camera" | "lens" | "filmStock";
const tagCategories: { value: TagCategory; label: string }[] = [
    { value: "camera", label: "cameras" },
    { value: "lens", label: "lenses" },
    { value: "filmStock", label: "film stocks" },
];
interface Photo {
    id: string;
    src: string;
    fullSrc?: string;
    name: string;
    width: number;
    height: number;
    tags: string[];
    tagCategories?: Record<string, TagCategory>;
    column: number;
}

function categoryForTag(photo: Photo, tag: string): TagCategory {
    return photo.tagCategories?.[tag] ?? "camera";
}

function orderedPhotoTags(photo: Photo): string[] {
    const categoryOrder = new Map(tagCategories.map(({ value }, index) => [value, index]));
    return photo.tags
        .map((tag, index) => ({ tag, index, category: categoryForTag(photo, tag) }))
        .sort((a, b) => categoryOrder.get(a.category)! - categoryOrder.get(b.category)! || a.index - b.index)
        .map(({ tag }) => tag);
}

function collectTags(photos: Photo[], include: string[] = []): { tags: string[]; categories: Record<string, TagCategory> } {
    const categories: Record<string, TagCategory> = {};
    const categoryOrder = new Map(tagCategories.map(({ value }, index) => [value, index]));
    for (const photo of photos) {
        for (const tag of photo.tags) {
            const category = categoryForTag(photo, tag);
            const current = categories[tag];
            if (!current || categoryOrder.get(category)! < categoryOrder.get(current)!) categories[tag] = category;
        }
    }
    for (const tag of include) categories[tag] ??= "camera";
    return {
        categories,
        tags: Object.keys(categories).sort((a, b) =>
            categoryOrder.get(categories[a])! - categoryOrder.get(categories[b])! || a.localeCompare(b)),
    };
}

function parseTags(raw: string): string[] {
    return raw
        .split("#")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
}

function setAdminSessionCookie(isAuthenticated: boolean): void {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const value = isAuthenticated ? "1; Max-Age=2592000" : "; Max-Age=0";
    document.cookie = `${ADMIN_SESSION_COOKIE}=${value}; Path=/; SameSite=Strict${secure}`;
}

function hasAdminSessionCookie(): boolean {
    return document.cookie.split(";").some((cookie) => cookie.trim() === `${ADMIN_SESSION_COOKIE}=1`);
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

async function fetchPhotos(): Promise<Photo[]> {
    const response = await fetch("/api/photos");
    if (!response.ok) throw new Error("Could not load photos");
    const photos = await response.json() as Photo[];
    return photos.map((photo, index) => ({
        ...photo,
        column: Number.isInteger(photo.column) && photo.column >= 0 && photo.column < 3 ? photo.column : 0,
    }));
}

function uploadPhoto(file: File, tags: string[], categories: Record<string, TagCategory>, column: number, onProgress: (progress: number) => void, signal?: AbortSignal): Promise<Photo> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("photo", file);
        formData.append("tags", tags.join(","));
        formData.append("tagCategories", JSON.stringify(categories));
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
                        {orderedPhotoTags(photo).map((t) => (
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
    denseGrid = false,
    showTags = true,
}: {
    photos: Photo[];
    onRemove?: (id: string) => void;
    onUpdateTags?: (id: string, tags: string[], categories: Record<string, TagCategory>) => void;
    onTagClick?: (tag: string) => void;
    onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
    activeTags?: string[];
    denseGrid?: boolean;
    showTags?: boolean;
}) {
    const [isSingleColumn, setIsSingleColumn] = useState(() => window.matchMedia("(max-width: 720px)").matches);
    const [lightbox, setLightbox] = useState<Photo | null>(null);
    const [editingTags, setEditingTags] = useState<string | null>(null);
    const [editingTag, setEditingTag] = useState<{ photoId: string; tag: string } | null>(null);
    const [tagInput, setTagInput] = useState("");
    const [expandedTagPhotos, setExpandedTagPhotos] = useState<Set<string>>(() => new Set());
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; placeAfter: boolean } | null>(null);
    const [draggedTag, setDraggedTag] = useState<{ photoId: string; tag: string } | null>(null);
    const [suppressRemoveId, setSuppressRemoveId] = useState<string | null>(null);
    const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
    const pointerDragRef = useRef<{
        photoId: string;
        pointerId: number;
        startX: number;
        startY: number;
        offsetX: number;
        offsetY: number;
        previewWidth: number;
        previewHeight: number;
        active: boolean;
    } | null>(null);
    const dropTargetRef = useRef<{ id: string; placeAfter: boolean } | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const dragPreviewRef = useRef<HTMLImageElement>(null);
    const onReorderRef = useRef(onReorder);
    onReorderRef.current = onReorder;
    const canReorder = Boolean(onReorder) && denseGrid && !isSingleColumn;

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 720px)");
        const update = () => setIsSingleColumn(mediaQuery.matches);
        mediaQuery.addEventListener("change", update);
        return () => mediaQuery.removeEventListener("change", update);
    }, []);

    useEffect(() => {
        const updateDropTarget = (target: { id: string; placeAfter: boolean } | null) => {
            const current = dropTargetRef.current;
            if (current?.id === target?.id && current?.placeAfter === target?.placeAfter) return;
            dropTargetRef.current = target;
            setDropTarget(target);
        };
        const clearDrag = (commit: boolean) => {
            const session = pointerDragRef.current;
            if (!session) return;
            if (commit && session.active && dropTargetRef.current) {
                const target = dropTargetRef.current;
                onReorderRef.current?.(session.photoId, target.id, target.placeAfter);
                setSuppressRemoveId(target.id);
            }
            pointerDragRef.current = null;
            setDraggedId(null);
            setDragPointer(null);
            updateDropTarget(null);
        };
        const onPointerMove = (event: PointerEvent) => {
            const session = pointerDragRef.current;
            if (!session || session.pointerId !== event.pointerId) return;
            if (!session.active) {
                if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 6) return;
                session.active = true;
                flushSync(() => {
                    setDraggedId(session.photoId);
                    setDragPointer({ x: event.clientX, y: event.clientY });
                });
                event.preventDefault();
                return;
            }
            event.preventDefault();
            const preview = dragPreviewRef.current;
            if (preview) {
                preview.style.left = `${event.clientX - session.offsetX}px`;
                preview.style.top = `${event.clientY - session.offsetY}px`;
            }

            const grid = gridRef.current;
            if (!grid) return;
            const hovered = document.elementFromPoint(event.clientX, event.clientY);
            const slot = hovered?.closest<HTMLElement>(".photo-grid-drop-slot");
            if (slot?.dataset.sourceSlot !== "true" && slot?.dataset.targetId) {
                updateDropTarget({ id: slot.dataset.targetId, placeAfter: slot.dataset.placeAfter === "true" });
                return;
            }
            const cards = Array.from(grid.querySelectorAll<HTMLElement>(".photo-grid-item"))
                .filter((card) => card.dataset.photoId !== session.photoId);
            if (cards.length === 0) {
                updateDropTarget(null);
                return;
            }
            const nearest = cards.reduce<{ card: HTMLElement; distance: number } | null>((best, card) => {
                const bounds = card.getBoundingClientRect();
                const dx = Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right);
                const dy = Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom);
                const distance = dx * dx + dy * dy;
                return !best || distance < best.distance ? { card, distance } : best;
            }, null);
            if (!nearest?.card.dataset.photoId) return;
            const bounds = nearest.card.getBoundingClientRect();
            updateDropTarget({
                id: nearest.card.dataset.photoId,
                placeAfter: event.clientX > bounds.left + bounds.width / 2,
            });
        };
        const onPointerUp = (event: PointerEvent) => {
            if (pointerDragRef.current?.pointerId === event.pointerId) clearDrag(true);
        };
        const onPointerCancel = (event: PointerEvent) => {
            if (pointerDragRef.current?.pointerId === event.pointerId) clearDrag(false);
        };
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerCancel);
        };
    }, []);

    const commitTags = (id: string) => {
        if (!onUpdateTags) return;
        const photo = photos.find((p) => p.id === id);
        const existing = photo?.tags ?? [];
        const added = parseTags(tagInput);
        const merged = Array.from(new Set([...existing, ...added]));
        const categories = { ...photo?.tagCategories };
        for (const tag of merged) categories[tag] ??= "camera";
        onUpdateTags(id, merged, categories);
        setEditingTags(null);
        setTagInput("");
    };
    const commitTagEdit = () => {
        if (!onUpdateTags || !editingTag) return;
        const photo = photos.find((item) => item.id === editingTag.photoId);
        if (!photo) return;
        const replacement = parseTags(tagInput);
        const updated = Array.from(new Set(photo.tags.flatMap((tag) => tag === editingTag.tag ? replacement : [tag])));
        const categories = { ...photo.tagCategories };
        const previousCategory = categoryForTag(photo, editingTag.tag);
        delete categories[editingTag.tag];
        for (const tag of replacement) categories[tag] ??= previousCategory;
        onUpdateTags(photo.id, updated, categories);
        setEditingTag(null);
        setTagInput("");
    };

    const renderDropSlot = (targetId: string, placeAfter: boolean, sourceSlot = false) => (
        <div
            key={`drop-${targetId}-${placeAfter ? "after" : "before"}`}
            className="photo-grid-drop-slot"
            data-target-id={targetId}
            data-place-after={placeAfter}
            data-source-slot={sourceSlot}
            aria-label="Photo insertion position"
        />
    );

    const renderPhoto = (photo: Photo) => (
        <div
            key={photo.id}
            draggable={false}
            onPointerDown={(event) => {
                if (!canReorder || event.button !== 0 || draggedTag) return;
                const target = event.target as HTMLElement;
                if (target.closest("button, input, select, [draggable='true']")) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                pointerDragRef.current = {
                    photoId: photo.id,
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    offsetX: event.clientX - bounds.left,
                    offsetY: event.clientY - bounds.top,
                    previewWidth: bounds.width,
                    previewHeight: bounds.height,
                    active: false,
                };
            }}
            onPointerLeave={() => { if (suppressRemoveId === photo.id) setSuppressRemoveId(null); }}
            data-photo-id={photo.id}
            className="photo-grid-item"
            style={{
                position: "relative",
                display: "flex", flexDirection: "column", gap: denseGrid ? 0 : 2,
                cursor: canReorder ? "grab" : "default",
            }}
        >
            {/* Image */}
            <div
                style={{
                    position: "relative", width: "100%", aspectRatio: "1 / 1", overflow: "hidden",
                }}
                className="photo-card"
            >
                <img
                    src={photo.src}
                    alt={photo.name}
                    draggable={false}
                    onClick={() => setLightbox(photo)}
                    loading="lazy"
                    decoding="async"
                    style={{
                        width: "100%", height: "100%", maxWidth: "100%", objectFit: "cover",
                        display: "block", cursor: "pointer",
                        borderRadius: 8,
                    }}
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

            {!denseGrid && (showTags || onUpdateTags) && (
                <>
                    {/* Tags row */}
                    <div className="photo-tags" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 5 }}>
                        {orderedPhotoTags(photo).slice(0, showTags && isSingleColumn && !onUpdateTags && !expandedTagPhotos.has(photo.id) ? 3 : undefined).map((t) => editingTag?.photoId === photo.id && editingTag.tag === t ? (
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
                                    const reordered = orderedPhotoTags(photo);
                                    const draggedIndex = reordered.indexOf(draggedTag.tag);
                                    let targetIndex = reordered.indexOf(t);
                                    reordered.splice(draggedIndex, 1);
                                    if (draggedIndex < targetIndex) targetIndex -= 1;
                                    reordered.splice(targetIndex, 0, draggedTag.tag);
                                    onUpdateTags(photo.id, reordered, photo.tagCategories ?? {});
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
                                    onRemove={onUpdateTags ? () => {
                                        const tags = photo.tags.filter((x) => x !== t);
                                        const categories = { ...photo.tagCategories };
                                        delete categories[t];
                                        onUpdateTags(photo.id, tags, categories);
                                    } : undefined}
                                />
                            </span>
                        ))}
                        {showTags && isSingleColumn && !onUpdateTags && photo.tags.length > 3 && (
                            <button
                            type="button"
                            onClick={() => setExpandedTagPhotos((current) => {
                                const next = new Set(current);
                                if (next.has(photo.id)) next.delete(photo.id);
                                else next.add(photo.id);
                                return next;
                            })}
                            style={{
                                border: 0, padding: "0 4px", background: "transparent",
                                color: "#0071e3", fontSize: 11, cursor: "pointer",
                            }}
                            >
                            {expandedTagPhotos.has(photo.id) ? "show less" : "show more"}
                            </button>
                        )}
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
                </>
            )}
        </div>
    );

    return (
        <>
            <div
                ref={gridRef}
                className={`photo-grid${denseGrid ? " photo-grid--dense" : ""}${draggedId ? " photo-grid--dragging" : ""}${suppressRemoveId ? " photo-grid--suppress-remove" : ""}`}
            >
                {photos.map((photo) => {
                    if (photo.id === draggedId) {
                        return <Fragment key={photo.id}>{!dropTarget && renderDropSlot(photo.id, false, true)}</Fragment>;
                    }
                    return (
                        <Fragment key={photo.id}>
                            {dropTarget?.id === photo.id && !dropTarget.placeAfter && renderDropSlot(photo.id, false)}
                            {renderPhoto(photo)}
                            {dropTarget?.id === photo.id && dropTarget.placeAfter && renderDropSlot(photo.id, true)}
                        </Fragment>
                    );
                })}
            </div>
            {draggedId && dragPointer && (
                <img
                    ref={dragPreviewRef}
                    src={photos.find((photo) => photo.id === draggedId)?.src}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    style={{
                        position: "fixed",
                        left: dragPointer.x - (pointerDragRef.current?.offsetX ?? 60),
                        top: dragPointer.y - (pointerDragRef.current?.offsetY ?? 60),
                        width: pointerDragRef.current?.previewWidth ?? 120,
                        height: pointerDragRef.current?.previewHeight ?? 120,
                        objectFit: "contain",
                        borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
                        opacity: 0.9, pointerEvents: "none", zIndex: 60,
                    }}
                />
            )}
            {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
        </>
    );
}

// ─── Tag filter bar ───────────────────────────────────────────────────────────
function TagFilter({
    allTags,
    categoriesByTag,
    active,
    onChange,
}: {
    allTags: string[];
    categoriesByTag: Record<string, TagCategory>;
    active: string[];
    onChange: (tags: string[]) => void;
}) {
    const [mobileOpen, setMobileOpen] = useState(false);
    if (allTags.length === 0) return null;

    const toggle = (tag: string) =>
        onChange(active.includes(tag) ? active.filter((t) => t !== tag) : [...active, tag]);
    const groupedTags = tagCategories.map((category) => ({
        ...category,
        tags: allTags.filter((tag) => categoriesByTag[tag] === category.value),
    })).filter((category) => category.tags.length > 0);

    return (
        <div className="tag-filter">
            <button
                type="button"
                className={`tag-filter-toggle${active.length > 0 ? " tag-filter-toggle--active" : ""}`}
                aria-expanded={mobileOpen}
                aria-controls="tag-filter-options"
                onClick={() => setMobileOpen((open) => !open)}
            >
                filter{active.length > 0 ? ` (${active.length})` : ""}
            </button>
            <div id="tag-filter-options" className={`tag-filter-options${mobileOpen ? " tag-filter-options--open" : ""}`}>
                {active.length > 0 && (
                    <button
                        type="button"
                        className="tag-filter-clear"
                        onClick={() => onChange([])}
                    >
                        clear filters
                    </button>
                )}
                {groupedTags.map((group) => (
                    <div key={group.value} className="tag-filter-category">
                        <span>{group.label}</span>
                        <div className="tag-filter-chips">
                            {group.tags.map((tag) => (
                                <TagChip
                                    key={tag}
                                    tag={tag}
                                    active={active.includes(tag)}
                                    onClick={() => toggle(tag)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TagCategoryManager({
    tags,
    categoriesByTag,
    onCategorize,
}: {
    tags: string[];
    categoriesByTag: Record<string, TagCategory>;
    onCategorize: (tag: string, category: TagCategory) => Promise<void>;
}) {
    const [error, setError] = useState<string | null>(null);
    const [savingTag, setSavingTag] = useState<string | null>(null);

    const dropTag = async (tag: string, category: TagCategory) => {
        if (!tag || categoriesByTag[tag] === category || savingTag) return;
        setSavingTag(tag);
        setError(null);
        try {
            await onCategorize(tag, category);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : `Could not move #${tag}.`);
        } finally {
            setSavingTag(null);
        }
    };

    return (
        <section aria-label="Tag categories" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 24 }}>
            {tagCategories.map((category) => {
                const categoryTags = tags.filter((tag) => categoriesByTag[tag] === category.value);
                return (
                    <div
                        key={category.value}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            void dropTag(event.dataTransfer.getData("text/plain"), category.value);
                        }}
                        style={{
                            minHeight: 104, padding: 12, border: "1px dashed #c7c7cc",
                            borderRadius: 12, background: "#ffffff80",
                        }}
                    >
                        <h2 style={{ margin: "0 0 10px", color: "#68686d", fontSize: 12, fontWeight: 500 }}>{category.label}</h2>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {categoryTags.length === 0
                                ? <span style={{ color: "#a1a1a6", fontSize: 11 }}>drop tags here</span>
                                : categoryTags.map((tag) => (
                                    <span
                                        key={tag}
                                        draggable={savingTag !== tag}
                                        onDragStart={(event) => {
                                            event.dataTransfer.effectAllowed = "move";
                                            event.dataTransfer.setData("text/plain", tag);
                                        }}
                                        style={{
                                            display: "inline-flex", alignItems: "center", padding: "4px 9px",
                                            border: "1px solid #d2d2d7", borderRadius: 20, background: "#fff",
                                            color: "#68686d", fontSize: 11, cursor: savingTag === tag ? "wait" : "grab",
                                            opacity: savingTag === tag ? 0.5 : 1,
                                        }}
                                    >
                                        #{tag}
                                    </span>
                                ))}
                        </div>
                    </div>
                );
            })}
            {error && <p role="alert" style={{ gridColumn: "1 / -1", margin: 0, color: "#ff3b30", fontSize: 12 }}>{error}</p>}
        </section>
    );
}

// ─── Upload modal with tag input ──────────────────────────────────────────────
function UploadModal({
    files,
    existingTags,
    existingTagCategories,
    onConfirm,
    onCancel,
    progress,
    error,
}: {
    files: File[];
    existingTags: string[];
    existingTagCategories: Record<string, TagCategory>;
    onConfirm: (tags: string[], categories: Record<string, TagCategory>) => void;
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
        onConfirm(selectedTags, Object.fromEntries(selectedTags.map((tag) => [
            tag,
            existingTagCategories[tag] ?? "camera",
        ])));
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
                    {selectedTags.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {selectedTags.map((tag) => <TagChip key={tag} tag={tag} active />)}
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

    const allTagData = collectTags(photos);
    const filtered = activeTags.length === 0
        ? photos
        : photos.filter((p) => activeTags.every((t) => p.tags.includes(t)));
    const availableTagData = collectTags(filtered, activeTags);

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f7" }}>
            <Nav>
                <a href="#/admin" style={navLink}>admin</a>
            </Nav>
            <main className="main-wrap gallery-main" style={mainWrap}>
                {photos.length === 0 ? (
                    <div style={emptyState}>
                        <p style={{ fontSize: 15, color: "#86868b" }}>no photos yet.</p>
                    </div>
                ) : (
                    <>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
                            <h1 style={{ ...pageTitle, marginBottom: 0 }}>gallery</h1>
                            <span style={{ fontSize: 13, color: "#86868b" }}>
                                {filtered.length === photos.length ? photos.length : `${filtered.length} of ${photos.length}`} {" "}
                                {photos.length === 1 ? "photo" : "photos"}
                            </span>
                        </div>
                        <TagFilter allTags={availableTagData.tags} categoriesByTag={availableTagData.categories} active={activeTags} onChange={setActiveTags} />
                        {filtered.length === 0 ? (
                            <div style={emptyState}>
                                <p style={{ fontSize: 14, color: "#86868b" }}>no photos match these tags.</p>
                            </div>
                        ) : (
                            <PhotoGrid
                                photos={filtered}
                                activeTags={activeTags}
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
    onCategorizeTag,
    onReorder,
    onLogout,
}: {
    photos: Photo[];
    onAdd: (file: File, tags: string[], categories: Record<string, TagCategory>, onProgress: (progress: number) => void, signal: AbortSignal) => Promise<void>;
    onRemove: (id: string) => void;
    onUpdateTags: (id: string, tags: string[], categories: Record<string, TagCategory>) => void;
    onCategorizeTag: (tag: string, category: TagCategory) => Promise<void>;
    onReorder: (draggedId: string, targetId: string, placeAfter: boolean) => void;
    onLogout: () => void;
}) {
    const [dragging, setDragging] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [activeTags, setActiveTags] = useState<string[]>([]);
    const [denseGrid, setDenseGrid] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const allTagData = collectTags(photos);
    const filtered = activeTags.length === 0
        ? photos
        : photos.filter((p) => activeTags.every((t) => p.tags.includes(t)));
    const availableTagData = collectTags(filtered, activeTags);

    const pickFiles = (files: FileList | null) => {
        if (!files) return;
        const valid = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
        if (valid.length > 0) {
            setUploadError(null);
            setPendingFiles(valid);
        }
    };

    const uploadController = useRef<AbortController | null>(null);

    const confirmUpload = useCallback(async (tags: string[], categories: Record<string, TagCategory>) => {
        if (!pendingFiles) return;
        setUploadError(null);
        setUploadProgress(0);
        const controller = new AbortController();
        uploadController.current = controller;
        try {
            for (let index = 0; index < pendingFiles.length; index += 1) {
                const fileStart = index / pendingFiles.length * 100;
                const fileShare = 100 / pendingFiles.length;
                await onAdd(pendingFiles[index], tags, categories, (fileProgress) => {
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
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span style={{ fontSize: 13, color: "#86868b" }}>
                            {filtered.length === photos.length ? photos.length : `${filtered.length} of ${photos.length}`} {" "}
                            {photos.length === 1 ? "photo" : "photos"}
                        </span>
                        <div className="layout-toggle" aria-label="Photo grid layout">
                            <button type="button" aria-pressed={!denseGrid} onClick={() => setDenseGrid(false)}>3 columns</button>
                            <button type="button" aria-pressed={denseGrid} onClick={() => setDenseGrid(true)}>Dense</button>
                        </div>
                    </div>
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
                        <TagCategoryManager tags={allTagData.tags} categoriesByTag={allTagData.categories} onCategorize={onCategorizeTag} />
                        <TagFilter allTags={availableTagData.tags} categoriesByTag={availableTagData.categories} active={activeTags} onChange={setActiveTags} />
                        <PhotoGrid
                            photos={filtered}
                            onRemove={onRemove}
                            onUpdateTags={onUpdateTags}
                            activeTags={activeTags}
                            denseGrid={denseGrid}
                            onReorder={activeTags.length === 0 ? onReorder : undefined}
                        />
                    </>
                )}
            </main>

            {pendingFiles && (
                <UploadModal
                    files={pendingFiles}
                    existingTags={allTagData.tags}
                    existingTagCategories={allTagData.categories}
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
    const [authed, setAuthed] = useState(hasAdminSessionCookie);

    const photosRef = useRef<Photo[]>([]);
    useEffect(() => { photosRef.current = photos; }, [photos]);

    useEffect(() => {
        fetchPhotos().then(setPhotos).catch((error) => console.error(error));
    }, []);

    const addPhoto = async (file: File, tags: string[], categories: Record<string, TagCategory>, onProgress: (progress: number) => void, signal: AbortSignal) => {
        const counts = [0, 0, 0];
        photosRef.current.forEach((photo) => {
            if (photo.column >= 0 && photo.column < 3) counts[photo.column] += 1;
        });
        const column = counts.indexOf(Math.min(...counts));
        const photo = await uploadPhoto(file, tags, categories, column, onProgress, signal);
        photosRef.current = [{ ...photo, column }, ...photosRef.current];
        setPhotos(photosRef.current);
    };

    const removePhoto = async (id: string) => {
        const response = await fetch(`/api/photos/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Could not delete photo");
        setPhotos((prev) => prev.filter((p) => p.id !== id));
    };

    const updateTags = async (id: string, tags: string[], categories: Record<string, TagCategory>) => {
        const response = await fetch(`/api/photos/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags, tagCategories: categories }),
        });
        if (!response.ok) throw new Error("Could not update tags");
        const updated = await response.json() as Photo;
        setPhotos((prev) => prev.map((photo) => photo.id === id ? { ...photo, ...updated } : photo));
    };

    const categorizeTag = async (tag: string, category: TagCategory) => {
        const response = await fetch("/api/tag-categories", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag, category }),
        });
        if (!response.ok) throw new Error(`Could not move #${tag} to ${category}.`);
        photosRef.current = photosRef.current.map((photo) => photo.tags.includes(tag)
            ? { ...photo, tagCategories: { ...photo.tagCategories, [tag]: category } }
            : photo);
        setPhotos(photosRef.current);
    };

    const reorderPhotos = async (draggedId: string, targetId: string, placeAfter: boolean) => {
        const next = [...photos];
        const draggedIndex = next.findIndex((photo) => photo.id === draggedId);
        if (draggedIndex < 0) return;
        const [draggedPhoto] = next.splice(draggedIndex, 1);
        const targetIndex = next.findIndex((photo) => photo.id === targetId);
        if (targetIndex < 0) return;
        next.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedPhoto);
        setPhotos(next);

        const response = await fetch("/api/photos/order", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ids: next.map((photo) => photo.id),
            }),
        });
        if (!response.ok) fetchPhotos().then(setPhotos).catch((error) => console.error(error));
    };

    const login = () => {
        setAdminSessionCookie(true);
        setAuthed(true);
    };
    const logout = () => {
        setAdminSessionCookie(false);
        setAuthed(false);
        window.location.hash = "#/";
    };

    const isAdmin = hash.startsWith("#/admin");

    if (isAdmin) {
        if (!authed) return <LoginPage onLogin={login} />;
        return (
            <>
                <AdminPage photos={photos} onAdd={addPhoto} onRemove={removePhoto} onUpdateTags={updateTags} onCategorizeTag={categorizeTag} onReorder={reorderPhotos} onLogout={logout} />
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
      .gallery-main {
        max-width: 1100px;
      }
      .photo-grid {
        position: relative;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: start;
        column-gap: 16px;
        row-gap: 16px;
      }
      .photo-grid > div {
        min-width: 0;
      }
      .tag-filter-toggle {
        display: none;
      }
      .tag-filter-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .tag-filter-category {
        display: grid;
        grid-template-columns: 76px minmax(0, 1fr);
        align-items: start;
        column-gap: 8px;
      }
      .tag-filter-category > span {
        padding-top: 5px;
        color: #86868b;
        font-size: 11px;
        text-transform: lowercase;
      }
      .tag-filter-chips {
        display: flex;
        min-width: 0;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .tag-filter-clear {
        align-self: flex-start;
        padding: 4px 0;
        border: 0;
        background: transparent;
        color: #0071e3;
        font-size: 11px;
        cursor: pointer;
      }
            .photo-grid-drop-slot {
                aspect-ratio: 1 / 1;
                min-width: 0;
                border: 1px solid rgba(0, 113, 227, 0.42);
                border-radius: 14px;
                background: linear-gradient(145deg, rgba(0, 113, 227, 0.11), rgba(0, 113, 227, 0.045));
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 5px 16px rgba(0, 81, 180, 0.08);
                animation: photo-slot-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
            }
            @keyframes photo-slot-enter {
                from { opacity: 0; transform: scale(0.94); }
                to { opacity: 1; transform: scale(1); }
            }
            @media (prefers-reduced-motion: reduce) {
                .photo-grid-drop-slot { animation: none; }
            }
            .photo-grid--dense {
                grid-template-columns: repeat(8, minmax(0, 1fr));
                column-gap: 12px;
                row-gap: 12px;
            }
            .layout-toggle {
                display: inline-flex;
                gap: 2px;
                padding: 3px;
                border: 1px solid #d2d2d7;
                border-radius: 8px;
                background: #e8e8ed;
            }
            .layout-toggle button {
                padding: 5px 9px;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: #68686d;
                font-size: 12px;
                white-space: nowrap;
                cursor: pointer;
            }
            .layout-toggle button[aria-pressed="true"] {
                background: #fff;
                color: #1d1d1f;
                box-shadow: 0 1px 2px rgba(0,0,0,0.12);
            }
            @media (max-width: 960px) {
                .photo-grid--dense {
                    grid-template-columns: repeat(6, minmax(0, 1fr));
                }
            }
      @media (max-width: 720px) {
        .main-wrap {
          padding: 32px 16px 64px;
        }
        .tag-filter-toggle {
          display: block;
          margin-bottom: 10px;
          padding: 6px 11px;
          border: 1px solid #d2d2d7;
          border-radius: 20px;
          background: #fff;
          color: #86868b;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
        }
        .tag-filter-toggle:hover {
          background: #f5f5f7;
        }
        .tag-filter-toggle--active {
          border: 1.5px solid #0071e3;
          background: #e8f1fb;
          color: #0071e3;
        }
        .tag-filter-toggle--active:hover {
          background: #e8f1fb;
        }
        .tag-filter-options {
          display: none;
          margin-bottom: 16px;
          padding: 12px;
          border: 1px solid #d2d2d7;
          border-radius: 12px;
          background: rgba(255,255,255,0.72);
        }
        .tag-filter-options--open {
          display: flex;
        }
        .tag-filter-category {
          grid-template-columns: 1fr;
          row-gap: 6px;
        }
        .tag-filter-category > span {
          padding-top: 0;
        }
        .photo-grid {
          grid-template-columns: minmax(0, 1fr);
          row-gap: 16px;
        }
                .photo-grid--dense {
                    grid-template-columns: minmax(0, 1fr);
                    row-gap: 12px;
                }
      }
      .photo-card:hover .remove-btn { opacity: 1 !important; }
            .photo-grid--dragging .remove-btn,
            .photo-grid--suppress-remove .remove-btn {
                opacity: 0 !important;
                pointer-events: none;
            }
    `}</style>
    );
}
