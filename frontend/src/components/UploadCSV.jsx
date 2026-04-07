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
        className="block w-full border-2 border-dashed border-white/15 bg-black/55 px-4 py-3 text-sm text-white file:mr-4 file:border-[3px] file:border-[#050608] file:bg-[linear-gradient(180deg,#2e3139,#1e2128)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:brightness-110"
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
