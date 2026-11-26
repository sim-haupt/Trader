import { useCallback, useEffect, useId, useRef, useState } from "react";

const controlClass = "ui-button flex h-11 w-11 shrink-0 items-center justify-center p-0 text-xl";
const origin = { x: 0, y: 0 };

function ZoomableImage({ src, name, error, onStep }) {
  const viewport = useRef(null);
  const image = useRef(null);
  const drag = useRef(null);
  const [{ zoom, pan }, setView] = useState({ zoom: 1, pan: origin });
  const [dragging, setDragging] = useState(false);

  const constrainPan = useCallback((nextPan, scale) => {
    if (!viewport.current || !image.current || scale <= 1) return origin;
    const { clientWidth, clientHeight } = viewport.current;
    const { naturalWidth, naturalHeight } = image.current;
    if (!naturalWidth) return origin;

    const fit = Math.min(clientWidth / naturalWidth, clientHeight / naturalHeight);
    const limitX = Math.max(0, (naturalWidth * fit * scale - clientWidth) / 2);
    const limitY = Math.max(0, (naturalHeight * fit * scale - clientHeight) / 2);
    return {
      x: Math.min(limitX, Math.max(-limitX, nextPan.x)),
      y: Math.min(limitY, Math.max(-limitY, nextPan.y))
    };
  }, []);

  const resizeZoom = useCallback((amount) => {
    setView((current) => {
      const nextZoom = Math.min(5, Math.max(1, current.zoom + amount));
      return nextZoom === current.zoom ? current : { zoom: nextZoom, pan: constrainPan(current.pan, nextZoom) };
    });
  }, [constrainPan]);

  const fitPan = useCallback(() => {
    setView((current) => {
      const next = constrainPan(current.pan, current.zoom);
      return next.x === current.pan.x && next.y === current.pan.y ? current : { ...current, pan: next };
    });
  }, [constrainPan]);

  useEffect(() => {
    const element = viewport.current;
    const resize = new ResizeObserver(fitPan);
    function wheel(event) {
      if (event.deltaY === 0) return;
      event.preventDefault();
      resizeZoom(event.deltaY < 0 ? 0.25 : -0.25);
    }
    element.addEventListener("wheel", wheel, { passive: false });
    resize.observe(element);
    return () => {
      element.removeEventListener("wheel", wheel);
      resize.disconnect();
    };
  }, [fitPan, resizeZoom]);

  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0 || (zoom === 1 && event.pointerType !== "touch")) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event) {
    const start = drag.current;
    if (start?.id !== event.pointerId || zoom === 1) return;
    setView({
      zoom,
      pan: constrainPan({ x: start.pan.x + event.clientX - start.x, y: start.pan.y + event.clientY - start.y }, zoom)
    });
  }

  function finishDrag(event) {
    const start = drag.current;
    if (start?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.type !== "pointerup" || zoom > 1) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) onStep(dx < 0 ? 1 : -1);
  }

  return (
    <>
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[6px] border border-white/15 bg-black px-2 py-1">
        <button type="button" className={controlClass} aria-label="Zoom out" disabled={zoom === 1} onClick={() => resizeZoom(-0.25)}>−</button>
        <button type="button" className="ui-button min-h-11 min-w-[4rem] px-2 text-sm tabular-nums" aria-label="Reset zoom" onClick={() => resizeZoom(1 - zoom)}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className={controlClass} aria-label="Zoom in" disabled={zoom === 5} onClick={() => resizeZoom(0.25)}>+</button>
      </div>
      <div
        ref={viewport}
        className={`flex h-full w-full touch-none items-center justify-center overflow-hidden ${zoom > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onLostPointerCapture={finishDrag}
      >
        <img
          ref={image}
          src={src}
          alt={name}
          draggable={false}
          className="h-full w-full select-none object-contain"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          onLoad={fitPan}
        />
        {error && <p role="status" className="absolute bottom-20 rounded bg-black px-3 py-2 text-sm text-white">Full-size image unavailable</p>}
      </div>
    </>
  );
}

function ImageLightbox({ image, src, error, index, count, onStep, onClose }) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  function close() {
    dialog.current.close();
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden bg-black text-white open:flex open:flex-col"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onStep(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 px-4 py-2">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">{image.originalName}</h2>
          <p className="text-xs text-[var(--text-muted)]">{index + 1} of {count}</p>
        </div>
        <button type="button" className={controlClass} aria-label="Close image preview" onClick={close}>×</button>
      </header>
      <div className="relative min-h-0 flex-1">
        <ZoomableImage key={image.id} src={src} name={image.originalName} error={error} onStep={onStep} />
        {count > 1 && (
          <>
            <button type="button" className={`${controlClass} absolute left-2 top-1/2 -translate-y-1/2 bg-black sm:left-4`} aria-label="Previous image" onClick={() => onStep(-1)}>‹</button>
            <button type="button" className={`${controlClass} absolute right-2 top-1/2 -translate-y-1/2 bg-black sm:right-4`} aria-label="Next image" onClick={() => onStep(1)}>›</button>
          </>
        )}
      </div>
    </dialog>
  );
}

export default ImageLightbox;
