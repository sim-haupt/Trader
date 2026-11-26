import { useEffect, useId, useRef, useState } from "react";
import LoadingState from "../components/ui/LoadingState";
import ImageLightbox from "../components/ui/ImageLightbox";
import setupService, {
  MAX_SETUP_IMAGE_BYTES,
  MAX_SETUP_IMAGES,
  MAX_SETUP_UPLOAD_BYTES
} from "../services/setupService";
import { ENTRY_GRADES } from "../utils/entryGrades";

const buttonClass = "ui-button min-h-11 px-3 text-sm";
const imageTypes = "image/png,image/jpeg,image/webp,image/gif";
const shareFormatter = new Intl.NumberFormat();
const allGrades = [...ENTRY_GRADES, ""];
const gradeTabs = [...allGrades, "all"];

function gradeLabel(grade) {
  return grade ? `Grade ${grade}` : "Ungraded";
}

function GradeTabs({ value, onChange, id }) {
  function handleKeyDown(event) {
    const index = gradeTabs.indexOf(value);
    let nextIndex;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (index + gradeTabs.length - 1) % gradeTabs.length;
        break;
      case "ArrowRight":
        nextIndex = (index + 1) % gradeTabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = gradeTabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(gradeTabs[nextIndex]);
    event.currentTarget.children[nextIndex].focus();
  }

  return (
    <div role="tablist" aria-label="Setup grades" className="flex flex-wrap gap-x-1 border-b border-[var(--line)]" onKeyDown={handleKeyDown}>
      {gradeTabs.map((grade, index) => (
        <button
          key={grade}
          id={`${id}-tab-${index}`}
          type="button"
          role="tab"
          aria-selected={grade === value}
          aria-controls={`${id}-panel`}
          tabIndex={grade === value ? 0 : -1}
          className="min-h-11 border-b border-transparent px-2.5 text-sm font-medium text-[var(--text-muted)] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white aria-selected:border-mint aria-selected:text-white sm:px-4"
          onClick={() => onChange(grade)}
        >
          {grade === "all" ? "All grades" : grade || "Ungraded"}
        </button>
      ))}
    </div>
  );
}

function SetupDialog({ title, children, onDismiss, busy = false }) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-[6px] border border-[var(--line)] bg-[var(--surface-1)] p-5 text-white backdrop:bg-black/75"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <h2 id={titleId} className="mb-5 break-words text-lg font-semibold">{title}</h2>
      {children}
    </dialog>
  );
}

function ImagePreview({ thumbnailUrl, file, removed }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <img
    src={thumbnailUrl || previewUrl || undefined}
    alt=""
    draggable={false}
    className={`h-11 w-14 shrink-0 rounded bg-black object-contain sm:w-16 ${removed ? "opacity-50" : ""}`}
  />;
}

