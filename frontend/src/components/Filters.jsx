import CustomSelect from "./ui/CustomSelect";
import DateRangePicker from "./ui/DateRangePicker";

function Filters({ filters, onChange, onReset, onApply, strategies = [] }) {
  return (
    <div className="ui-panel relative z-20 overflow-visible grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)_minmax(0,1.15fr)_auto]">
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

      <CustomSelect
        value={filters.strategy}
        onChange={(nextValue) => onChange("strategy", nextValue)}
        options={[
          { label: "All Strategies", value: "" },
          ...strategies.map((strategy) => ({
            label: strategy.name,
            value: strategy.name
          }))
        ]}
        placeholder="All Strategies"
      />

      <DateRangePicker
        from={filters.from}
        to={filters.to}
        onChange={({ from, to }) => {
          onChange("from", from);
          onChange("to", to);
        }}
        className="xl:min-w-[260px]"
      />

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onReset} className="ui-button text-sm">
          Reset
        </button>
        <button type="button" onClick={onApply} className="ui-button-solid text-sm">
          Apply Filters
        </button>
      </div>
    </div>
  );
}

export default Filters;
