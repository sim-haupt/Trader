import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import tradeReviewService, { getTradeReviewImageUrl } from "../services/tradeReviewService";
import { useNotifications } from "../context/NotificationContext";

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function createImageThumbnail(source, options = {}) {
  const maxSize = options.maxSize || 520;
  const quality = options.quality || 0.72;

  return new Promise((resolve) => {
    if (!source) {
      resolve("");
      return;
    }

    const image = new Image();
    const objectUrl = source instanceof File ? URL.createObjectURL(source) : "";

    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        resolve("");
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    image.onerror = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve("");
    };

    image.src = objectUrl || source;
  });
}

function ArrowIcon({ direction = "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path
        d={direction === "right" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M13.958 3.542a1.5 1.5 0 0 1 2.122 0l.378.378a1.5 1.5 0 0 1 0 2.122l-8.75 8.75-3.166.792.791-3.166 8.625-8.876Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m12.5 5 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M4.167 5.833h11.666M7.5 2.917h5m-6.25 2.916.417 9.167A1.667 1.667 0 0 0 8.75 16.667h2.5a1.667 1.667 0 0 0 1.666-1.667l.417-9.167"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MultiTagSelect({ tags, selectedTags, onChange, allowCreate = false, placeholder = "Select" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef(null);
  const selectedLabel =
    selectedTags.length > 0
      ? `${selectedTags.length} selected`
      : placeholder;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(normalizedSearch)
  );
  const canCreate =
    allowCreate &&
    search.trim() &&
    !tags.some((tag) => tag.name.toLowerCase() === normalizedSearch) &&
    !selectedTags.some((tag) => tag.toLowerCase() === normalizedSearch);

  function toggleValue(name) {
    onChange(
      selectedTags.includes(name)
        ? selectedTags.filter((tag) => tag !== name)
        : [...selectedTags, name]
    );
  }

  function addSearchValue() {
    const name = search.trim();

    if (!name) {
      return;
    }

    onChange([...selectedTags, name]);
    setSearch("");
    setIsOpen(false);
  }

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={`relative ${isOpen ? "z-[90]" : "z-0"}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="ui-input flex min-h-[48px] w-full items-center justify-between gap-3 py-3 text-left shadow-none"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selectedTags.length > 0 ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>
          {selectedLabel}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen ? (
        <div className="ui-popover absolute left-0 top-[calc(100%+10px)] z-50 min-w-full overflow-hidden p-1" role="listbox">
          <div className="border-b border-[var(--line)] p-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCreate) {
                  event.preventDefault();
                  addSearchValue();
                }
              }}
              className="ui-input min-h-[40px] px-3 py-2 text-sm"
              placeholder="Search tags"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {visibleTags.length > 0 ? (
              <>
                {visibleTags.map((tag) => {
                const active = selectedTags.includes(tag.name);

                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleValue(tag.name)}
                    className={`flex w-full items-center justify-between rounded-[6px] px-3 py-2.5 text-sm transition ${
                      active
                        ? "border border-[var(--line)] bg-[#1f1f1f] text-[var(--text)]"
                        : "text-[var(--text-muted)] hover:bg-[#1f1f1f] hover:text-[var(--text)]"
                    }`}
                  >
                    <span>{tag.name}</span>
                    {active ? (
                      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                        <path d="m4.5 10.5 3.5 3.5 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                );
                })}
                {canCreate ? (
                  <button
                    type="button"
                    onClick={addSearchValue}
                    className="flex w-full items-center justify-between rounded-[6px] px-3 py-2.5 text-sm text-[var(--text-muted)] transition hover:bg-[#1f1f1f] hover:text-[var(--text)]"
                  >
                    <span>Add "{search.trim()}"</span>
                  </button>
                ) : null}
              </>
            ) : canCreate ? (
              <button
                type="button"
                onClick={addSearchValue}
                className="flex w-full items-center justify-between rounded-[6px] px-3 py-2.5 text-sm text-[var(--text-muted)] transition hover:bg-[#1f1f1f] hover:text-[var(--text)]"
              >
                <span>Add "{search.trim()}"</span>
              </button>
            ) : (
              <div className="px-3 py-2.5 text-sm text-[var(--text-muted)]">No tags</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TradeReviewsPage() {
  const { notify, confirm } = useNotifications();
  const [images, setImages] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [file, setFile] = useState(null);
  const [uploadTags, setUploadTags] = useState([]);
  const [notes, setNotes] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTags, setEditTags] = useState([]);
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(null);
  const [fullImagesById, setFullImagesById] = useState({});
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const touchStartXRef = useRef(null);
  const dragStartRef = useRef(null);

  async function loadImages(activeTags = selectedTags) {
    setError("");

    try {
      const data = await tradeReviewService.getImages({ tags: activeTags });
      setImages(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTags() {
    try {
      const data = await tradeReviewService.getTags();
      setTags(data);
    } catch {
      setTags([]);
    }
  }

  useEffect(() => {
    loadImages();
    loadTags();
  }, []);

  useEffect(() => {
    loadImages(selectedTags);
  }, [selectedTags.join("|")]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (activeIndex === null) {
        return;
      }

      if (event.key === "Escape") {
        setActiveIndex(null);
      }

      if (event.key === "ArrowLeft") {
        showPreviousImage();
      }

      if (event.key === "ArrowRight") {
        showNextImage();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, images.length]);

  const activeImage = activeIndex === null ? null : images[activeIndex];
  const editingImage = editingId ? images.find((image) => image.id === editingId) : null;
  const activeImageUrl = activeImage ? fullImagesById[activeImage.id] || activeImage.thumbnailUrl || "" : "";
  const editingImageUrl = editingImage ? fullImagesById[editingImage.id] || editingImage.thumbnailUrl || "" : "";

  useEffect(() => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setIsDraggingImage(false);
  }, [activeIndex]);

  useEffect(() => {
    if (activeImage) {
      void loadFullImage(activeImage);
    }
  }, [activeImage?.id]);

  function toggleTag(name) {
    setSelectedTags((current) =>
      current.includes(name) ? current.filter((tag) => tag !== name) : [...current, name]
    );
  }

  function showPreviousImage() {
    setActiveIndex((current) => {
      if (current === null || images.length === 0) {
        return current;
      }

      return current === 0 ? images.length - 1 : current - 1;
    });
  }

  async function loadFullImage(image) {
    if (!image || fullImagesById[image.id]) {
      return fullImagesById[image?.id];
    }

    try {
      const fullImage = await tradeReviewService.getImage(image.id);
      setFullImagesById((current) => ({
        ...current,
        [image.id]: fullImage.imageUrl
      }));

      if (!image.thumbnailUrl && fullImage.imageUrl?.startsWith("data:image/")) {
        const thumbnail = await createImageThumbnail(fullImage.imageUrl);
        if (thumbnail) {
          await tradeReviewService.updateImage(image.id, {
            tags: (image.tags || []).map((tag) => tag.name),
            notes: image.notes || "",
            thumbnail
          });
          setImages((current) =>
            current.map((item) => (item.id === image.id ? { ...item, thumbnailUrl: thumbnail } : item))
          );
        }
      }

      return fullImage.imageUrl;
    } catch (err) {
      setError(err.message);
      return "";
    }
  }

  function openImage(index) {
    const image = images[index];
    setActiveIndex(index);
    void loadFullImage(image);
  }

  function showNextImage() {
    setActiveIndex((current) => {
      if (current === null || images.length === 0) {
        return current;
      }

      return current === images.length - 1 ? 0 : current + 1;
    });
  }

  function startEditingImage(image) {
    setActiveIndex(null);
    setEditingId(image.id);
    setEditTags((image.tags || []).map((tag) => tag.name));
    setEditNotes(image.notes || "");
    void loadFullImage(image);
  }

  function cancelEditingImage() {
    setEditingId(null);
    setEditTags([]);
    setEditNotes("");
  }

  async function handleSaveImageEdits(image) {
    if (!image) {
      return;
    }

    setSavingEdit(true);
    setError("");

    try {
      const updatedImage = await tradeReviewService.updateImage(image.id, {
        tags: editTags,
        notes: editNotes
      });

      setImages((current) =>
        current.map((item) => (item.id === updatedImage.id ? updatedImage : item))
      );
      notify({ title: "Review updated", description: "Notes and tags were saved.", tone: "success" });
      cancelEditingImage();
      await loadTags();
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not update review", description: err.message, tone: "error" });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!file) {
      setError("Choose an image before uploading.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const thumbnail = await createImageThumbnail(file);
      await tradeReviewService.uploadImage({
        file,
        tags: uploadTags,
        notes,
        thumbnail
      });
      setFile(null);
      setUploadTags([]);
      setNotes("");
      setIsUploadOpen(false);
      notify({ title: "Review image uploaded", description: "The trade image is now in your gallery.", tone: "success" });
      await Promise.all([loadImages(selectedTags), loadTags()]);
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not upload image", description: err.message, tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(image) {
    const confirmed = await confirm({
      title: "Delete review image?",
      description: "This removes the image from the trade reviews gallery.",
      confirmLabel: "Delete Image",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setDeletingId(image.id);
    setError("");

    try {
      await tradeReviewService.deleteImage(image.id);
      notify({ title: "Image deleted", description: "The gallery has been updated.", tone: "success" });
      setActiveIndex(null);
      cancelEditingImage();
      await Promise.all([loadImages(selectedTags), loadTags()]);
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete image", description: err.message, tone: "error" });
    } finally {
      setDeletingId(null);
    }
  }

  function handleTouchEnd(event) {
    if (touchStartXRef.current === null) {
      return;
    }

    const distance = event.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (Math.abs(distance) < 40) {
      return;
    }

    if (distance > 0) {
      showPreviousImage();
    } else {
      showNextImage();
    }
  }

  function handleImageWheel(event) {
    event.preventDefault();
    event.stopPropagation();

    const direction = event.deltaY < 0 ? 1 : -1;
    setImageZoom((current) => {
      const nextZoom = current + direction * 0.12;
      return Math.min(4, Math.max(0.5, Number(nextZoom.toFixed(2))));
    });
  }

  function startImageDrag(event) {
    if (imageZoom <= 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDraggingImage(true);
    dragStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: imagePan.x,
      panY: imagePan.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveImageDrag(event) {
    if (!dragStartRef.current) {
      return;
    }

    event.preventDefault();
    const nextX = dragStartRef.current.panX + event.clientX - dragStartRef.current.startX;
    const nextY = dragStartRef.current.panY + event.clientY - dragStartRef.current.startY;
    setImagePan({ x: nextX, y: nextY });
  }

  function endImageDrag(event) {
    if (dragStartRef.current?.pointerId === event.pointerId) {
      dragStartRef.current = null;
      setIsDraggingImage(false);
    }
  }

  function closeUploadModal() {
    if (uploading) {
      return;
    }

    setIsUploadOpen(false);
    setFile(null);
    setUploadTags([]);
    setNotes("");
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-[6px] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <Card
        title="Gallery"
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-button-solid px-4 py-2.5 text-sm" onClick={() => setIsUploadOpen(true)}>
              Upload Image
            </button>
          </div>
        }
      >
        <div className="mb-5 space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_auto] md:items-end md:justify-start">
            <div className="min-w-0 md:w-[220px]">
              <label className="mb-2 block text-xs font-medium text-white/72">Tags</label>
              <MultiTagSelect
                tags={tags}
                selectedTags={selectedTags}
                onChange={setSelectedTags}
              />
            </div>
            {selectedTags.length > 0 ? (
              <button type="button" className="ui-button min-h-[48px] px-4 py-3 text-sm" onClick={() => setSelectedTags([])}>
                Reset
              </button>
            ) : null}
          </div>

          {selectedTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="ui-chip-removable"
                  onClick={() => toggleTag(tag)}
                  title={`Remove ${tag}`}
                >
                  <span>{tag}</span>
                  <span aria-hidden="true">x</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {loading ? (
          <LoadingState label="Loading review images..." />
        ) : images.length === 0 ? (
          <EmptyState
            title="No review images yet"
            description="Upload trade screenshots with review tags and notes, then use this space as your visual review board."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {images.map((image, index) => (
              <div
                key={image.id}
                className="overflow-hidden rounded-[6px] border border-[var(--line)] bg-black text-left transition-colors duration-200 hover:border-white"
              >
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => openImage(index)}
                    className="block w-full text-left"
                  >
                    <div className="aspect-[4/3] bg-white/[0.03]">
                      {image.thumbnailUrl || fullImagesById[image.id] ? (
                        <img
                          src={getTradeReviewImageUrl(image.thumbnailUrl || fullImagesById[image.id])}
                          alt={image.originalName}
                          className="h-full w-full object-cover"
                          decoding="async"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-medium text-white/40">
                          Preview
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="absolute right-2 top-2 flex gap-2">
                    <button
                      type="button"
                      className="ui-button inline-flex h-9 w-9 items-center justify-center rounded-[6px] p-0 text-white/70 hover:text-white"
                      aria-label="Edit review image"
                      title="Edit review image"
                      onClick={() => startEditingImage(image)}
                    >
                      <EditIcon />
                    </button>
                  </div>
                </div>
                {image.tags?.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-4">
                    {image.tags.map((tag) => (
                      <span key={tag.id} className="ui-chip">{tag.name}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {editingImage ? (
        <div
          className="fixed inset-0 z-[156] flex items-center justify-center bg-black/80 px-4 py-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              cancelEditingImage();
            }
          }}
        >
          <div className="w-full max-w-5xl rounded-[6px] border border-[var(--line)] bg-[var(--surface-1)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{editingImage.originalName}</p>
                {editingImage.createdAt ? (
                  <p className="mt-1 text-xs text-white/44">{formatDate(editingImage.createdAt)}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-coral/35 bg-coral/10 p-0 text-coral transition hover:bg-coral/15"
                  aria-label="Delete review image"
                  title="Delete review image"
                  onClick={() => handleDeleteImage(editingImage)}
                  disabled={deletingId === editingImage.id}
                >
                  <DeleteIcon />
                </button>
                <button type="button" className="ui-button px-3 py-2" aria-label="Close edit popup" onClick={cancelEditingImage}>
                  <CloseIcon />
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
              <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-[6px] border border-[var(--line)] bg-black">
                {editingImageUrl ? (
                  <img
                    src={getTradeReviewImageUrl(editingImageUrl)}
                    alt={editingImage.originalName}
                    className="h-full max-h-[420px] w-full object-contain"
                    decoding="async"
                  />
                ) : (
                  <LoadingState label="Loading image..." />
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor={`review-tags-edit-${editingImage.id}`} className="ui-title text-[11px] text-white/54">
                    Review Tags
                  </label>
                  <div className="mt-2">
                    <MultiTagSelect
                      tags={tags}
                      selectedTags={editTags}
                      onChange={setEditTags}
                      allowCreate
                    />
                  </div>
                  {editTags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {editTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="ui-chip-removable"
                          onClick={() => setEditTags((current) => current.filter((item) => item !== tag))}
                          title={`Remove ${tag}`}
                        >
                          <span>{tag}</span>
                          <span aria-hidden="true">x</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <label htmlFor={`review-notes-edit-${editingImage.id}`} className="ui-title text-[11px] text-white/54">
                    Notes
                  </label>
                  <textarea
                    id={`review-notes-edit-${editingImage.id}`}
                    value={editNotes}
                    onChange={(event) => setEditNotes(event.target.value)}
                    className="ui-input mt-2 min-h-[160px] resize-y"
                    placeholder="Add notes for this review image"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ui-button-solid px-4 py-2.5 text-sm"
                    disabled={savingEdit}
                    onClick={() => handleSaveImageEdits(editingImage)}
                  >
                    {savingEdit ? "Saving..." : "Save"}
                  </button>
                  <button type="button" disabled={savingEdit} className="ui-button px-4 py-2.5 text-sm" onClick={cancelEditingImage}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isUploadOpen ? (
        <div
          className="fixed inset-0 z-[155] flex items-center justify-center bg-black/80 px-4 py-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeUploadModal();
            }
          }}
        >
          <div className="w-full max-w-5xl rounded-[6px] border border-[var(--line)] bg-[var(--surface-1)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div className="text-sm font-semibold text-white">Upload Image</div>
              <button type="button" className="ui-button px-3 py-2" aria-label="Close upload popup" onClick={closeUploadModal}>
                <CloseIcon />
              </button>
            </div>
            <form className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]" onSubmit={handleUpload}>
              <label className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[6px] border border-dashed border-white/18 bg-white/[0.03] text-center transition hover:bg-white/[0.05]">
                {previewUrl ? (
                  <img src={previewUrl} alt="Selected trade review preview" className="h-full max-h-[360px] w-full object-contain" />
                ) : (
                  <span className="px-6 text-sm font-semibold text-white">Choose image</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </label>

              <div className="space-y-4">
                <div>
                  <label htmlFor="review-tags" className="ui-title text-[11px] text-white/54">
                    Review Tags
                  </label>
                  <div className="mt-2">
                    <MultiTagSelect
                      tags={tags}
                      selectedTags={uploadTags}
                      onChange={setUploadTags}
                      allowCreate
                    />
                  </div>
                  {uploadTags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {uploadTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="ui-chip-removable"
                          onClick={() => setUploadTags((current) => current.filter((item) => item !== tag))}
                          title={`Remove ${tag}`}
                        >
                          <span>{tag}</span>
                          <span aria-hidden="true">x</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="review-notes" className="ui-title text-[11px] text-white/54">
                    Notes
                  </label>
                  <textarea
                    id="review-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="ui-input mt-2 min-h-[130px] resize-y"
                    placeholder="What happened on this trade?"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={uploading} className="ui-button-solid px-4 py-2.5 text-sm">
                    {uploading ? "Uploading..." : "Upload Image"}
                  </button>
                  <button type="button" disabled={uploading} className="ui-button px-4 py-2.5 text-sm" onClick={closeUploadModal}>
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeImage ? (
        <div
          className="fixed inset-0 z-[160] flex flex-col bg-black/95"
          onTouchStart={(event) => {
            if (imageZoom > 1 && event.target.closest("[data-lightbox-content]")) {
              touchStartXRef.current = null;
              return;
            }

            touchStartXRef.current = event.touches[0].clientX;
          }}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{activeImage.originalName}</p>
              <p className="mt-1 text-xs text-white/44">{activeIndex + 1} of {images.length} · {Math.round(imageZoom * 100)}%</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="ui-button px-3 py-2"
                onClick={() => {
                  setImageZoom(1);
                  setImagePan({ x: 0, y: 0 });
                }}
              >
                Reset Zoom
              </button>
              <button type="button" className="ui-button px-3 py-2" aria-label="Close image preview" onClick={() => setActiveIndex(null)}>
                <CloseIcon />
              </button>
            </div>
          </div>

          <div
            className="relative grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 p-3 sm:p-5"
            onClick={(event) => {
              if (
                !event.target.closest("[data-lightbox-content]") &&
                !event.target.closest("button")
              ) {
                setActiveIndex(null);
              }
            }}
          >
            <button type="button" className="ui-button h-12 w-12 p-0" aria-label="Previous image" onClick={showPreviousImage}>
              <ArrowIcon direction="left" />
            </button>
            <div className="flex min-h-0 flex-col items-center justify-center gap-4">
              <div
                data-lightbox-content
                className={`flex max-h-[78vh] max-w-full touch-none items-center justify-center overflow-hidden ${
                  imageZoom > 1 ? (isDraggingImage ? "cursor-grabbing" : "cursor-grab") : ""
                }`}
                onWheel={handleImageWheel}
                onPointerDown={startImageDrag}
                onPointerMove={moveImageDrag}
                onPointerUp={endImageDrag}
                onPointerCancel={endImageDrag}
              >
                {activeImageUrl ? (
                  <img
                    src={getTradeReviewImageUrl(activeImageUrl)}
                    alt={activeImage.originalName}
                    draggable="false"
                    decoding="async"
                    className={`max-h-[78vh] max-w-full select-none object-contain ${
                      isDraggingImage ? "" : "transition-transform duration-100"
                    }`}
                    style={{
                      transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`
                    }}
                  />
                ) : (
                  <LoadingState label="Loading image..." />
                )}
              </div>
              {(activeImage.tags?.length > 0 || activeImage.notes || activeImage.createdAt) ? (
                <div data-lightbox-content className="w-full max-w-5xl rounded-[6px] border border-white/10 bg-black px-4 py-3">
                  {activeImage.createdAt ? (
                    <p className="mb-3 text-xs text-white/44">{formatDate(activeImage.createdAt)}</p>
                  ) : null}
                  {activeImage.tags?.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {activeImage.tags.map((tag) => (
                        <span key={tag.id} className="ui-chip">{tag.name}</span>
                      ))}
                    </div>
                  ) : null}
                  {activeImage.notes ? (
                    <p className="mt-3 text-sm leading-6 text-white/64">{activeImage.notes}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button type="button" className="ui-button h-12 w-12 p-0" aria-label="Next image" onClick={showNextImage}>
              <ArrowIcon direction="right" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TradeReviewsPage;
