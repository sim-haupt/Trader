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
        className={`ui-input flex w-full items-center justify-between gap-3 text-left ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selectedOption ? "text-white" : "text-white/42"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span
          className={`text-[10px] text-white/46 transition ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      {isOpen ? (
        <div
          className={`absolute top-[calc(100%+8px)] z-50 min-w-full overflow-hidden rounded-[14px] border border-[#e5e7eb24] bg-[#171d29]/98 p-1 shadow-[0_18px_38px_rgba(0,0,0,0.32)] backdrop-blur ${align === "right" ? "right-0" : "left-0"} ${menuClassName}`}
          role="listbox"
        >
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
                className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-sm transition ${
                  option.disabled
                    ? "cursor-not-allowed text-white/24"
                    : active
                      ? "bg-white text-black"
                      : "text-white/78 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span>{option.label}</span>
                {active ? <span className="text-[10px]">●</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default CustomSelect;
