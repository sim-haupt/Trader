import { useState } from "react";

function TradeTextImport({ onImport, isImporting }) {
  const [text, setText] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!text.trim()) {
      return;
    }

    await onImport(text);
    setText("");
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <textarea
        rows="10"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste executions like: 02/26/26,09:38:39,XWEL,1000,1.32,S,"
        className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition focus:border-mint"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mist">
          Supports pasted fill data with `date,time,symbol,quantity,price,B/S`.
        </p>
        <button
          type="submit"
          disabled={!text.trim() || isImporting}
          className="rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#8df6d2] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isImporting ? "Importing..." : "Import Text Trades"}
        </button>
      </div>
    </form>
  );
}

export default TradeTextImport;
