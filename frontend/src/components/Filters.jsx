import CustomSelect from "./ui/CustomSelect";
import DateRangePicker from "./ui/DateRangePicker";

function Filters({ filters, onChange, onReset, strategies = [], tags = [], actionContent = null }) {
  return (
    <div className="relative z-20 overflow-visible">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_160px_160px_160px_180px_auto] xl:items-end xl:justify-start">
        <div className="min-w-0 xl:w-[180px]">
          <label className="mb-2 block text-xs font-medium text-white/72">Ticker</label>
          <input
            placeholder="Ticker"
            value={filters.symbol}
            onChange={(event) => onChange("symbol", event.target.value)}
            className="ui-input min-h-[48px]"
          />
        </div>

        <div className="min-w-0 xl:w-[160px]">
          <label className="mb-2 block text-xs font-medium text-white/72">Tags</label>
          <CustomSelect
            value={filters.tag}
            onChange={(nextValue) => onChange("tag", nextValue)}
            options={[
              { label: "Select", value: "" },
              ...tags.map((tag) => ({
                label: tag.name,
                value: tag.name
              }))
            ]}
            placeholder="Select"
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

        <div className="min-w-0 xl:w-[160px]">
          <label className="mb-2 block text-xs font-medium text-white/72">Side</label>
          <CustomSelect
            value={filters.side}
            onChange={(nextValue) => onChange("side", nextValue)}
            options={[
              { label: "All", value: "" },
              { label: "Long", value: "LONG" },
              { label: "Short", value: "SHORT" }
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
            placeholder="From - To"
            buttonClassName="!py-3"
          />
        </div>

        <div className="flex flex-wrap items-end justify-end gap-2 self-end">
          {actionContent}
          <button type="button" onClick={onReset} className="ui-button min-h-[46px] px-5 py-3 text-sm">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

export default Filters;
