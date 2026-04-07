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
        className="ui-input min-h-[220px] text-sm text-phosphor"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/58">
          Supports pasted fill data with `date,time,symbol,quantity,price,B/S`.
        </p>
        <button
          type="submit"
          disabled={!text.trim() || isImporting}
          className="ui-button-solid text-sm"
        >
          {isImporting ? "Importing..." : "Import Text Trades"}
        </button>
      </div>
    </form>
  );
}

export default TradeTextImport;
