import { useEffect, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Filters from "../components/Filters";
import TradeForm from "../components/TradeForm";
import TradeTable from "../components/TradeTable";
import UploadCSV from "../components/UploadCSV";
import tradeService from "../services/tradeService";

const initialFilters = {
  symbol: "",
  side: "",
  strategy: "",
  from: "",
  to: ""
};

function TradesPage() {
  const [trades, setTrades] = useState([]);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadTrades(activeFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const cleanedFilters = Object.fromEntries(
        Object.entries(activeFilters).filter(([, value]) => value)
      );
      const data = await tradeService.getTrades(cleanedFilters);
      setTrades(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();
  }, []);

  const title = useMemo(
    () => (selectedTrade ? `Editing ${selectedTrade.symbol}` : "Add a new trade"),
    [selectedTrade]
  );

  function handleFilterChange(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleApplyFilters() {
    await loadTrades(filters);
  }

  async function handleResetFilters() {
    setFilters(initialFilters);
    await loadTrades(initialFilters);
  }

  async function handleSubmit(payload) {
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      if (selectedTrade) {
        await tradeService.updateTrade(selectedTrade.id, payload);
        setMessage("Trade updated successfully.");
      } else {
        await tradeService.createTrade(payload);
        setMessage("Trade created successfully.");
      }

      setSelectedTrade(null);
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(trade) {
    const confirmed = window.confirm(`Delete trade for ${trade.symbol}?`);

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await tradeService.deleteTrade(trade.id);
      setMessage("Trade deleted successfully.");
      if (selectedTrade?.id === trade.id) {
        setSelectedTrade(null);
      }
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpload(file) {
    setIsUploading(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.importTrades(file);
      setMessage(
        `Imported ${result.insertedCount} trades${result.errorCount ? ` with ${result.errorCount} row errors` : ""}.`
      );
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Trade Workspace"
        subtitle="Capture your executions manually or bulk import broker exports."
      >
        <div className="space-y-4">
          <Filters filters={filters} onChange={handleFilterChange} onReset={handleResetFilters} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleApplyFilters}
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-200"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <Card title={title} subtitle="Keep each trade rich enough to be reviewable later.">
          <TradeForm
            trade={selectedTrade}
            onSubmit={handleSubmit}
            onCancel={() => setSelectedTrade(null)}
            isSubmitting={isSubmitting}
          />
        </Card>

        <Card title="CSV Import" subtitle="Import a broker export with one drag-and-drop style action.">
          <UploadCSV onUpload={handleUpload} isUploading={isUploading} />
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-4 text-sm text-mist">
            Required columns: <span className="text-white">symbol, side, quantity, entryPrice, entryDate</span>
            <br />
            Optional columns: <span className="text-white">exitPrice, exitDate, fees, strategy, notes</span>
          </div>
        </Card>
      </div>

      {message && <div className="rounded-2xl bg-mint/10 px-4 py-3 text-sm text-mint">{message}</div>}
      {error && <div className="rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</div>}

      <Card title="Trade History" subtitle="A searchable ledger of your recent executions.">
        {loading ? (
          <div className="text-sm text-mist">Loading trades...</div>
        ) : trades.length === 0 ? (
          <EmptyState
            title="No matching trades"
            description="Try relaxing your filters or create your first trade from the form above."
          />
        ) : (
          <TradeTable trades={trades} onEdit={setSelectedTrade} onDelete={handleDelete} />
        )}
      </Card>
    </div>
  );
}

export default TradesPage;
