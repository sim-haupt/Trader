import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import tradeReviewService, { getTradeReviewImageUrl } from "../services/tradeReviewService";
import { useNotifications } from "../context/NotificationContext";

function splitTags(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  )];
}

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 20h4l11-11-4-4L4 16v4zM13 7l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TradeReviewsPage() {
  const { notify, confirm } = useNotifications();
  const [images, setImages] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [file, setFile] = useState(null);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTags, setEditTags] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(null);
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
  const pendingTags = useMemo(() => splitTags(tagInput), [tagInput]);
  const pendingEditTags = useMemo(() => splitTags(editTags), [editTags]);

  useEffect(() => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setIsDraggingImage(false);
  }, [activeIndex]);

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

  function showNextImage() {
    setActiveIndex((current) => {
      if (current === null || images.length === 0) {
        return current;
      }

      return current === images.length - 1 ? 0 : current + 1;
    });
  }

  function startEditingImage(image) {
    setEditingId(image.id);
    setEditTags((image.tags || []).map((tag) => tag.name).join(", "));
    setEditNotes(image.notes || "");
  }

  function cancelEditingImage() {
    setEditingId(null);
    setEditTags("");
    setEditNotes("");
  }

  async function handleSaveImageEdits(image) {
    setSavingEdit(true);
    setError("");

    try {
      const updatedImage = await tradeReviewService.updateImage(image.id, {
        tags: pendingEditTags,
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
      await tradeReviewService.uploadImage({
        file,
        tags: pendingTags,
        notes
      });
      setFile(null);
      setTagInput("");
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
    setTagInput("");
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
        action={
          <div className="flex flex-wrap gap-2">
            {selectedTags.length > 0 ? (
              <button type="button" className="ui-button px-3 py-2 text-sm" onClick={() => setSelectedTags([])}>
                Clear Filters
              </button>
            ) : null}
            <button type="button" className="ui-button-solid px-4 py-2.5 text-sm" onClick={() => setIsUploadOpen(true)}>
              Upload Image
            </button>
          </div>
        }
      >
        <div className="mb-5 flex flex-wrap gap-2">
          {tags.length > 0 ? (
            tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                aria-pressed={selectedTags.includes(tag.name)}
                onClick={() => toggleTag(tag.name)}
                className="ui-chip-removable"
              >
                {tag.name}
              </button>
            ))
          ) : (
            null
          )}
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
                className="overflow-hidden rounded-[6px] border border-[var(--line)] bg-black text-left transition hover:border-white/28"
              >
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className="block w-full text-left"
                  >
                    <div className="aspect-[4/3] bg-white/[0.03]">
                      <img
                        src={getTradeReviewImageUrl(image.imageUrl)}
                        alt={image.originalName}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.015]"
                        loading="lazy"
                      />
                    </div>
                  </button>
                  <div className="absolute right-2 top-2 flex gap-2">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-white/14 bg-black/80 text-white shadow-none transition hover:bg-[#1f1f1f]"
                      aria-label="Edit review image"
                      onClick={() => startEditingImage(image)}
                    >
                      <EditIcon />
                    </button>
                    {editingId === image.id ? (
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[var(--danger)]/40 bg-black/80 text-[var(--danger)] shadow-none transition hover:bg-[var(--danger-soft)]"
                        aria-label="Delete review image"
                        onClick={() => handleDeleteImage(image)}
                        disabled={deletingId === image.id}
                      >
                        <DeleteIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
                {editingId === image.id ? (
                  <div className="space-y-3 p-4">
                    <div className="space-y-3">
                      <div>
                        <label htmlFor={`review-tags-${image.id}`} className="ui-title text-[10px] text-white/44">
                          Review Tags
                        </label>
                        <input
                          id={`review-tags-${image.id}`}
                          value={editTags}
                          onChange={(event) => setEditTags(event.target.value)}
                          className="ui-input mt-2"
                          placeholder="breakout, risk, replay"
                        />
                      </div>
                      <div>
                        <label htmlFor={`review-notes-${image.id}`} className="ui-title text-[10px] text-white/44">
                          Notes
                        </label>
                        <textarea
                          id={`review-notes-${image.id}`}
                          value={editNotes}
                          onChange={(event) => setEditNotes(event.target.value)}
                          className="ui-input mt-2 min-h-[100px] resize-y"
                          placeholder="Add notes for this review image"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="ui-button-solid px-3 py-2 text-sm"
                          disabled={savingEdit}
                          onClick={() => handleSaveImageEdits(image)}
                        >
                          {savingEdit ? "Saving..." : "Save"}
                        </button>
                        <button type="button" className="ui-button px-3 py-2 text-sm" onClick={cancelEditingImage}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

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
                  <input
                    id="review-tags"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    className="ui-input mt-2"
                    placeholder="breakout, entry timing, risk"
                  />
                  {pendingTags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pendingTags.map((tag) => (
                        <span key={tag} className="ui-chip">{tag}</span>
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
              <button type="button" className="ui-button px-3 py-2" onClick={() => handleDeleteImage(activeImage)} disabled={deletingId === activeImage.id}>
                {deletingId === activeImage.id ? "Deleting..." : "Delete"}
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
                <img
                  src={getTradeReviewImageUrl(activeImage.imageUrl)}
                  alt={activeImage.originalName}
                  draggable="false"
                  className={`max-h-[78vh] max-w-full select-none object-contain ${
                    isDraggingImage ? "" : "transition-transform duration-100"
                  }`}
                  style={{
                    transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`
                  }}
                />
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
