function Filters({ filters, onChange, onReset }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <input
        placeholder="Filter by symbol"
        value={filters.symbol}
        onChange={(event) => onChange("symbol", event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
      />

      <select
        value={filters.side}
        onChange={(event) => onChange("side", event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
      >
        <option value="">All Sides</option>
        <option value="LONG">LONG</option>
        <option value="SHORT">SHORT</option>
      </select>

      <input
        placeholder="Strategy"
        value={filters.strategy}
        onChange={(event) => onChange("strategy", event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
      />

      <input
        type="date"
        value={filters.from}
        onChange={(event) => onChange("from", event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
      />

      <div className="flex gap-3">
        <input
          type="date"
          value={filters.to}
          onChange={(event) => onChange("to", event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        />
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:border-white/30"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default Filters;
