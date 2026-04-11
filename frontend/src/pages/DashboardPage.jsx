import { useMemo, useState } from "react";
import AnalyticsCharts from "../components/AnalyticsCharts";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import { buildAnalytics } from "../utils/analytics";
import { useAuth } from "../context/AuthContext";

const RANGE_OPTIONS = [
  { key: "30", label: "30D", days: 30 },
  { key: "60", label: "60D", days: 60 },
  { key: "90", label: "90D", days: 90 },
  { key: "ALL", label: "ALL", days: null }
];
const PNL_OPTIONS = [
  { key: "GROSS", label: "Gross" },
  { key: "NET", label: "Net" }
];

function filterTradesByRange(trades, days) {
  if (!days || trades.length === 0) {
    return trades;
  }

  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));

  return trades.filter((trade) => new Date(trade.entryDate) >= rangeStart);
}

function DashboardPage() {
  const { user } = useAuth();
  const [rangeKey, setRangeKey] = useState("30");
  const [pnlType, setPnlType] = useState("NET");
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
    return <LoadingState label="Loading dashboard..." panel />;
  }

  if (error) {
    return <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="ui-segment">
            {PNL_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                data-active={option.key === pnlType}
                onClick={() => setPnlType(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="ui-segment">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                data-active={option.key === rangeKey}
                onClick={() => setRangeKey(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredTrades.length === 0 ? (
        <EmptyState
          title="No trades in this range"
          description="Try a longer dashboard range to see your analytics."
        />
      ) : (
        <AnalyticsCharts
          analytics={buildAnalytics(filteredTrades, {
            defaultCommission: user?.defaultCommission ?? 0,
            defaultFees: user?.defaultFees ?? 0,
            pnlType
          })}
        />
      )}
    </div>
  );
}

export default DashboardPage;
