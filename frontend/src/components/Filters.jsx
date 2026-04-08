import CustomSelect from "./ui/CustomSelect";
import DateRangePicker from "./ui/DateRangePicker";

function Filters({ filters, onChange, onReset, strategies = [], tags = [] }) {
  return (
    <div className="ui-panel relative z-20 overflow-visible p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[170px_160px_160px_160px_180px_auto] xl:items-end xl:justify-start">
        <div className="min-w-0 xl:w-[180px]">
          <label className="mb-2 block text-xs font-medium text-white/72">Symbol</label>
          <input
            placeholder="Symbol"
            value={filters.symbol}
            onChange={(event) => onChange("symbol", event.target.value)}
            className="ui-input"
          />
        </div>

        <div className="min-w-0 xl:w-[160px]">
          <label className="mb-2 block text-xs font-medium text-white/72">Tags</label>
          <CustomSelect
            value={filters.tag}
            onChange={(nextValue) => onChange("tag", nextValue)}
            options={[
              { label: "All", value: "" },
              ...tags.map((tag) => ({
                label: tag.name,
                value: tag.name
              }))
            ]}
            placeholder="All"
            buttonClassName="!py-3"
          />
        </div>

        <div className="min-w-0 xl:w-[160px]">
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

        <div className="min-w-0 xl:w-[160px]">
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

        <div className="min-w-0 xl:w-[180px]">
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

        <div className="flex items-center justify-end gap-2 xl:self-center">
          <button type="button" onClick={onReset} className="ui-button text-sm">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

export default Filters;
