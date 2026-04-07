import { useEffect, useMemo, useRef, useState } from "react";

const PRESET_OPTIONS = [
  { key: "TODAY", label: "Today" },
  { key: "YESTERDAY", label: "Yesterday" },
  { key: "LAST_7", label: "Last 7 Days" },
  { key: "LAST_30", label: "Last 30 Days" },
  { key: "THIS_MONTH", label: "This Month" },
  { key: "LAST_MONTH", label: "Last Month" },
  { key: "LAST_12_MONTHS", label: "Last 12 Months" },
  { key: "LAST_YEAR", label: "Last Year" },
  { key: "YTD", label: "YTD" },
  { key: "CUSTOM", label: "Custom Range" }
];

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatIsoDate(date) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = String(value).split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function sameDay(a, b) {
  return !!a && !!b && formatIsoDate(a) === formatIsoDate(b);
}

function getPresetRange(key, baseDate = new Date()) {
  const today = startOfDay(baseDate);

  switch (key) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday, to: yesterday };
    }
    case "LAST_7": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from, to: today };
    }
    case "LAST_30": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from, to: today };
    }
    case "THIS_MONTH":
      return { from: startOfMonth(today), to: today };
    case "LAST_MONTH": {
      const lastMonth = addMonths(today, -1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case "LAST_12_MONTHS": {
      const from = startOfMonth(addMonths(today, -11));
      return { from, to: today };
    }
    case "LAST_YEAR": {
      const year = today.getFullYear() - 1;
      return {
        from: new Date(year, 0, 1),
        to: new Date(year, 11, 31)
      };
    }
    case "YTD":
      return { from: new Date(today.getFullYear(), 0, 1), to: today };
    default:
      return { from: null, to: null };
  }
}

function buildMonthCells(monthDate) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const leading = monthStart.getDay();
  const trailing = 6 - monthEnd.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - leading);
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + trailing);

  const cells = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
}

