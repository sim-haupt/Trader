import { useState } from "react";

function UploadCSV({ onUpload, isUploading }) {
  const [file, setFile] = useState(null);
  const [csvFormat, setCsvFormat] = useState("das");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!file) {
      return;
    }

    await onUpload(file, csvFormat);
    setFile(null);
    event.target.reset();
  }

  function selectCsvFormat(nextFormat) {
    setCsvFormat((currentFormat) => (currentFormat === nextFormat ? currentFormat : nextFormat));
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-wrap gap-3">
        {[
          { value: "das", label: "DAS Trader" },
          { value: "warrior", label: "Warrior Trading" }
        ].map((option) => (
          <label
            key={option.value}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[6px] border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm font-semibold text-white/82"
          >
            <input
              type="checkbox"
              checked={csvFormat === option.value}
              onChange={() => selectCsvFormat(option.value)}
              className="h-4 w-4 accent-phosphor"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="ui-panel flex-1 border-dashed p-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="block w-full text-sm text-white/72 file:mr-4 file:rounded-[6px] file:border file:border-[var(--line)] file:bg-white file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-[#0c1522] hover:file:brightness-105"
          />
        </div>
        <button
          type="submit"
          disabled={!file || isUploading}
          className="ui-button-solid text-sm"
        >
          {isUploading ? "Uploading..." : "Upload CSV"}
        </button>
      </div>
    </form>
  );
}

export default UploadCSV;
