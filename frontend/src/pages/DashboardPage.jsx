import { useEffect, useState } from "react";
import AnalyticsCharts from "../components/AnalyticsCharts";
import EmptyState from "../components/ui/EmptyState";
import tradeService from "../services/tradeService";
import { buildAnalytics } from "../utils/analytics";

function DashboardPage() {
  const [trades, setTrades] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadTrades() {
      try {
        const data = await tradeService.getTrades();
        if (active) {
          setTrades(data);
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTrades();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="text-sm text-mist">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</div>;
  }

  if (trades.length === 0) {
    return (
      <EmptyState
        title="No trades yet"
        description="Once you add or import trades, your equity curve, P&L, and win rate will show up here."
      />
    );
  }

  return <AnalyticsCharts analytics={buildAnalytics(trades)} />;
}

export default DashboardPage;