function getLabel(from, to) {
  if (!from && !to) {
    return "From - To";
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  if (from && to) {
    return `${formatter.format(from)} - ${formatter.format(to)}`;
  }

  return formatter.format(from || to);
}

function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "From - To",
  className = "",
  buttonClassName = "",
  align = "left"
}) {
  const rootRef = useRef(null);
  const initialFrom = parseIsoDate(from);
  const initialTo = parseIsoDate(to);
  const [isOpen, setIsOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [activePreset, setActivePreset] = useState("CUSTOM");
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(initialFrom || initialTo || new Date())
  );

  useEffect(() => {
    setDraftFrom(parseIsoDate(from));
    setDraftTo(parseIsoDate(to));
  }, [from, to]);

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

  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);
  const nextMonth = useMemo(() => addMonths(visibleMonth, 1), [visibleMonth]);
  const nextMonthCells = useMemo(() => buildMonthCells(nextMonth), [nextMonth]);

  function openPicker() {
    const parsedFrom = parseIsoDate(from);
    const parsedTo = parseIsoDate(to);
    setDraftFrom(parsedFrom);
    setDraftTo(parsedTo);
    setVisibleMonth(startOfMonth(parsedFrom || parsedTo || new Date()));
    setIsOpen(true);
  }

  function applyPreset(key) {
    setActivePreset(key);

    if (key === "CUSTOM") {
      return;
    }

    const range = getPresetRange(key);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setVisibleMonth(startOfMonth(range.from || new Date()));
  }

  function handleDayClick(date) {
    setActivePreset("CUSTOM");

    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(date);
      setDraftTo(null);
      return;
    }

    if (date < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(date);
      return;
    }

    setDraftTo(date);
  }

  function handleApply() {
    onChange({
      from: draftFrom ? formatIsoDate(startOfDay(draftFrom)) : "",
      to: draftTo ? formatIsoDate(endOfDay(draftTo)) : draftFrom ? formatIsoDate(endOfDay(draftFrom)) : ""
    });
    setIsOpen(false);
  }

  function handleCancel() {
    setDraftFrom(parseIsoDate(from));
    setDraftTo(parseIsoDate(to));
    setIsOpen(false);
  }

  function renderMonth(monthDate, cells) {
    return (
      <div className="min-w-0">
        <div className="mb-4 text-center text-sm font-semibold text-white">
          {monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </div>
        <div className="grid grid-cols-7 gap-y-2 text-center text-xs font-medium text-white/54">
          {WEEKDAY_LABELS.map((label) => (
            <div key={`${monthDate.toISOString()}-${label}`}>{label}</div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-7 gap-2">
          {cells.map((cellDate) => {
            const currentMonth = cellDate.getMonth() === monthDate.getMonth();
            const selectedStart = sameDay(cellDate, draftFrom);
            const selectedEnd = sameDay(cellDate, draftTo);
            const inRange =
              draftFrom &&
              draftTo &&
              cellDate >= startOfDay(draftFrom) &&
              cellDate <= startOfDay(draftTo);

            return (
              <button
                key={cellDate.toISOString()}
                type="button"
                onClick={() => handleDayClick(cellDate)}
                className={`h-10 rounded-[10px] text-sm font-medium transition ${
                  selectedStart || selectedEnd
                    ? "bg-mint text-black"
                    : inRange
                      ? "bg-mint/12 text-mint"
                      : currentMonth
                        ? "text-white/84 hover:bg-white/[0.05]"
                        : "text-white/22"
                }`}
              >
                {cellDate.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative ${isOpen ? "z-[90]" : "z-0"} ${className}`}>
      <button
        type="button"
        onClick={openPicker}
        className={`ui-input flex w-full items-center justify-between gap-3 text-left shadow-none ${buttonClassName}`}
      >
        <span className="flex items-center gap-3">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-white/42">
            <path d="M6 2.5v2M14 2.5v2M3.5 7h13M5 4.5h10A1.5 1.5 0 0 1 16.5 6v9A1.5 1.5 0 0 1 15 16.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={from || to ? "text-white" : "text-white/42"}>
            {from || to ? getLabel(initialFrom, initialTo) : placeholder}
          </span>
        </span>
      </button>

      {isOpen ? (
        <div
          className={`ui-popover absolute top-[calc(100%+10px)] z-50 w-[min(1040px,calc(100vw-40px))] overflow-hidden ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="grid min-h-[520px] xl:grid-cols-[290px_1fr]">
            <div className="border-r border-[var(--line)] p-5">
              <div className="space-y-2">
                {PRESET_OPTIONS.map((option) => {
                  const active = option.key === activePreset;

                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => applyPreset(option.key)}
                      className={`flex w-full items-center justify-between rounded-[12px] px-4 py-3 text-left text-sm font-medium transition ${
                        active
                          ? "bg-[linear-gradient(180deg,rgba(103,168,255,0.18),rgba(103,168,255,0.1))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                          : "text-white/72 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span>{option.label}</span>
                      {active ? <span className="text-mint">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-5">
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                  className="ui-button px-3 py-2 text-sm"
                >
                  ‹
                </button>
                <div className="grid flex-1 gap-8 xl:grid-cols-2">
                  {renderMonth(visibleMonth, monthCells)}
                  {renderMonth(nextMonth, nextMonthCells)}
                </div>
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                  className="ui-button px-3 py-2 text-sm"
                >
                  ›
                </button>
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-6 py-5">
                <div className="text-sm text-white/62">
                  {(draftFrom ? formatIsoDate(draftFrom) : "---- -- --").replace(/-/g, "/")} -{" "}
                  {(draftTo ? formatIsoDate(draftTo) : draftFrom ? formatIsoDate(draftFrom) : "---- -- --").replace(/-/g, "/")}
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={handleCancel} className="ui-button px-5 py-3 text-sm">
                    Cancel
                  </button>
                  <button type="button" onClick={handleApply} className="ui-button-solid px-5 py-3 text-sm">
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DateRangePicker;
