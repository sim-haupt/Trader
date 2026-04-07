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
        className="block w-full border-2 border-dashed border-mint/25 bg-black/55 px-4 py-3 text-sm text-mint file:mr-4 file:border-2 file:border-mint/35 file:bg-mint/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-mint hover:file:bg-mint/18"
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
