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
        className="block w-full rounded-2xl border border-dashed border-white/20 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/20"
      />
      <button
        type="submit"
        disabled={!file || isUploading}
        className="rounded-full bg-gold px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#ffe08d] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isUploading ? "Uploading..." : "Upload CSV"}
      </button>
    </form>
  );
}

export default UploadCSV;
