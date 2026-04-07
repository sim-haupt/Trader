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
      <section className="ui-panel overflow-hidden">
        <div className="border-b border-white/10 bg-[linear-gradient(90deg,rgba(28,28,28,0.95),rgba(18,18,18,0.9),rgba(10,10,10,0.88))] px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="ui-title text-xs uppercase text-[#ffc14d]">TRADE DECK</p>
              <h2 className="ui-title mt-3 text-2xl uppercase text-white">
                {isImportMode ? "Import / Entry Console" : "Execution Ledger"}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-white/80">
                {isImportMode
                  ? "Bring in broker exports, paste raw fills, or capture a manual trade in one focused workspace."
                  : "Review the journal, inspect executions, and move into import mode only when you actually need to add data."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px] xl:grid-cols-3">
              <div className="ui-panel px-4 py-4">
                <p className="ui-title text-xs uppercase text-[#ffc14d]">VISIBLE TRADES</p>
                <p className="mt-3 text-3xl font-semibold text-white">{trades.length}</p>
              </div>
              <div className="ui-panel px-4 py-4">
                <p className="ui-title text-xs uppercase text-[#ffc14d]">MODE</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {isImportMode ? "Import" : "Review"}
                </p>
              </div>
              <div className="ui-panel px-4 py-4">
                <p className="ui-title text-xs uppercase text-[#ffc14d]">ACTIVE FILTER</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {filters.symbol || filters.strategy || filters.side ? "Scoped" : "All"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card
        title="TRADE WORKSPACE"
        action={
          <button
            type="button"
            onClick={() =>
              setSearchParams(isImportMode ? {} : { mode: "import" }, { replace: true })
            }
            className="ui-button-solid text-sm"
          >
            {isImportMode ? "Close Import" : "Import Trades"}
          </button>
        }
      >
        <div className="space-y-4">
          <Filters filters={filters} onChange={handleFilterChange} onReset={handleResetFilters} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <span className="ui-chip">Journal</span>
              <span className="ui-chip">Search</span>
              <span className="ui-chip">Replay</span>
            </div>
            <button
              type="button"
              onClick={handleApplyFilters}
              className="ui-button-solid text-sm"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </Card>

      {isImportMode && (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
            <Card
              title={title}
              className="bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(10,10,10,0.98))]"
            >
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

            <Card
              title="CSV IMPORT"
              className="bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(10,10,10,0.98))]"
            >
              <UploadCSV onUpload={handleUpload} isUploading={isUploading} />
              <div className="ui-notice mt-4 border-dashed border-[#3b334e] text-mist">
                Supported CSVs: <span className="text-phosphor">app format and broker exports with Open Datetime / Entry Price / Exit Price columns</span>
                <br />
                Normalized format: <span className="text-phosphor">symbol, side, quantity, entryPrice, entryDate, exitPrice, exitDate, fees, strategy, notes</span>
              </div>
            </Card>
          </div>

          <Card
            title="TEXT IMPORT"
            className="bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(10,10,10,0.98))]"
          >
            <TradeTextImport onImport={handleTextImport} isImporting={isUploading} />
          </Card>
        </>
      )}

      {message && <div className="ui-notice">{message}</div>}
      {error && <div className="ui-notice border-coral/30 bg-[#2a1111] text-coral">{error}</div>}

      <Card
        title="TRADE HISTORY"
        action={
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={loading || trades.length === 0}
            className="ui-button border-coral/35 bg-[linear-gradient(180deg,#452222,#2d1616)] text-coral hover:brightness-110"
          >
            Delete All Trades
          </button>
        }
      >
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
