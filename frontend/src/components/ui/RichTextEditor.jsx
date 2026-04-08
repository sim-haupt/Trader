import { useEffect, useMemo, useRef, useState } from "react";
import { isRichTextEmpty, normalizeRichTextHtml } from "../../utils/richText";

function ToolbarButton({ label, title, onMouseDown, active = false }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={onMouseDown}
      className={`flex h-9 min-w-9 items-center justify-center rounded-[6px] border px-2 text-sm font-medium transition ${
        active
          ? "border-[var(--line)] bg-[#1f1f1f] text-white"
          : "border-[var(--line)] bg-black text-[var(--text-muted)] hover:bg-[#1f1f1f] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-7 w-px bg-[var(--line)]" />;
}

function getBlockLabel(editor) {
  if (!editor) {
    return "Normal";
  }

  const parent = window.getSelection()?.anchorNode?.parentElement;
  const tagName = parent?.closest("h2, h3, blockquote, pre")?.tagName?.toLowerCase();

  switch (tagName) {
    case "h2":
      return "Heading 2";
    case "h3":
      return "Heading 3";
    case "blockquote":
      return "Quote";
    case "pre":
      return "Code";
    default:
      return "Normal";
  }
}

function RichTextEditor({
  value,
  onChange,
  placeholder = "Write notes…",
  minHeight = 160,
  className = ""
}) {
  const editorRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [blockLabel, setBlockLabel] = useState("Normal");
  const normalizedValue = useMemo(() => normalizeRichTextHtml(value), [value]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if (editorRef.current.innerHTML !== normalizedValue) {
      editorRef.current.innerHTML = normalizedValue;
    }
    setBlockLabel(getBlockLabel(editorRef.current));
  }, [normalizedValue]);

  function runCommand(command, commandValue = null) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || "");
    setBlockLabel(getBlockLabel(editorRef.current));
  }

  function handleInput() {
    onChange(editorRef.current?.innerHTML || "");
    setBlockLabel(getBlockLabel(editorRef.current));
  }

  function queryState(command) {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  }

  const isEmpty = isRichTextEmpty(value);

  return (
    <div className={`rounded-[6px] border border-[var(--line)] bg-black ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[#050505] px-3 py-3">
        <select
          aria-label="Text style"
          className="h-9 min-w-[130px] rounded-[6px] border border-[var(--line)] bg-black px-3 text-sm text-[var(--text-muted)] outline-none transition focus:border-[var(--line)]"
          value={blockLabel}
          onChange={(event) => {
            const nextValue = event.target.value;

            if (nextValue === "Normal") {
              runCommand("formatBlock", "<p>");
            } else if (nextValue === "Heading 2") {
              runCommand("formatBlock", "<h2>");
            } else if (nextValue === "Heading 3") {
              runCommand("formatBlock", "<h3>");
            } else if (nextValue === "Quote") {
              runCommand("formatBlock", "<blockquote>");
            } else if (nextValue === "Code") {
              runCommand("formatBlock", "<pre>");
            }
          }}
        >
          <option value="Normal">Normal</option>
          <option value="Heading 2">Heading 2</option>
          <option value="Heading 3">Heading 3</option>
          <option value="Quote">Quote</option>
          <option value="Code">Code</option>
        </select>
        <ToolbarDivider />
        <ToolbarButton label="B" title="Bold" active={queryState("bold")} onMouseDown={(event) => { event.preventDefault(); runCommand("bold"); }} />
        <ToolbarButton label="I" title="Italic" active={queryState("italic")} onMouseDown={(event) => { event.preventDefault(); runCommand("italic"); }} />
        <ToolbarButton label="U" title="Underline" active={queryState("underline")} onMouseDown={(event) => { event.preventDefault(); runCommand("underline"); }} />
        <ToolbarButton label="S" title="Strikethrough" active={queryState("strikeThrough")} onMouseDown={(event) => { event.preventDefault(); runCommand("strikeThrough"); }} />
        <ToolbarDivider />
        <ToolbarButton label="•" title="Bullet list" active={queryState("insertUnorderedList")} onMouseDown={(event) => { event.preventDefault(); runCommand("insertUnorderedList"); }} />
        <ToolbarButton label="1." title="Numbered list" active={queryState("insertOrderedList")} onMouseDown={(event) => { event.preventDefault(); runCommand("insertOrderedList"); }} />
        <ToolbarButton label="❝" title="Quote" onMouseDown={(event) => { event.preventDefault(); runCommand("formatBlock", "<blockquote>"); }} />
        <ToolbarButton label="</>" title="Code block" onMouseDown={(event) => { event.preventDefault(); runCommand("formatBlock", "<pre>"); }} />
        <ToolbarDivider />
        <ToolbarButton label="←" title="Align left" onMouseDown={(event) => { event.preventDefault(); runCommand("justifyLeft"); }} />
        <ToolbarButton label="≡" title="Align center" onMouseDown={(event) => { event.preventDefault(); runCommand("justifyCenter"); }} />
        <ToolbarButton label="→" title="Align right" onMouseDown={(event) => { event.preventDefault(); runCommand("justifyRight"); }} />
        <ToolbarDivider />
        <ToolbarButton label="⟲" title="Undo" onMouseDown={(event) => { event.preventDefault(); runCommand("undo"); }} />
        <ToolbarButton label="⟳" title="Redo" onMouseDown={(event) => { event.preventDefault(); runCommand("redo"); }} />
        <ToolbarButton label="Tx" title="Clear formatting" onMouseDown={(event) => { event.preventDefault(); runCommand("removeFormat"); }} />
      </div>

      <div className="relative">
        {isEmpty && !focused ? (
          <div className="pointer-events-none absolute left-4 top-4 text-sm text-[var(--text-muted)]">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setBlockLabel(getBlockLabel(editorRef.current));
          }}
          onKeyUp={() => setBlockLabel(getBlockLabel(editorRef.current))}
          onMouseUp={() => setBlockLabel(getBlockLabel(editorRef.current))}
          className="min-h-[120px] px-4 py-4 text-sm leading-7 text-[var(--text)] outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--line)] [&_blockquote]:pl-4 [&_blockquote]:text-[var(--text-muted)] [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:min-h-[1.5em] [&_pre]:overflow-x-auto [&_pre]:rounded-[6px] [&_pre]:border [&_pre]:border-[var(--line)] [&_pre]:bg-[#050505] [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[13px] [&_ul]:ml-5 [&_ul]:list-disc"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}

export default RichTextEditor;
