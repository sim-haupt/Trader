import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Filters from "../components/Filters";
import TradeForm from "../components/TradeForm";
import TradeTable from "../components/TradeTable";
import UploadCSV from "../components/UploadCSV";
import TradeTextImport from "../components/TradeTextImport";
import CustomSelect from "../components/ui/CustomSelect";
import LoadingState from "../components/ui/LoadingState";
import tagService from "../services/tagService";
import strategyService from "../services/strategyService";
import tradeService from "../services/tradeService";
import { useNotifications } from "../context/NotificationContext";

const initialFilters = {
  symbol: "",
  tag: "",
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
  const navigate = useNavigate();
  const { notify, confirm } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();
  const [trades, setTrades] = useState(() => tradeService.peekTrades(initialFilters) || []);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkTags, setBulkTags] = useState("");
  const [bulkTagsMode, setBulkTagsMode] = useState("append");
  const [availableTags, setAvailableTags] = useState(() => tagService.peekTags() || []);
  const [availableStrategies, setAvailableStrategies] = useState(
    () => strategyService.peekStrategies() || []
  );
  const [bulkStrategy, setBulkStrategy] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
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
    let cancelled = false;

    async function loadStrategies() {
      try {
        const strategies = await strategyService.getStrategies();

        if (!cancelled) {
          setAvailableStrategies(strategies);
        }
      } catch {
        if (!cancelled) {
          setAvailableStrategies([]);
        }
      }
    }

    loadStrategies();

    return () => {
      cancelled = true;
    };
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
    setCurrentPage(1);
  }, [filters.symbol, filters.tag, filters.side, filters.strategy, filters.from, filters.to, pageSize]);

  useEffect(() => {
    loadTrades(filters);
  }, [filters]);

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
    setBulkStrategy("");
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

  async function handleResetFilters() {
    setFilters(initialFilters);
  }

  async function handleSubmit(payload) {
    setIsSubmitting(true);
    setError("");

    try {
      if (selectedTrade) {
        await tradeService.updateTrade(selectedTrade.id, payload);
        notify({ title: "Trade updated", description: `${payload.symbol || selectedTrade.symbol} was updated.`, tone: "success" });
      } else {
        await tradeService.createTrade(payload);
        notify({ title: "Trade created", description: `${payload.symbol} was added to your journal.`, tone: "success" });
      }

      setSelectedTrade(null);
      if (!selectedTrade) {
        setSearchParams({}, { replace: true });
      }
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not save trade", description: err.message, tone: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(trade) {
    const confirmed = await confirm({
      title: "Delete trade?",
      description: `${trade.symbol} will be removed from your trade history.`,
      confirmLabel: "Delete Trade",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setError("");

    try {
      await tradeService.deleteTrade(trade.id);
      notify({ title: "Trade deleted", description: `${trade.symbol} was removed.`, tone: "success" });
      if (selectedTrade?.id === trade.id) {
        setSelectedTrade(null);
      }
      setSelectedIds((current) => current.filter((id) => id !== trade.id));
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete trade", description: err.message, tone: "error" });
    }
  }

  async function handleBulkUpdate() {
    const trimmedTags = bulkTags.trim();

    if (selectedIds.length === 0) {
      setError("Select at least one trade first.");
      notify({ title: "No trades selected", description: "Select at least one trade first.", tone: "warning" });
      return;
    }

    if (!trimmedTags && !bulkStrategy) {
      setError("Select tags or a strategy before applying bulk changes.");
      notify({
        title: "Nothing to apply",
        description: "Choose tags or a strategy before applying bulk changes.",
        tone: "warning"
      });
      return;
    }

    setIsBulkSaving(true);
    setError("");

    try {
      const result = await tradeService.bulkUpdateTrades({
        tradeIds: selectedIds,
        tags: trimmedTags,
        tagsMode: bulkTagsMode,
        strategy: bulkStrategy || undefined
      });

      notify({
        title: "Trades updated",
        description: `Updated ${result.updatedCount} selected ${result.updatedCount === 1 ? "trade" : "trades"}.`,
        tone: "success"
      });
      clearSelection();
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not update trades", description: err.message, tone: "error" });
    } finally {
      setIsBulkSaving(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      setError("Select at least one trade first.");
      notify({ title: "No trades selected", description: "Select at least one trade first.", tone: "warning" });
      return;
    }

    const confirmed = await confirm({
      title: "Delete selected trades?",
      description: `This will permanently remove ${selectedIds.length} selected ${
        selectedIds.length === 1 ? "trade" : "trades"
      }.`,
      confirmLabel: "Delete Selected",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setIsBulkDeleting(true);
    setError("");

    try {
      const result = await tradeService.bulkDeleteTrades(selectedIds);

      if (selectedTrade && selectedIds.includes(selectedTrade.id)) {
        setSelectedTrade(null);
      }

      notify({
        title: "Trades deleted",
        description: `Deleted ${result.deletedCount} selected ${
          result.deletedCount === 1 ? "trade" : "trades"
        }.`,
        tone: "success"
      });
      clearSelection();
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete selected trades", description: err.message, tone: "error" });
    } finally {
      setIsBulkDeleting(false);
    }
  }

  async function handleUpload(file) {
    setIsUploading(true);
    setError("");

    try {
      const result = await tradeService.importTrades(file);
      notify({
        title: "CSV import complete",
        description: `Imported ${result.insertedCount} trades${
          result.errorCount ? ` with ${result.errorCount} row errors` : ""
        }.`,
        tone: result.errorCount ? "warning" : "success"
      });
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
      notify({ title: "CSV import failed", description: err.message, tone: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleTextImport(text) {
    setIsUploading(true);
    setError("");

    try {
      const result = await tradeService.importTradesFromText(text);
      notify({
        title: "Text import complete",
        description: `Imported ${result.insertedCount} trades${
          result.errorCount ? ` with ${result.errorCount} row errors` : ""
        }.`,
        tone: result.errorCount ? "warning" : "success"
      });
      await loadTrades(filters);
    } catch (err) {
      setError(err.message);
      notify({ title: "Text import failed", description: err.message, tone: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteAll() {
    const confirmed = await confirm({
      title: "Delete all trades?",
      description: "This will permanently remove all of your trades. This action cannot be undone.",
      confirmLabel: "Delete All",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await tradeService.deleteAllTrades();
      setSelectedTrade(null);
      clearSelection();
      notify({
        title: "All trades deleted",
        description: `Deleted ${result.deletedCount} ${result.deletedCount === 1 ? "trade" : "trades"}.`,
        tone: "success"
      });
      await loadTrades(initialFilters);
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete all trades", description: err.message, tone: "error" });
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
          <div className="grid items-stretch gap-6 xl:grid-cols-[1.05fr_1.35fr]">
            <div className="flex h-full flex-col gap-6">
              <Card title="CSV IMPORT" className="flex-1" bodyClassName="flex h-full flex-col">
                <UploadCSV onUpload={handleUpload} isUploading={isUploading} />
                <div className="ui-notice mt-4 border-dashed border-[#e5e7eb42] text-white/72">
                  Supported CSVs: <span className="text-phosphor">app format and broker exports with Open Datetime / Entry Price / Exit Price columns</span>
                  <br />
                  Normalized format: <span className="text-phosphor">symbol, side, quantity, entryPrice, entryDate, exitPrice, exitDate, fees, strategy, notes</span>
                </div>
              </Card>

              <Card title="TEXT IMPORT" className="flex-1" bodyClassName="flex h-full flex-col">
                <TradeTextImport onImport={handleTextImport} isImporting={isUploading} />
              </Card>
            </div>

            <Card title={title} className="h-full" bodyClassName="flex h-full flex-col">
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
          </div>
        </>
      )}

      {error && <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>}

      {!isImportMode ? (
        <Card
          title="TRADE HISTORY"
          className="relative overflow-visible"
          bodyClassName="overflow-visible"
          action={
            <div className="flex flex-wrap items-center gap-3">
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
      <div className="relative z-20 pb-14">
            <Filters
              filters={filters}
              onChange={handleFilterChange}
              onReset={handleResetFilters}
              strategies={availableStrategies}
              tags={availableTags}
            />
          </div>

          {loading ? (
            <LoadingState label="Loading trades..." className="min-h-[240px]" />
          ) : trades.length === 0 ? (
            <EmptyState
              title="No matching trades"
              description="Try relaxing your filters or add more trade history."
            />
          ) : (
            <div className="relative z-0 space-y-4">
              {selectedIds.length > 0 && (
                <div className="ui-panel p-5 shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="ui-chip rounded-[6px] px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white/80">
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
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
                          Strategy
                        </div>
                        {bulkStrategy ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setBulkStrategy("")}
                              className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--line)] bg-black px-3 py-1.5 text-xs text-white/82"
                            >
                              <span>{bulkStrategy}</span>
                              <span className="text-white/48">x</span>
                            </button>
                          </div>
                        ) : (
                          <div className="ui-surface-subtle px-4 py-3 text-sm text-white/48">
                            No strategy selected
                          </div>
                        )}

                        {availableStrategies.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {availableStrategies
                              .filter((strategy) => strategy.name !== bulkStrategy)
                              .map((strategy) => (
                                <button
                                  key={strategy.id}
                                  type="button"
                                  onClick={() => setBulkStrategy(strategy.name)}
                                  className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-1.5 text-xs font-medium text-white/78 transition hover:border-white/20 hover:bg-[#1f1f1f] hover:text-white"
                                >
                                  {strategy.name}
                                </button>
                              ))}
                          </div>
                        ) : (
                          <div className="text-xs text-white/48">
                            No saved strategies available. Add them from Settings.
                          </div>
                        )}
                      </div>

                      {selectedBulkTags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedBulkTags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => removeBulkTag(tag)}
                              className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--line)] bg-black px-3 py-1.5 text-xs font-medium text-white/88 transition hover:bg-[#1f1f1f]"
                            >
                              <span>{tag}</span>
                              <span className="text-white/45">×</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="ui-surface-subtle px-4 py-3 text-sm text-white/48">
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
                              className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-1.5 text-xs font-medium text-white/78 transition hover:border-white/20 hover:bg-[#1f1f1f] hover:text-white"
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

                    <div className="ui-surface-subtle flex h-full flex-col justify-between gap-4 p-4">
                      <div className="space-y-4">
                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
                            Tag Action
                          </div>
                          <div className="ui-segment grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setBulkTagsMode("append")}
                              data-active={bulkTagsMode === "append"}
                            >
                              Append Tags
                            </button>
                            <button
                              type="button"
                              onClick={() => setBulkTagsMode("replace")}
                              data-active={bulkTagsMode === "replace"}
                            >
                              Replace Tags
                            </button>
                          </div>
                        </div>

                        <div className="rounded-[6px] border border-[var(--line)] bg-black px-4 py-3 text-sm leading-6 text-white/68">
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
                          className="w-full rounded-[6px] border border-coral/35 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral transition hover:bg-coral/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBulkDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <TradeTable
                trades={paginatedTrades}
                onEdit={setSelectedTrade}
                onDelete={handleDelete}
                onSelectTrade={(trade) => navigate(`/trades/${trade.id}`, { state: { trade } })}
                selectedIds={selectedIds}
                onToggleSelection={handleToggleSelection}
                onToggleAll={handleToggleAll}
              />

              <div className="ui-surface-subtle flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-white/62">
                  Showing{" "}
                  <span className="font-semibold text-white">
                    {paginatedTrades.length === 0 ? 0 : pageSize === "all" ? 1 : (currentPage - 1) * pageSize + 1}
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
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}

export default TradesPage;
