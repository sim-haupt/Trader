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
import journalService from "../services/journalService";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { formatDateTimeLocal } from "../utils/formatters";
import {
  getEffectiveTradeCommission,
  getTradeFeeDisplayValue,
  getTradeGrossPnl,
  getTradeNetPnl,
  getTradeTotalCostDisplayValue
} from "../utils/tradePnl";

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

function getDayKey(value) {
  const formatted = formatDateTimeLocal(value);
  return formatted ? formatted.slice(0, 10) : "";
}

function TradesPage() {
  const { user } = useAuth();
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
  const [isExporting, setIsExporting] = useState(false);
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
  }, [filters, user?.activeAccountScope]);

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

  async function handleUpload(file, csvFormat) {
    setIsUploading(true);
    setError("");

    try {
      const result = await tradeService.importTrades(file, csvFormat);
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

  async function handleExportTrades() {
    setIsExporting(true);

    try {
      const cleanedFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const exportTrades = await tradeService.getTrades(cleanedFilters, { forceRefresh: true });

      if (exportTrades.length === 0) {
        notify({
          title: "No trades to export",
          description: "There are no trades in the selected range.",
          tone: "info"
        });
        return;
      }

      const dayKeys = [
        ...new Set(exportTrades.map((trade) => getDayKey(trade.entryDate)).filter(Boolean))
      ];
      const [fxRatesByDay, journalDays] = await Promise.all([
        journalService.getUsdEurRates(dayKeys),
        journalService.getJournalDays({ forceRefresh: true })
      ]);
      const journalDaysByKey = new Map(journalDays.map((day) => [day.dayKey, day]));
      const dailyTotals = new Map();
      const tradesByDay = new Map();

      for (const trade of exportTrades) {
        const dayKey = getDayKey(trade.entryDate);
        const grossPnl = getTradeGrossPnl(trade);
        const commissions = getEffectiveTradeCommission(trade);
        const fees = getTradeFeeDisplayValue(trade);
        const costs = getTradeTotalCostDisplayValue(trade);
        const netPnl = getTradeNetPnl(trade);
        const rate = Number(fxRatesByDay[dayKey]?.rate);
        const hasRate = Number.isFinite(rate);
        const current = dailyTotals.get(dayKey) || {
          grossPnlUsd: 0,
          netPnlUsd: 0,
          commissionsUsd: 0,
          feesUsd: 0,
          secFeeUsd: 0,
          finraFeeUsd: 0,
          costsUsd: 0,
          grossPnlEur: 0,
          netPnlEur: 0,
          commissionsEur: 0,
          feesEur: 0,
          secFeeEur: 0,
          finraFeeEur: 0,
          costsEur: 0
        };

        current.grossPnlUsd += grossPnl;
        current.netPnlUsd += netPnl;
        current.commissionsUsd += commissions;
        current.feesUsd += fees;
        current.costsUsd += costs;
        current.grossPnlEur += hasRate ? grossPnl * rate : 0;
        current.netPnlEur += hasRate ? netPnl * rate : 0;
        current.commissionsEur += hasRate ? commissions * rate : 0;
        current.feesEur += hasRate ? fees * rate : 0;
        current.costsEur += hasRate ? costs * rate : 0;
        dailyTotals.set(dayKey, current);

        if (!tradesByDay.has(dayKey)) {
          tradesByDay.set(dayKey, []);
        }

        tradesByDay.get(dayKey).push(trade);
      }

      for (const dayKey of dayKeys) {
        const totals = dailyTotals.get(dayKey);

        if (!totals) {
          continue;
        }

        const fxRate = Number(fxRatesByDay[dayKey]?.rate);
        const hasRate = Number.isFinite(fxRate);
        const journalDay = journalDaysByKey.get(dayKey);
        const secFee = Number(journalDay?.secFee || 0);
        const finraFee = Number(journalDay?.finraFee || 0);

        totals.secFeeUsd = secFee;
        totals.finraFeeUsd = finraFee;
        totals.costsUsd += secFee + finraFee;
        totals.netPnlUsd -= secFee + finraFee;
        totals.secFeeEur = hasRate ? secFee * fxRate : 0;
        totals.finraFeeEur = hasRate ? finraFee * fxRate : 0;
        totals.costsEur += hasRate ? (secFee + finraFee) * fxRate : 0;
        totals.netPnlEur -= hasRate ? (secFee + finraFee) * fxRate : 0;
      }

      const columns = [
        "row_type",
        "date",
        "symbol",
        "side",
        "quantity",
        "entry_price",
        "exit_price",
        "entry_date",
        "exit_date",
        "executions",
        "strategy",
        "tags",
        "gross_pnl_usd",
        "commissions_usd",
        "trade_fees_usd",
        "sec_fee_usd",
        "finra_fee_usd",
        "total_costs_usd",
        "net_pnl_usd",
        "usd_eur_fx_rate",
        "fx_rate_date",
        "gross_pnl_eur",
        "commissions_eur",
        "trade_fees_eur",
        "sec_fee_eur",
        "finra_fee_eur",
        "total_costs_eur",
        "net_pnl_eur",
        "day_total_gross_pnl_usd",
        "day_total_commissions_usd",
        "day_total_trade_fees_usd",
        "day_total_sec_fee_usd",
        "day_total_finra_fee_usd",
        "day_total_costs_usd",
        "day_total_net_pnl_usd",
        "day_total_gross_pnl_eur",
        "day_total_commissions_eur",
        "day_total_trade_fees_eur",
        "day_total_sec_fee_eur",
        "day_total_finra_fee_eur",
        "day_total_costs_eur",
        "day_total_net_pnl_eur",
        "notes"
      ];

      const formatCurrency = (value, decimals = 2) =>
        Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : "";
      const formatRate = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "");
      const formatRow = (row) => columns.map((column) => row[column] ?? "");

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

      const buildDayTotalFields = (dayKey) => {
        const totals = dailyTotals.get(dayKey);

        if (!totals) {
          return {};
        }

        return {
          day_total_gross_pnl_usd: formatCurrency(totals.grossPnlUsd),
          day_total_commissions_usd: formatCurrency(totals.commissionsUsd, 4),
          day_total_trade_fees_usd: formatCurrency(totals.feesUsd, 4),
          day_total_sec_fee_usd: formatCurrency(totals.secFeeUsd),
          day_total_finra_fee_usd: formatCurrency(totals.finraFeeUsd),
          day_total_costs_usd: formatCurrency(totals.costsUsd, 4),
          day_total_net_pnl_usd: formatCurrency(totals.netPnlUsd),
          day_total_gross_pnl_eur: formatCurrency(totals.grossPnlEur),
          day_total_commissions_eur: formatCurrency(totals.commissionsEur, 4),
          day_total_trade_fees_eur: formatCurrency(totals.feesEur, 4),
          day_total_sec_fee_eur: formatCurrency(totals.secFeeEur),
          day_total_finra_fee_eur: formatCurrency(totals.finraFeeEur),
          day_total_costs_eur: formatCurrency(totals.costsEur, 4),
          day_total_net_pnl_eur: formatCurrency(totals.netPnlEur)
        };
      };

      const rows = [];

      for (const [dayKey, dayTrades] of tradesByDay.entries()) {
        for (const trade of dayTrades) {
          const fxRate = Number(fxRatesByDay[dayKey]?.rate);
          const hasRate = Number.isFinite(fxRate);
          const grossPnl = getTradeGrossPnl(trade);
          const commissions = getEffectiveTradeCommission(trade);
          const fees = getTradeFeeDisplayValue(trade);
          const costs = getTradeTotalCostDisplayValue(trade);
          const netPnl = getTradeNetPnl(trade);

          rows.push(
            formatRow({
              row_type: "TRADE",
              date: dayKey,
              symbol: trade.symbol,
              side: trade.side,
              quantity: trade.quantity,
              entry_price: trade.entryPrice,
              exit_price: trade.exitPrice ?? "",
              entry_date: trade.entryDate,
              exit_date: trade.exitDate ?? "",
              executions: trade.reportedExecutionCount ?? trade.executions?.length ?? "",
              strategy: trade.strategy ?? "",
              tags: trade.tags ?? "",
              gross_pnl_usd: formatCurrency(grossPnl),
              commissions_usd: formatCurrency(commissions, 4),
              trade_fees_usd: formatCurrency(fees, 4),
              total_costs_usd: formatCurrency(costs, 4),
              net_pnl_usd: formatCurrency(netPnl),
              usd_eur_fx_rate: hasRate ? formatRate(fxRate) : "",
              fx_rate_date: fxRatesByDay[dayKey]?.rateDate ?? "",
              gross_pnl_eur: hasRate ? formatCurrency(grossPnl * fxRate) : "",
              commissions_eur: hasRate ? formatCurrency(commissions * fxRate, 4) : "",
              trade_fees_eur: hasRate ? formatCurrency(fees * fxRate, 4) : "",
              total_costs_eur: hasRate ? formatCurrency(costs * fxRate, 4) : "",
              net_pnl_eur: hasRate ? formatCurrency(netPnl * fxRate) : "",
              ...buildDayTotalFields(dayKey),
              notes: trade.notes ?? ""
            })
          );
        }

        const totals = dailyTotals.get(dayKey);
        rows.push(
          formatRow({
            row_type: "DAY TOTAL",
            date: dayKey,
            gross_pnl_usd: formatCurrency(totals.grossPnlUsd),
            commissions_usd: formatCurrency(totals.commissionsUsd, 4),
            trade_fees_usd: formatCurrency(totals.feesUsd, 4),
            sec_fee_usd: formatCurrency(totals.secFeeUsd),
            finra_fee_usd: formatCurrency(totals.finraFeeUsd),
            total_costs_usd: formatCurrency(totals.costsUsd, 4),
            net_pnl_usd: formatCurrency(totals.netPnlUsd),
            gross_pnl_eur: formatCurrency(totals.grossPnlEur),
            commissions_eur: formatCurrency(totals.commissionsEur, 4),
            trade_fees_eur: formatCurrency(totals.feesEur, 4),
            sec_fee_eur: formatCurrency(totals.secFeeEur),
            finra_fee_eur: formatCurrency(totals.finraFeeEur),
            total_costs_eur: formatCurrency(totals.costsEur, 4),
            net_pnl_eur: formatCurrency(totals.netPnlEur),
            ...buildDayTotalFields(dayKey)
          })
        );
      }

      const exportTotals = [...dailyTotals.values()].reduce(
        (totals, day) => ({
          grossPnlUsd: totals.grossPnlUsd + day.grossPnlUsd,
          netPnlUsd: totals.netPnlUsd + day.netPnlUsd,
          commissionsUsd: totals.commissionsUsd + day.commissionsUsd,
          feesUsd: totals.feesUsd + day.feesUsd,
          secFeeUsd: totals.secFeeUsd + day.secFeeUsd,
          finraFeeUsd: totals.finraFeeUsd + day.finraFeeUsd,
          costsUsd: totals.costsUsd + day.costsUsd,
          grossPnlEur: totals.grossPnlEur + day.grossPnlEur,
          netPnlEur: totals.netPnlEur + day.netPnlEur,
          commissionsEur: totals.commissionsEur + day.commissionsEur,
          feesEur: totals.feesEur + day.feesEur,
          secFeeEur: totals.secFeeEur + day.secFeeEur,
          finraFeeEur: totals.finraFeeEur + day.finraFeeEur,
          costsEur: totals.costsEur + day.costsEur
        }),
        {
          grossPnlUsd: 0,
          netPnlUsd: 0,
          commissionsUsd: 0,
          feesUsd: 0,
          secFeeUsd: 0,
          finraFeeUsd: 0,
          costsUsd: 0,
          grossPnlEur: 0,
          netPnlEur: 0,
          commissionsEur: 0,
          feesEur: 0,
          secFeeEur: 0,
          finraFeeEur: 0,
          costsEur: 0
        }
      );

      rows.push(
        formatRow({
          row_type: "EXPORT TOTAL",
          gross_pnl_usd: formatCurrency(exportTotals.grossPnlUsd),
          commissions_usd: formatCurrency(exportTotals.commissionsUsd, 4),
          trade_fees_usd: formatCurrency(exportTotals.feesUsd, 4),
          sec_fee_usd: formatCurrency(exportTotals.secFeeUsd),
          finra_fee_usd: formatCurrency(exportTotals.finraFeeUsd),
          total_costs_usd: formatCurrency(exportTotals.costsUsd, 4),
          net_pnl_usd: formatCurrency(exportTotals.netPnlUsd),
          gross_pnl_eur: formatCurrency(exportTotals.grossPnlEur),
          commissions_eur: formatCurrency(exportTotals.commissionsEur, 4),
          trade_fees_eur: formatCurrency(exportTotals.feesEur, 4),
          sec_fee_eur: formatCurrency(exportTotals.secFeeEur),
          finra_fee_eur: formatCurrency(exportTotals.finraFeeEur),
          total_costs_eur: formatCurrency(exportTotals.costsEur, 4),
          net_pnl_eur: formatCurrency(exportTotals.netPnlEur)
        })
      );

      const csvContent = [columns, ...rows]
        .map((row) => row.map(escapeCsvValue).join(","))
        .join("\n");

      const rangeLabel =
        cleanedFilters.from || cleanedFilters.to
          ? `${cleanedFilters.from || "start"}_to_${cleanedFilters.to || "end"}`
          : "all";
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `trades-export-${rangeLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify({ title: "Could not export trades", description: err.message, tone: "error" });
    } finally {
      setIsExporting(false);
    }
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
                  Supported CSVs: <span className="text-phosphor">DAS Trader executions and Warrior Trading exports with Open Datetime / Entry Price / Exit Price columns</span>
                  <br />
                  Normalized format: <span className="text-phosphor">symbol, side, quantity, entryPrice, entryDate, exitPrice, exitDate, commissions, fees, strategy, notes</span>
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
                disabled={isExporting}
                className="ui-button-solid text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExporting ? "Exporting..." : "Export CSV"}
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
