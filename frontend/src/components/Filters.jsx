import CustomSelect from "./ui/CustomSelect";

function Filters({ filters, onChange, onReset }) {
  return (
    <div className="grid gap-4 rounded-[20px] border border-[#e5e7eb42] bg-white/[0.025] p-4 md:grid-cols-2 xl:grid-cols-5">
      <input
        placeholder="Filter by symbol"
        value={filters.symbol}
        onChange={(event) => onChange("symbol", event.target.value)}
        className="ui-input"
      />

      <CustomSelect
        value={filters.side}
        onChange={(nextValue) => onChange("side", nextValue)}
        options={[
          { label: "All Sides", value: "" },
          { label: "LONG", value: "LONG" },
          { label: "SHORT", value: "SHORT" }
        ]}
        placeholder="All Sides"
      />

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
