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
import CustomSelect from "../components/ui/CustomSelect";
import tagService from "../services/tagService";
import tradeService from "../services/tradeService";

const initialFilters = {
  symbol: "",
  side: "",
  strategy: "",
  from: "",
  to: ""
};

const pageSizeOptions = [
  { label: "25", value: 25 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "All", value: "all" }
];

function TradesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trades, setTrades] = useState(() => tradeService.peekTrades(initialFilters) || []);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [activeTradeId, setActiveTradeId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkTags, setBulkTags] = useState("");
  const [bulkTagsMode, setBulkTagsMode] = useState("append");
  const [availableTags, setAvailableTags] = useState(() => tagService.peekTags() || []);
  const [filters, setFilters] = useState(initialFilters);
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
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
      setSelectedIds((current) => current.filter((id) => data.some((trade) => trade.id === id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTags() {
      try {
        const tags = await tagService.getTags();

        if (!cancelled) {
          setAvailableTags(tags);
        }
      } catch {
        if (!cancelled) {
          setAvailableTags([]);
        }
      }
    }

    loadTags();

    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(
    () => (selectedTrade ? `Editing ${selectedTrade.symbol}` : "Add a new trade"),
    [selectedTrade]
  );
  const activeTrade = useMemo(
    () => trades.find((trade) => trade.id === activeTradeId) ?? null,
    [activeTradeId, trades]
  );
  const totalPages = useMemo(() => {
    if (pageSize === "all") {
      return 1;
    }

    return Math.max(1, Math.ceil(trades.length / pageSize));
  }, [pageSize, trades.length]);
  const paginatedTrades = useMemo(() => {
    if (pageSize === "all") {
      return trades;
    }

    const startIndex = (currentPage - 1) * pageSize;
    return trades.slice(startIndex, startIndex + pageSize);
  }, [currentPage, pageSize, trades]);

  useEffect(() => {
    if (activeTradeId && !activeTrade) {
      setActiveTradeId(null);
    }
  }, [activeTrade, activeTradeId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.symbol, filters.side, filters.strategy, filters.from, filters.to, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const visibleIds = paginatedTrades.map((trade) => trade.id);

    setSelectedIds((current) => current.filter((id) => trades.some((trade) => trade.id === id)));

    if (visibleIds.length === 0) {
      setSelectedIds((current) => current.filter((id) => trades.some((trade) => trade.id === id)));
    }
  }, [paginatedTrades, trades]);

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

  function resetBulkForm() {
    setBulkTags("");
    setBulkTagsMode("append");
  }

  const selectedBulkTags = useMemo(
    () =>
      String(bulkTags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [bulkTags]
  );

  const selectableBulkTags = useMemo(() => {
    const current = new Set(selectedBulkTags.map((tag) => tag.toLowerCase()));

    return availableTags.filter((tag) => !current.has(tag.name.toLowerCase()));
  }, [availableTags, selectedBulkTags]);

  function addBulkTag(tagName) {
    setBulkTags((current) => {
      const tags = String(current || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      return [...new Set([...tags, tagName])].join(", ");
    });
  }

  function removeBulkTag(tagName) {
    setBulkTags((current) =>
      String(current || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag && tag !== tagName)
        .join(", ")
    );
  }

  function clearSelection() {
    setSelectedIds([]);
    resetBulkForm();
  }

  function handleToggleSelection(tradeId) {
    setSelectedIds((current) =>
      current.includes(tradeId)
        ? current.filter((id) => id !== tradeId)
        : [...current, tradeId]
    );
  }

  function handleToggleAll(visibleTrades, shouldSelectAll) {
    const visibleIds = visibleTrades.map((trade) => trade.id);

    setSelectedIds((current) => {
      if (shouldSelectAll) {
        return Array.from(new Set([...current, ...visibleIds]));
      }

      return current.filter((id) => !visibleIds.includes(id));
    });
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
      setSelectedIds((current) => current.filter((id) => id !== trade.id));
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleBulkUpdate() {
    const trimmedTags = bulkTags.trim();

    if (selectedIds.length === 0) {
      setError("Select at least one trade first.");
      return;
    }

    if (!trimmedTags) {
      setError("Add tags before applying bulk changes.");
      return;
    }

    setIsBulkSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.bulkUpdateTrades({
        tradeIds: selectedIds,
        tags: trimmedTags,
        tagsMode: bulkTagsMode
      });

      setMessage(`Updated ${result.updatedCount} trades.`);
      clearSelection();
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBulkSaving(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      setError("Select at least one trade first.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? "trade" : "trades"}?`
    );

    if (!confirmed) {
      return;
    }

    setIsBulkDeleting(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.bulkDeleteTrades(selectedIds);

      if (activeTradeId && selectedIds.includes(activeTradeId)) {
        setActiveTradeId(null);
      }

      if (selectedTrade && selectedIds.includes(selectedTrade.id)) {
        setSelectedTrade(null);
      }

      setMessage(`Deleted ${result.deletedCount} selected trades.`);
      clearSelection();
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBulkDeleting(false);
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
      clearSelection();
      setMessage(`Deleted ${result.deletedCount} trades.`);
      await loadTrades(initialFilters);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function handleExportTrades() {
    if (trades.length === 0) {
      return;
    }

    const headers = [
      "date",
      "symbol",
      "entry_price",
      "exit_price",
      "quantity",
      "gross_pnl",
      "net_pnl",
      "fees",
      "strategy",
      "tags",
      "notes"
    ];

    const escapeCsvValue = (value) => {
      if (value === null || value === undefined) {
        return "";
      }

      const stringValue = String(value);
      if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, "\"\"")}"`;
      }

      return stringValue;
    };

    const rows = trades.map((trade) => [
      trade.entryDate,
      trade.symbol,
      trade.entryPrice,
      trade.exitPrice ?? "",
      trade.quantity,
      trade.grossPnl ?? "",
      trade.netPnl ?? "",
      trade.fees ?? "",
      trade.strategy ?? "",
      trade.tags ?? "",
      trade.notes ?? ""
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trades-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
              <div className="ui-notice mt-4 border-dashed border-[#e5e7eb42] text-white/72">
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
        subtitle="Browse, filter, and review your trades. Click any row to open the full execution review."
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
            <button
              type="button"
              onClick={handleExportTrades}
              disabled={trades.length === 0}
              className="ui-button text-sm"
            >
              Export CSV
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
          <div className="space-y-4">
            {selectedIds.length > 0 && (
              <div className="rounded-[18px] border border-[#e5e7eb20] bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.012))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
                      {selectedIds.length} selected
                    </div>
                    <div className="text-sm text-white/56">
                      {selectedIds.length === 1 ? "1 trade ready for bulk actions" : `${selectedIds.length} trades ready for bulk actions`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="ui-button px-3 py-2 text-xs"
                  >
                    Clear Selection
                  </button>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(240px,0.9fr)]">
                  <div className="space-y-4">
                    {selectedBulkTags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedBulkTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => removeBulkTag(tag)}
                            className="inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/[0.08] px-3 py-1.5 text-xs font-medium text-white/88 transition hover:bg-mint/[0.14]"
                          >
                            <span>{tag}</span>
                            <span className="text-white/45">×</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[14px] border border-white/8 bg-black/10 px-4 py-3 text-sm text-white/48">
                        Choose one or more saved tags to apply to the selected trades.
                      </div>
                    )}

                    {selectableBulkTags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectableBulkTags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => addBulkTag(tag.name)}
                            className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-white/78 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                          >
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-white/48">
                        No saved tags available. Add them from Settings.
                      </div>
                    )}
                  </div>

                  <div className="flex h-full flex-col justify-between gap-4 rounded-[16px] border border-white/8 bg-black/10 p-4">
                    <div className="space-y-4">
                      <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
                          Tag Action
                        </div>
                        <div className="grid grid-cols-2 gap-2 rounded-[12px] border border-white/8 bg-white/[0.02] p-1">
                          <button
                            type="button"
                            onClick={() => setBulkTagsMode("append")}
                            className={`rounded-[10px] px-3 py-2 text-xs font-semibold transition ${
                              bulkTagsMode === "append"
                                ? "bg-white text-black"
                                : "text-white/68 hover:bg-white/[0.05] hover:text-white"
                            }`}
                          >
                            Append Tags
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkTagsMode("replace")}
                            className={`rounded-[10px] px-3 py-2 text-xs font-semibold transition ${
                              bulkTagsMode === "replace"
                                ? "bg-white text-black"
                                : "text-white/68 hover:bg-white/[0.05] hover:text-white"
                            }`}
                          >
                            Replace Tags
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[12px] border border-coral/15 bg-coral/[0.06] px-4 py-3 text-sm text-white/68">
                        Delete will permanently remove the selected trades.
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <button
                        type="button"
                        onClick={handleBulkUpdate}
                        disabled={isBulkSaving}
                        className="ui-button-solid w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBulkSaving ? "Saving..." : "Apply Tags"}
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkDelete}
                        disabled={isBulkDeleting}
                        className="w-full rounded-[12px] border border-coral/25 bg-coral/[0.08] px-4 py-3 text-sm font-semibold text-coral transition hover:bg-coral/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBulkDeleting ? "Deleting..." : "Delete Selected"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-[12px] border border-[#e5e7eb42] bg-white/[0.02] px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-white/62">
                Showing{" "}
                <span className="font-semibold text-white">
                  {paginatedTrades.length === 0 ? 0 : (pageSize === "all" ? 1 : (currentPage - 1) * pageSize + 1)}
                </span>
                {" "}to{" "}
                <span className="font-semibold text-white">
                  {pageSize === "all" ? trades.length : Math.min(currentPage * pageSize, trades.length)}
                </span>
                {" "}of <span className="font-semibold text-white">{trades.length}</span> trades
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-white/62">
                  <span>Rows</span>
                  <CustomSelect
                    value={pageSize}
                    onChange={(nextValue) =>
                      setPageSize(nextValue === "all" ? "all" : Number(nextValue))
                    }
                    options={pageSizeOptions}
                    className="min-w-[92px]"
                    buttonClassName="!w-[92px] !px-3 !py-2 text-sm"
                    menuClassName="min-w-[92px]"
                    align="right"
                  />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={pageSize === "all" || currentPage === 1}
                    className="ui-button text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <div className="ui-chip text-xs">
                    Page {pageSize === "all" ? 1 : currentPage} / {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={pageSize === "all" || currentPage === totalPages}
                    className="ui-button text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            <TradeTable
              trades={paginatedTrades}
              onEdit={setSelectedTrade}
              onDelete={handleDelete}
              onSelectTrade={(trade) => setActiveTradeId(trade.id)}
              selectedIds={selectedIds}
              onToggleSelection={handleToggleSelection}
              onToggleAll={handleToggleAll}
            />
          </div>
        )}
      </Card>

      {activeTrade && <TradeDetailModal trade={activeTrade} onClose={() => setActiveTradeId(null)} />}
    </div>
  );
}

export default TradesPage;
