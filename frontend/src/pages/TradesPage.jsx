import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Filters from "../components/Filters";
import TradeForm from "../components/TradeForm";
import TradeDetailModal from "../components/TradeDetailModal";
import TradeTable from "../components/TradeTable";
import UploadCSV from "../components/UploadCSV";
import TradeTextImport from "../components/TradeTextImport";
import tradeService from "../services/tradeService";

const initialFilters = {
  symbol: "",
  side: "",
  strategy: "",
  from: "",
  to: ""
};

function TradesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trades, setTrades] = useState(() => tradeService.peekTrades(initialFilters) || []);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [activeTradeId, setActiveTradeId] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => !tradeService.peekTrades(initialFilters));
  const isImportMode = searchParams.get("mode") === "import";

  async function loadTrades(activeFilters = filters) {
    if (!tradeService.peekTrades(activeFilters) && trades.length === 0) {
      setLoading(true);
    }
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
  const activeTrade = useMemo(
    () => trades.find((trade) => trade.id === activeTradeId) ?? null,
    [activeTradeId, trades]
  );

  useEffect(() => {
    if (activeTradeId && !activeTrade) {
      setActiveTradeId(null);
    }
  }, [activeTrade, activeTradeId]);

  useEffect(() => {
    if (selectedTrade && !isImportMode) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("mode", "import");
      setSearchParams(nextParams, { replace: true });
    }
  }, [selectedTrade, isImportMode, searchParams, setSearchParams]);

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
      if (!selectedTrade) {
        setSearchParams({}, { replace: true });
      }
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
      if (activeTradeId === trade.id) {
        setActiveTradeId(null);
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

  async function handleTextImport(text) {
    setIsUploading(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.importTradesFromText(text);
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

  async function handleDeleteAll() {
    const confirmed = window.confirm("Delete all of your trades? This cannot be undone.");

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.deleteAllTrades();
      setSelectedTrade(null);
      setActiveTradeId(null);
      setMessage(`Deleted ${result.deletedCount} trades.`);
      await loadTrades(initialFilters);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {isImportMode && (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
            <Card title={title}>
              <TradeForm
                trade={selectedTrade}
                onSubmit={handleSubmit}
                onCancel={() => {
                  setSelectedTrade(null);
                  setSearchParams({}, { replace: true });
                }}
                isSubmitting={isSubmitting}
              />
            </Card>

            <Card title="CSV IMPORT">
              <UploadCSV onUpload={handleUpload} isUploading={isUploading} />
              <div className="ui-notice mt-4 border-dashed border-white/15 text-white/72">
                Supported CSVs: <span className="text-phosphor">app format and broker exports with Open Datetime / Entry Price / Exit Price columns</span>
                <br />
                Normalized format: <span className="text-phosphor">symbol, side, quantity, entryPrice, entryDate, exitPrice, exitDate, fees, strategy, notes</span>
              </div>
            </Card>
          </div>

          <Card title="TEXT IMPORT">
            <TradeTextImport onImport={handleTextImport} isImporting={isUploading} />
          </Card>
        </>
      )}

      {message && <div className="ui-notice">{message}</div>}
      {error && <div className="ui-notice border-coral/30 bg-[#2a1111] text-coral">{error}</div>}

      <Card
        title="TRADE HISTORY"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setSearchParams(isImportMode ? {} : { mode: "import" }, { replace: true })
              }
              className="ui-button-solid text-sm"
            >
              {isImportMode ? "Close Import" : "Import Trades"}
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={loading || trades.length === 0}
              className="ui-button border-coral/25 bg-coral/10 text-coral"
            >
              Delete All Trades
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-5">
          <Filters filters={filters} onChange={handleFilterChange} onReset={handleResetFilters} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleApplyFilters}
              className="ui-button-solid text-sm"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-mist">Loading trades...</div>
        ) : trades.length === 0 ? (
          <EmptyState
            title="No matching trades"
            description="Try relaxing your filters or open Import Trades to bring history into the journal."
          />
        ) : (
          <TradeTable
            trades={trades}
            onEdit={setSelectedTrade}
            onDelete={handleDelete}
            onSelectTrade={(trade) => setActiveTradeId(trade.id)}
          />
        )}
      </Card>

      {activeTrade && <TradeDetailModal trade={activeTrade} onClose={() => setActiveTradeId(null)} />}
    </div>
  );
}

export default TradesPage;
