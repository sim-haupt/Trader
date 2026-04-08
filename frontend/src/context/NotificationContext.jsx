import { createContext, useContext, useMemo, useRef, useState } from "react";

const NotificationContext = createContext(null);

function toneStyles(tone) {
  switch (tone) {
    case "success":
      return "border-mint/30 bg-[#102218]/96 text-mint";
    case "error":
      return "border-coral/30 bg-[#2a1111]/96 text-coral";
    case "warning":
      return "border-gold/30 bg-[#2a2111]/96 text-gold";
    default:
      return "border-[#e5e7eb42] bg-[#171d2b]/96 text-white";
  }
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const nextIdRef = useRef(1);

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function notify({ title, description = "", tone = "info", duration = 3200 }) {
    const id = nextIdRef.current;
    nextIdRef.current += 1;

    setToasts((current) => [...current, { id, title, description, tone }]);

    window.setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  function confirm({
    title,
    description = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone = "warning"
  }) {
    return new Promise((resolve) => {
      setConfirmState({
        title,
        description,
        confirmLabel,
        cancelLabel,
        tone,
        resolve
      });
    });
  }

  function closeConfirm(result) {
    if (confirmState?.resolve) {
      confirmState.resolve(result);
    }
    setConfirmState(null);
  }

  const value = useMemo(
    () => ({
      notify,
      confirm
    }),
    []
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-5 top-5 z-[140] flex w-[min(420px,calc(100vw-24px))] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-[18px] border px-4 py-3 shadow-[0_22px_70px_rgba(3,8,20,0.45)] backdrop-blur ${toneStyles(
              toast.tone
            )}`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{toast.title}</div>
                {toast.description ? (
                  <div className="mt-1 text-sm leading-6 text-current/80">{toast.description}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-[10px] px-2 py-1 text-xs text-current/70 transition hover:bg-white/[0.06] hover:text-current"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#050811]/68 px-4 backdrop-blur-sm">
          <div className={`w-full max-w-[460px] rounded-[22px] border p-6 shadow-[0_40px_120px_rgba(0,0,0,0.45)] ${toneStyles(confirmState.tone)}`}>
            <div className="text-lg font-semibold text-white">{confirmState.title}</div>
            {confirmState.description ? (
              <p className="mt-3 text-sm leading-7 text-white/72">{confirmState.description}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="ui-button px-4 py-2 text-sm"
              >
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className={`px-4 py-2 text-sm ${confirmState.tone === "error" ? "ui-button-danger" : "ui-button-solid"}`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }

  return context;
}
