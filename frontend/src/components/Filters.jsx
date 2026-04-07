function Filters({ filters, onChange, onReset }) {
  return (
    <div className="grid gap-4 rounded-[20px] border border-white/8 bg-white/[0.025] p-4 md:grid-cols-2 xl:grid-cols-5">
      <input
        placeholder="Filter by symbol"
        value={filters.symbol}
        onChange={(event) => onChange("symbol", event.target.value)}
        className="ui-input"
      />

      <select
        value={filters.side}
        onChange={(event) => onChange("side", event.target.value)}
        className="ui-input"
      >
        <option value="">All Sides</option>
        <option value="LONG">LONG</option>
        <option value="SHORT">SHORT</option>
      </select>

      <input
        placeholder="Strategy"
        value={filters.strategy}
        onChange={(event) => onChange("strategy", event.target.value)}
        className="ui-input"
      />

      <input
        type="date"
        value={filters.from}
        onChange={(event) => onChange("from", event.target.value)}
        className="ui-input"
      />

      <div className="flex gap-3">
        <input
          type="date"
          value={filters.to}
          onChange={(event) => onChange("to", event.target.value)}
          className="ui-input"
        />
        <button
          type="button"
          onClick={onReset}
          className="ui-button text-sm"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default Filters;
