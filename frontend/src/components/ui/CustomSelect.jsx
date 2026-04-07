import { useEffect, useMemo, useRef, useState } from "react";

function normalizeOptions(options) {
  return options.map((option) =>
    typeof option === "string"
      ? { label: option, value: option }
      : {
          label: option.label,
          value: option.value,
          disabled: option.disabled
        }
  );
}

function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  className = "",
  menuClassName = "",
  buttonClassName = "",
  align = "left"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);

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

  const selectedOption = normalizedOptions.find((option) => option.value === value);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`ui-input flex w-full items-center justify-between gap-3 text-left shadow-none ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selectedOption ? "text-white" : "text-white/44"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen ? (
        <div
          className={`ui-popover absolute top-[calc(100%+10px)] z-50 min-w-full overflow-hidden p-1 ${align === "right" ? "right-0" : "left-0"} ${menuClassName}`}
          role="listbox"
        >
          <div className="max-h-72 overflow-y-auto">
            {normalizedOptions.map((option) => {
              const active = option.value === value;

              return (
                <button
                  key={String(option.value)}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) {
                      return;
                    }

                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-[12px] px-3 py-2.5 text-sm transition ${
                    option.disabled
                      ? "cursor-not-allowed text-white/24"
                      : active
                        ? "bg-[linear-gradient(180deg,#7fc0ff,#5f9cff)] text-[#08111d] shadow-[0_10px_22px_rgba(103,168,255,0.18)]"
                        : "text-white/78 hover:bg-white/[0.055] hover:text-white"
                  }`}
                >
                  <span>{option.label}</span>
                  {active ? (
                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                      <path d="m4.5 10.5 3.5 3.5 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CustomSelect;
