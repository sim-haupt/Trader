import AnalyticsCharts from "../components/AnalyticsCharts";
import EmptyState from "../components/ui/EmptyState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import { buildAnalytics } from "../utils/analytics";

function DashboardPage() {
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
    <div className="space-y-3">
      <AnalyticsCharts analytics={buildAnalytics(trades)} />
    </div>
  );
}

export default DashboardPage;
