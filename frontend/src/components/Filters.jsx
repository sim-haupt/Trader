import CustomSelect from "./ui/CustomSelect";
import DateRangePicker from "./ui/DateRangePicker";

function Filters({ filters, onChange, onReset, onApply, strategies = [] }) {
  return (
    <div className="ui-panel relative z-20 overflow-visible p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_170px_170px_190px_auto] xl:items-end">
        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Symbol</label>
          <input
            placeholder="Symbol"
            value={filters.symbol}
            onChange={(event) => onChange("symbol", event.target.value)}
            className="ui-input"
          />
        </div>

        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Side</label>
          <CustomSelect
            value={filters.side}
            onChange={(nextValue) => onChange("side", nextValue)}
            options={[
              { label: "All", value: "" },
              { label: "LONG", value: "LONG" },
              { label: "SHORT", value: "SHORT" }
            ]}
            placeholder="All"
            buttonClassName="!py-3"
          />
        </div>

        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Strategy</label>
          <CustomSelect
            value={filters.strategy}
            onChange={(nextValue) => onChange("strategy", nextValue)}
            options={[
              { label: "All", value: "" },
              ...strategies.map((strategy) => ({
                label: strategy.name,
                value: strategy.name
              }))
            ]}
            placeholder="All"
            buttonClassName="!py-3"
          />
        </div>

        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-white/72">Date range</label>
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onChange={({ from, to }) => {
              onChange("from", from);
              onChange("to", to);
            }}
            buttonClassName="!py-3"
          />
        </div>

        <div className="flex items-end justify-end gap-2">
          <button type="button" onClick={onReset} className="ui-button text-sm">
            Reset
          </button>
          <button type="button" onClick={onApply} className="ui-button-solid text-sm">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default Filters;
