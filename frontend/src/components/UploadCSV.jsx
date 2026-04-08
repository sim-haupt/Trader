import { useState } from "react";

function UploadCSV({ onUpload, isUploading }) {
  const [file, setFile] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!file) {
      return;
    }

    await onUpload(file);
    setFile(null);
    event.target.reset();
  }

  return (
    <form className="flex flex-col gap-4 md:flex-row md:items-center" onSubmit={handleSubmit}>
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
    </form>
  );
}

export default UploadCSV;
