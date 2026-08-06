import { useState } from "react";

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function TradeTextImport({ onImport, isImporting, csvFormat }) {
  const [text, setText] = useState("");
  const [tradeDate, setTradeDate] = useState(getTodayInputValue);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!text.trim()) {
      return;
    }

    await onImport(text, { tradeDate });
    setText("");
  }

  const isDasFormat = csvFormat === "das";

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {isDasFormat && (
        <label className="block space-y-2 text-sm font-semibold text-white/72">
          <span>Trade date</span>
          <input
            type="date"
            value={tradeDate}
            onChange={(event) => setTradeDate(event.target.value)}
            className="ui-input max-w-[220px] text-sm text-phosphor"
          />
        </label>
      )}
      <textarea
        rows="10"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          isDasFormat
            ? "Paste DAS executions like: 04:37:00 WYHG S 6.59 1 NSDQ SIMON"
            : "Paste executions like: 02/26/26,09:38:39,XWEL,1000,1.32,S,"
        }
        className="ui-input min-h-[220px] text-sm text-phosphor"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/58">
          {isDasFormat
            ? "Supports DAS time, symbol, B/S, price, quantity rows. Route and account columns are ignored."
            : "Supports pasted fill data with `date,time,symbol,quantity,price,B/S`."}
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
