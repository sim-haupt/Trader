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
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => setFile(event.target.files?.[0] || null)}
        className="block w-full rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white file:mr-4 file:rounded-xl file:border file:border-white/10 file:bg-white/90 file:px-4 file:py-2 file:text-sm file:font-medium file:text-black hover:file:brightness-105"
      />
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
