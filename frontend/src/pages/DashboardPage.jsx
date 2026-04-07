import { useMemo, useState } from "react";
import AnalyticsCharts from "../components/AnalyticsCharts";
import EmptyState from "../components/ui/EmptyState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import { buildAnalytics } from "../utils/analytics";

const RANGE_OPTIONS = [
  { key: "30", label: "30D", days: 30 },
  { key: "60", label: "60D", days: 60 },
  { key: "90", label: "90D", days: 90 },
  { key: "ALL", label: "ALL", days: null }
];

function filterTradesByRange(trades, days) {
  if (!days || trades.length === 0) {
    return trades;
  }

  const latestTradeDate = trades.reduce((latest, trade) => {
    const tradeDate = new Date(trade.entryDate);
    return tradeDate > latest ? tradeDate : latest;
  }, new Date(trades[0].entryDate));

  const rangeStart = new Date(latestTradeDate);
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));

  return trades.filter((trade) => new Date(trade.entryDate) >= rangeStart);
}

function DashboardPage() {
  const [rangeKey, setRangeKey] = useState("30");
  const {
    data: trades,
    error,
    loading
  } = useCachedAsyncResource({
    peek: () => tradeService.peekTrades(),
    load: () => tradeService.getTrades(),
    initialValue: [],
    deps: []
  });

  const activeRange = RANGE_OPTIONS.find((option) => option.key === rangeKey) || RANGE_OPTIONS[0];
  const filteredTrades = useMemo(
    () => filterTradesByRange(trades, activeRange.days),
    [trades, activeRange.days]
  );

  if (loading) {
    return <div className="text-sm text-mist">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="ui-notice border-coral/30 bg-[#2a1111] text-coral">{error}</div>;
  }

  if (trades.length === 0) {
    return (
      <EmptyState
        title="No trades yet"
        description="Once you add or import trades, your equity curve, P&L, and win rate will show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {RANGE_OPTIONS.map((option) => {
          const active = option.key === rangeKey;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setRangeKey(option.key)}
              className={`rounded-[12px] px-3 py-2 text-xs font-semibold tracking-[0.12em] transition ${
                active
                  ? "bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.14)]"
                  : "border border-white/10 bg-white/[0.035] text-white/70 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {filteredTrades.length === 0 ? (
        <EmptyState
          title="No trades in this range"
          description="Try a longer dashboard range to see your analytics."
        />
      ) : (
        <AnalyticsCharts analytics={buildAnalytics(filteredTrades)} />
      )}
    </div>
  );
}

export default DashboardPage;