function SetupImageList({ images, onMove, onRemove }) {
  const drag = useRef(null);
  const [draggingKey, setDraggingKey] = useState(null);
  const instructionsId = useId();
  const active = images.filter((image) => !image.removed);

  function startDrag(event, key) {
    if (!event.isPrimary || event.button !== 0) return;
    const list = event.currentTarget.closest("ul");
    list.setPointerCapture(event.pointerId);
    drag.current = { key, pointerId: event.pointerId };
    setDraggingKey(key);
    event.preventDefault();
  }

  function moveDrag(event) {
    const moving = drag.current;
    if (moving?.pointerId !== event.pointerId) return;

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-image-key]");
    const targetKey = target?.dataset.imageKey;
    const targetIndex = active.findIndex((image) => image.key === targetKey);
    if (targetIndex === -1 || targetKey === moving.key) return;

    const rect = target.getBoundingClientRect();
    const pastMidpoint = event.clientY > rect.top + rect.height / 2;
    const movingDown = targetIndex > active.findIndex((image) => image.key === moving.key);
    if (movingDown === pastMidpoint) onMove(moving.key, targetKey);
  }

  function stopDrag(event) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDraggingKey(null);
  }

  function moveWithKeyboard(event, index) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const target = active[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (!target) return;

    const handle = event.currentTarget;
    onMove(active[index].key, target.key);
    requestAnimationFrame(() => handle.focus());
  }

  if (images.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium">Image order</h3>
      {active.length > 1 && (
        <p id={instructionsId} className="mt-1 text-xs text-[var(--text-muted)]">
          Drag the handles to reorder. <span className="sr-only">Use Up and Down arrows on a handle to move an image.</span>
        </p>
      )}
      <ul
        className="mt-2 divide-y divide-[var(--line)]"
        onPointerMove={moveDrag}
        onLostPointerCapture={stopDrag}
      >
        {images.map((image) => {
          const index = active.indexOf(image);

          return (
            <li key={image.key} data-image-key={image.key}
              className={`flex items-center gap-2 py-2 text-sm sm:gap-3 ${image.key === draggingKey ? "bg-white/10" : ""}`}>
              {active.length > 1 && !image.removed && (
                <button
                  type="button"
                  className={`ui-button flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center p-0 text-lg ${image.key === draggingKey ? "cursor-grabbing" : "cursor-grab"}`}
                  aria-label={`Move ${image.originalName}, position ${index + 1} of ${active.length}`}
                  aria-describedby={instructionsId}
                  onPointerDown={(event) => startDrag(event, image.key)}
                  onKeyDown={(event) => moveWithKeyboard(event, index)}
                >
                  <span aria-hidden="true">⠿</span>
                </button>
              )}
              <ImagePreview {...image} />
              <div className="min-w-0 flex-1">
                <p className="truncate" title={image.originalName}>{image.originalName}</p>
                {image.removed && <p className="text-xs text-[var(--text-muted)]">Removed on save</p>}
                {index === 0 && <p className="text-xs text-[var(--text-muted)]">Cover image</p>}
              </div>
              <button
                type="button"
                className={buttonClass}
                aria-label={`${image.removed ? "Undo removal of" : "Remove"} ${image.originalName}`}
                onClick={() => onRemove(image.key)}
              >
                {image.removed ? "Undo" : "Remove"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SetupEditor({ setup, existingNames, onDismiss, onSave }) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const nameListId = `${fieldId}-names`;
  const gradeId = `${fieldId}-grade`;
  const [name, setName] = useState(setup?.name || "");
  const [grade, setGrade] = useState(setup?.grade || "");
  const [notes, setNotes] = useState(setup?.notes || "");
  const [shareSize, setShareSize] = useState(setup?.shareSize?.toString() || "");
  const [images, setImages] = useState(() => (setup?.images ?? []).map((image) => ({ ...image, key: image.id })));
  const fileSequence = useRef(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const activeImages = images.filter((image) => !image.removed);
  const files = activeImages.flatMap((image) => image.file ? [image.file] : []);

  function toggleImage(key) {
    const image = images.find((item) => item.key === key);
    if (image.removed && activeImages.length >= MAX_SETUP_IMAGES) {
      setError(`Remove another image before restoring this one. A setup can have up to ${MAX_SETUP_IMAGES} images.`);
      return;
    }
    setImages((current) => image.file
      ? current.filter((item) => item.key !== key)
      : current.map((item) => item.key === key ? { ...item, removed: !item.removed } : item));
    setError("");
  }

  function moveImage(key, targetKey) {
    setImages((current) => {
      const from = current.findIndex((image) => image.key === key);
      const to = current.findIndex((image) => image.key === targetKey);
      if (from === -1 || to === -1 || from === to) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function chooseFiles(event) {
    const selected = Array.from(event.target.files);
    event.target.value = "";
    const next = [...files, ...selected];

    if (activeImages.length + selected.length > MAX_SETUP_IMAGES) {
      setError(`A setup can have up to ${MAX_SETUP_IMAGES} images.`);
      return;
    }
    if (next.some((file) => file.size > MAX_SETUP_IMAGE_BYTES) ||
        next.reduce((total, file) => total + file.size, 0) > MAX_SETUP_UPLOAD_BYTES) {
      setError("Images must be 12 MB or less each and total 24 MB or less per upload.");
      return;
    }

    const queued = selected.map((file) => ({ key: `new-${fileSequence.current++}`, file, originalName: file.name }));
    setImages((current) => [...current, ...queued]);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a setup name.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let uploadIndex = 0;
      const imageOrder = activeImages.map((image) => image.id ?? uploadIndex++);
      const removedImageIds = images.filter((image) => image.removed).map((image) => image.id);
      const result = await setupService.saveDetails({
        id: setup?.id, name: name.trim(), grade, notes, shareSize, files, removedImageIds, imageOrder
      });
      onSave(result);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <SetupDialog title={setup ? `Edit ${setup.name} (${gradeLabel(setup.grade)})` : "Add setup"} onDismiss={onDismiss} busy={saving}>
      <form onSubmit={submit}>
        <fieldset disabled={saving} className="space-y-4">
          {!setup && (
            <div>
              <label htmlFor={nameId} className="block text-sm font-medium">Setup name</label>
              <input id={nameId} required maxLength={100} list={nameListId} className="ui-input mt-1" value={name} onChange={(event) => setName(event.target.value)} />
              <datalist id={nameListId}>
                {existingNames.map((existingName) => <option key={existingName} value={existingName} />)}
              </datalist>
              {existingNames.length > 0 && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">Use an existing name to add another grade for that setup.</p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={gradeId} className="block text-sm font-medium">Grade</label>
              <select id={gradeId} className="ui-input mt-1" value={grade} onChange={(event) => setGrade(event.target.value)}>
                <option value="">Ungraded</option>
                {ENTRY_GRADES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <label className="block text-sm font-medium">
              Share size (optional)
              <input
                type="number"
                min={1}
                max={2147483647}
                step={1}
                className="ui-input mt-1"
                value={shareSize}
                onChange={(event) => setShareSize(event.target.value)}
              />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Notes
            <textarea rows={5} maxLength={20000} className="ui-input mt-1 resize-y" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <div>
            <SetupImageList images={images} onMove={moveImage} onRemove={toggleImage} />
            <label className="block text-sm font-medium">
              {setup ? "Add images" : "Images"}
              <input
                type="file"
                accept={imageTypes}
                multiple
                onChange={chooseFiles}
                disabled={activeImages.length >= MAX_SETUP_IMAGES}
                className="mt-2 block w-full text-sm text-[var(--text-muted)] file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-[6px] file:border file:border-[var(--line)] file:bg-black file:px-3 file:font-medium file:text-white disabled:opacity-50"
              />
            </label>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {activeImages.length} of {MAX_SETUP_IMAGES} images. The first image is the cover.
            </p>
          </div>
        </fieldset>

        {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onDismiss} disabled={saving}>Cancel</button>
          <button type="submit" className="ui-button-solid min-h-11 px-4 text-sm" disabled={saving}>
            {saving ? "Saving…" : "Save setup"}
          </button>
        </div>
      </form>
    </SetupDialog>
  );
}

function useSetupImage(imageId, frame) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!imageId) return undefined;

    setResult(null);
    const controller = new AbortController();
    let objectUrl;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setupService.getImage(imageId, controller.signal).then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ id: imageId, url: objectUrl });
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ id: imageId, failed: true });
      });
    }, { rootMargin: "200px" });
    observer.observe(frame.current);

    return () => {
      observer.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, frame]);

  return result?.id === imageId ? result : null;
}

function SetupCard({ setup, onEdit, onViewNotes }) {
  const imageFrame = useRef(null);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [imageOpen, setImageOpen] = useState(false);
  const imageIndex = Math.max(0, setup.images.findIndex((image) => image.id === selectedImageId));
  const selectedImage = setup.images[imageIndex];
  const fullImage = useSetupImage(selectedImage?.id, imageFrame);
  const imageSrc = fullImage?.url || selectedImage?.thumbnailUrl;

  return (
    <article className="min-w-0 overflow-hidden rounded-[6px] border border-[var(--line)] bg-black">
      <div ref={imageFrame} className="relative flex aspect-video items-center justify-center bg-black">
        {selectedImage ? (
          <button type="button" aria-label={`Enlarge ${selectedImage.originalName}`}
            aria-haspopup="dialog" onClick={() => setImageOpen(true)}
            className="relative h-full w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint">
            <img src={imageSrc} alt={selectedImage.originalName} className="h-full w-full object-contain" />
            <span aria-hidden="true" className="absolute right-2 top-2 rounded border border-white/20 bg-black px-2 py-1 text-xs text-white">
              Enlarge
            </span>
          </button>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">No images yet</p>
        )}
        {fullImage?.failed && (
          <p role="status" className="pointer-events-none absolute bottom-2 left-2 rounded bg-black px-2 py-1 text-xs text-white">
            Full-size image unavailable
          </p>
        )}
      </div>
      {setup.images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-t border-[var(--line)] px-4 py-3" role="group" aria-label={`Images for ${setup.name}`}>
          {setup.images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              aria-label={`Show image ${index + 1}: ${image.originalName}`}
              aria-pressed={image.id === selectedImage.id}
              onClick={() => setSelectedImageId(image.id)}
              className="h-12 w-[76px] shrink-0 overflow-hidden rounded border border-[var(--line)] bg-[var(--surface-1)] hover:border-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white aria-pressed:border-mint"
            >
              <img src={image.thumbnailUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--line)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold text-white">{setup.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-muted)]">
            <span>{gradeLabel(setup.grade)}</span>
            {setup.shareSize != null && (
              <span className="rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white">
                {shareFormatter.format(setup.shareSize)} {setup.shareSize === 1 ? "share" : "shares"}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={() => onViewNotes(setup)}>Notes</button>
          <button type="button" className={buttonClass} onClick={() => onEdit(setup)}>Edit</button>
        </div>
      </div>
      {imageOpen && selectedImage && (
        <ImageLightbox image={selectedImage} src={imageSrc} error={fullImage?.failed}
          index={imageIndex} count={setup.images.length}
          onStep={(step) => setSelectedImageId(setup.images[(imageIndex + step + setup.images.length) % setup.images.length].id)}
          onClose={() => setImageOpen(false)} />
      )}
    </article>
  );
}

function SetupsPage() {
  const [setups, setSetups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState(null);
  const [notesSetup, setNotesSetup] = useState(null);
  const [gradeFilter, setGradeFilter] = useState("A+");
  const gradeFilterId = useId();
  const sortedSetups = [...setups].sort((a, b) =>
    a.name.localeCompare(b.name) || allGrades.indexOf(a.grade) - allGrades.indexOf(b.grade)
  );
  const visibleSetups = gradeFilter === "all" ? sortedSetups : sortedSetups.filter((setup) => setup.grade === gradeFilter);

  useEffect(() => {
    const controller = new AbortController();
    setupService.getLibrary(controller.signal).then((items) => {
      if (!controller.signal.aborted) setSetups(items);
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  function saveSetup(setup) {
    setSetups((current) =>
      [...current.filter((item) => item.id !== setup.id && (item.id || item.setupId !== setup.setupId)), setup]
    );
    setGradeFilter((current) => current === "all" ? current : setup.grade);
    setEditor(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GradeTabs id={gradeFilterId} value={gradeFilter} onChange={setGradeFilter} />
        <button type="button" className="ui-button-solid ml-auto min-h-11 px-4 text-sm" onClick={() => setEditor({})} disabled={loading || Boolean(error)}>
          Add setup
        </button>
      </div>

      <div id={`${gradeFilterId}-panel`} role="tabpanel" aria-labelledby={`${gradeFilterId}-tab-${gradeTabs.indexOf(gradeFilter)}`} tabIndex={0}>
        {loading && <LoadingState label="Loading setups…" />}
        {error && (
          <div className="ui-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p role="alert" className="text-sm text-[var(--danger)]">Could not load setups. {error}</p>
            <button type="button" className={buttonClass} onClick={() => {
              setLoading(true);
              setError("");
              setAttempt((current) => current + 1);
            }}>Retry</button>
          </div>
        )}
        {!loading && !error && setups.length === 0 && (
          <p className="ui-panel px-4 py-6 text-sm text-[var(--text-muted)]">No setups yet. Add a setup to save its notes and chart screenshots.</p>
        )}
        {setups.length > 0 && visibleSetups.length === 0 && (
          <p className="ui-panel px-4 py-6 text-sm text-[var(--text-muted)]">No setups with this grade.</p>
        )}
        <div className="grid items-start gap-5 md:grid-cols-2">
          {visibleSetups.map((setup) => (
            <SetupCard key={setup.id || setup.setupId} setup={setup} onEdit={(item) => setEditor({ setup: item })} onViewNotes={setNotesSetup} />
          ))}
        </div>
      </div>

      {editor && (
        <SetupEditor setup={editor.setup} existingNames={[...new Set(sortedSetups.map((setup) => setup.name))]}
          onDismiss={() => setEditor(null)} onSave={saveSetup} />
      )}
      {notesSetup && (
        <SetupDialog title={`${notesSetup.name} notes (${gradeLabel(notesSetup.grade)})`} onDismiss={() => setNotesSetup(null)}>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white/85">
            {notesSetup.notes || "No notes yet."}
          </p>
          <div className="mt-5 flex justify-end">
            <button type="button" className={buttonClass} onClick={() => setNotesSetup(null)}>Close</button>
          </div>
        </SetupDialog>
      )}
    </div>
  );
}

export default SetupsPage;
