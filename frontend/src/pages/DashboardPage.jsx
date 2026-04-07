import { useEffect, useMemo, useState } from "react";
import AnalyticsCharts, {
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeDashboardLayout
} from "../components/AnalyticsCharts";
import EmptyState from "../components/ui/EmptyState";
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
const DASHBOARD_LAYOUT_STORAGE_KEY = "trader-dashboard-layout-v1";

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
  const { user } = useAuth();
  const [rangeKey, setRangeKey] = useState("30");
  const [editingLayout, setEditingLayout] = useState(false);
  const [layout, setLayout] = useState(DEFAULT_DASHBOARD_LAYOUT);
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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
      if (stored) {
        setLayout(normalizeDashboardLayout(JSON.parse(stored)));
      }
    } catch {
      setLayout(DEFAULT_DASHBOARD_LAYOUT);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      DASHBOARD_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalizeDashboardLayout(layout))
    );
  }, [layout]);

  const activeRange = RANGE_OPTIONS.find((option) => option.key === rangeKey) || RANGE_OPTIONS[0];
  const filteredTrades = useMemo(
    () => filterTradesByRange(trades, activeRange.days),
    [trades, activeRange.days]
  );

  function reorderLayout(sourceId, targetId) {
    setLayout((current) => {
      const next = [...normalizeDashboardLayout(current)];
      const sourceIndex = next.findIndex((item) => item.id === sourceId);
      const targetIndex = next.findIndex((item) => item.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function toggleSpan(widgetId) {
    setLayout((current) =>
      normalizeDashboardLayout(current).map((item) =>
        item.id === widgetId
          ? { ...item, span: item.span === 2 ? 1 : 2 }
          : item
      )
    );
  }

  function resetLayout() {
    setLayout(DEFAULT_DASHBOARD_LAYOUT);
  }

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditingLayout((current) => !current)}
            className={`px-3 py-2 text-xs font-semibold tracking-[0.12em] ${
              editingLayout
                ? "bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.14)]"
                : "ui-button text-white/70 hover:text-white"
            }`}
          >
            {editingLayout ? "DONE" : "EDIT LAYOUT"}
          </button>
          {editingLayout ? (
            <button
              type="button"
              onClick={resetLayout}
              className="ui-button px-3 py-2 text-xs font-semibold tracking-[0.12em] text-white/70 hover:text-white"
            >
              RESET
            </button>
          ) : null}
        </div>

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
                    : "ui-button text-white/70 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
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
            defaultCommission: user?.defaultCommission ?? 0
          })}
          layout={layout}
          editing={editingLayout}
          onReorder={reorderLayout}
          onToggleSpan={toggleSpan}
        />
      )}
    </div>
  );
}

export default DashboardPage;
