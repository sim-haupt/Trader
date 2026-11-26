import { useEffect, useId, useRef, useState } from "react";
import LoadingState from "../components/ui/LoadingState";
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

function SetupEditor({ setup, existingNames, onDismiss, onSave }) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const nameListId = `${fieldId}-names`;
  const gradeId = `${fieldId}-grade`;
  const [name, setName] = useState(setup?.name || "");
  const [grade, setGrade] = useState(setup?.grade || "");
  const [notes, setNotes] = useState(setup?.notes || "");
  const [shareSize, setShareSize] = useState(setup?.shareSize?.toString() || "");
  const [files, setFiles] = useState([]);
  const [removedImageIds, setRemovedImageIds] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savedImages = setup?.images ?? [];
  const savedCount = savedImages.length - removedImageIds.length;
  const imageCount = savedCount + files.length;
  const coverId = savedImages.find((image) => !removedImageIds.includes(image.id))?.id;

  function toggleSavedImage(imageId) {
    const isRemoved = removedImageIds.includes(imageId);
    if (isRemoved && imageCount >= MAX_SETUP_IMAGES) {
      setError(`Remove another image before restoring this one. A setup can have up to ${MAX_SETUP_IMAGES} images.`);
      return;
    }
    setRemovedImageIds((current) => isRemoved ? current.filter((id) => id !== imageId) : [...current, imageId]);
    setError("");
  }

  function chooseFiles(event) {
    const selected = Array.from(event.target.files);
    event.target.value = "";
    const next = [...files, ...selected];

    if (savedCount + next.length > MAX_SETUP_IMAGES) {
      setError(`A setup can have up to ${MAX_SETUP_IMAGES} images.`);
      return;
    }
    if (next.some((file) => file.size > MAX_SETUP_IMAGE_BYTES) ||
        next.reduce((total, file) => total + file.size, 0) > MAX_SETUP_UPLOAD_BYTES) {
      setError("Images must be 12 MB or less each and total 24 MB or less per upload.");
      return;
    }

    setFiles(next);
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
      const result = await setupService.saveDetails({
        id: setup?.id, name: name.trim(), grade, notes, shareSize, files, removedImageIds
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
            {savedImages.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium">Saved images</h3>
                <ul className="mt-2 divide-y divide-[var(--line)]">
                  {savedImages.map((image) => {
                    const isRemoved = removedImageIds.includes(image.id);

                    return (
                      <li key={image.id} className="flex items-center gap-3 py-2 text-sm">
                        <img src={image.thumbnailUrl} alt="" className={`h-11 w-16 shrink-0 rounded bg-black object-contain ${isRemoved ? "opacity-50" : ""}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate" title={image.originalName}>{image.originalName}</p>
                          {isRemoved && <p className="text-xs text-[var(--text-muted)]">Removed on save</p>}
                          {image.id === coverId && <p className="text-xs text-[var(--text-muted)]">Cover image</p>}
                        </div>
                        <button
                          type="button"
                          className={buttonClass}
                          aria-label={`${isRemoved ? "Undo removal of" : "Remove"} ${image.originalName}`}
                          onClick={() => toggleSavedImage(image.id)}
                        >
                          {isRemoved ? "Undo" : "Remove"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <label className="block text-sm font-medium">
              {setup ? "Add images" : "Images"}
              <input
                type="file"
                accept={imageTypes}
                multiple
                onChange={chooseFiles}
                disabled={imageCount >= MAX_SETUP_IMAGES}
                className="mt-2 block w-full text-sm text-[var(--text-muted)] file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-[6px] file:border file:border-[var(--line)] file:bg-black file:px-3 file:font-medium file:text-white disabled:opacity-50"
              />
            </label>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {imageCount} of {MAX_SETUP_IMAGES} images. The first image is the cover.
            </p>
            {files.length > 0 && (
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {files.map((file, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 py-1 text-sm">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={`Remove ${file.name}`}
                      onClick={() => {
                        setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
                        setError("");
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
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

function MainImage({ image }) {
  const frame = useRef(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!image) return undefined;

    const controller = new AbortController();
    let objectUrl;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setupService.getImage(image.id, controller.signal).then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }).catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    }, { rootMargin: "200px" });
    observer.observe(frame.current);

    return () => {
      observer.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image]);

  return (
    <div ref={frame} className="relative flex aspect-video items-center justify-center bg-black">
      {image ? (
        <img src={url || image.thumbnailUrl} alt={image.originalName} className="h-full w-full object-contain" />
      ) : (
        <p className="text-sm text-[var(--text-muted)]">No images yet</p>
      )}
      {failed && (
        <p role="status" className="absolute bottom-2 left-2 rounded bg-black px-2 py-1 text-xs text-white">
          Full-size image unavailable
        </p>
      )}
    </div>
  );
}

function SetupCard({ setup, onEdit, onViewNotes }) {
  const [selectedImageId, setSelectedImageId] = useState(null);
  const selectedImage = setup.images.find((image) => image.id === selectedImageId) || setup.images[0];

  return (
    <article className="min-w-0 overflow-hidden rounded-[6px] border border-[var(--line)] bg-black">
      <MainImage key={selectedImage?.id} image={selectedImage} />
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
