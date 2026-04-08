import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "../components/ui/Card";
import CustomSelect from "../components/ui/CustomSelect";
import DateRangePicker from "../components/ui/DateRangePicker";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import RichTextEditor from "../components/ui/RichTextEditor";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import journalService from "../services/journalService";
import tagService from "../services/tagService";
import strategyService from "../services/strategyService";
import { formatCurrency, formatDateTimeLocal } from "../utils/formatters";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { getTradeFeeDisplayValue, getTradeNetPnl } from "../utils/tradePnl";

const PAGE_SIZE = 5;

function getDayKey(value) {
  const formatted = formatDateTimeLocal(value);
  return formatted ? formatted.slice(0, 10) : "";
}

function formatDayLabel(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatTimeLabel(value) {
  const formatted = formatDateTimeLocal(value);
  return formatted ? formatted.slice(11, 19) : "--:--:--";
}

function getTradeTags(trade) {
  return String(trade.tags || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTradePnl(trade, defaultCommission, defaultFees) {
  return getTradeNetPnl(trade, defaultCommission, defaultFees);
}

function matchesTradeFilters(trade, filters) {
  const symbol = String(trade.symbol || "").toUpperCase();
  const strategy = String(trade.strategy || "").trim();
  const side = String(trade.side || "").toUpperCase();
  const dayKey = getDayKey(trade.entryDate);
  const tags = getTradeTags(trade);

  if (filters.symbol && !symbol.includes(filters.symbol.trim().toUpperCase())) {
    return false;
  }

  if (filters.tag && !tags.some((tag) => tag.toLowerCase() === String(filters.tag).toLowerCase())) {
    return false;
  }

  if (filters.strategy && strategy !== filters.strategy) {
    return false;
  }

  if (filters.side && side !== filters.side) {
    return false;
  }

  if (filters.from && dayKey < filters.from) {
    return false;
  }

  if (filters.to && dayKey > filters.to) {
    return false;
  }

  return true;
}

function buildDailyJournal(trades, dayNotes, defaultCommission, defaultFees) {
  const grouped = new Map();

  for (const trade of trades) {
    const dayKey = getDayKey(trade.entryDate);

    if (!dayKey) {
      continue;
    }

    const pnl = buildTradePnl(trade, defaultCommission, defaultFees);
    const quantity = Number(trade.quantity || 0);
    const fees = getTradeFeeDisplayValue(trade, defaultCommission, defaultFees);
    const existing = grouped.get(dayKey) || {
      dayKey,
      label: formatDayLabel(dayKey),
      trades: [],
      totalTrades: 0,
      totalVolume: 0,
      totalFees: 0,
      totalPnl: 0,
      wins: 0,
      losses: 0
    };

    existing.trades.push({
      ...trade,
      dayPnl: pnl,
      entryTimeLabel: formatTimeLabel(trade.entryDate),
      execCount: trade.reportedExecutionCount ?? trade.executions?.length ?? 0,
      parsedTags: getTradeTags(trade)
    });
    existing.totalTrades += 1;
    existing.totalVolume += quantity;
    existing.totalFees += fees;
    existing.totalPnl += pnl;

    if (pnl > 0) {
      existing.wins += 1;
    } else if (pnl < 0) {
      existing.losses += 1;
    }

    grouped.set(dayKey, existing);
  }

  return [...grouped.values()]
    .map((day) => {
      const sortedTrades = [...day.trades].sort(
        (left, right) => new Date(left.entryDate).getTime() - new Date(right.entryDate).getTime()
      );
      let cumulative = 0;

      const chartData = sortedTrades.map((trade) => {
        cumulative += trade.dayPnl;

        return {
          label: trade.entryTimeLabel,
          cumulative: Number(cumulative.toFixed(2))
        };
      });

      return {
        ...day,
        trades: sortedTrades,
        chartData,
        totalPnl: Number(day.totalPnl.toFixed(2)),
        totalFees: Number(day.totalFees.toFixed(2)),
        winRate: day.totalTrades ? (day.wins / day.totalTrades) * 100 : 0,
        note: dayNotes.get(day.dayKey)?.notes || ""
      };
    })
    .sort((left, right) => right.dayKey.localeCompare(left.dayKey));
}

function JournalChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2 text-xs text-white">
      <div className="text-white/52">{label}</div>
      <div className="mt-1 font-medium text-white">{formatCurrency(payload[0].value)}</div>
    </div>
  );
}

function JournalDayCard({
  day,
  noteDraft,
  onNoteChange,
  onSaveNote,
  isSaving,
  onOpenTrade
}) {
  const positive = day.totalPnl > 0;
  const negative = day.totalPnl < 0;
  const winRateClass =
    day.winRate < 50 ? "text-coral" : day.winRate <= 65 ? "text-gold" : "text-mint";

  return (
    <Card
      title={day.label.toUpperCase()}
      action={
        <div
          className={`rounded-[6px] border px-3 py-2 text-sm font-semibold ${
            positive
              ? "border-mint/25 bg-mint/10 text-mint"
              : negative
                ? "border-coral/18 bg-[#1b1012] text-coral"
                : "border-[#e5e7eb42] bg-white/[0.05] text-mist"
          }`}
        >
          P&amp;L: {formatCurrency(day.totalPnl)}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="h-[180px] rounded-[6px] border border-[var(--line)] bg-black p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={day.chartData}>
                <defs>
                  <linearGradient id={`journal-${day.dayKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={positive ? "#5fd49b" : negative ? "#ff7b72" : "#aeb7c7"} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={positive ? "#5fd49b" : negative ? "#ff7b72" : "#aeb7c7"} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9aa4b7", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: "#9aa4b7", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<JournalChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={positive ? "#5fd49b" : negative ? "#ff7b72" : "#aeb7c7"}
                  strokeWidth={2.3}
                  fill={`url(#journal-${day.dayKey})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Total Trades</div>
              <div className="mt-2 text-2xl font-semibold text-white">{day.totalTrades}</div>
            </div>
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Win %</div>
              <div className={`mt-2 text-2xl font-semibold ${winRateClass}`}>{day.winRate.toFixed(1)}%</div>
            </div>
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Total Volume</div>
              <div className="mt-2 text-2xl font-semibold text-white">{Math.round(day.totalVolume).toLocaleString()}</div>
            </div>
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Commissions/Fees</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatCurrency(day.totalFees)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[6px] border border-[var(--line)] bg-black p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="ui-title text-[10px] text-white/56">Day Notes</div>
            <button
              type="button"
              onClick={() => onSaveNote(day.dayKey)}
              disabled={isSaving}
              className="ui-button-solid px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Notes"}
            </button>
          </div>
          <RichTextEditor
            value={noteDraft}
            onChange={(value) => onNoteChange(day.dayKey, value)}
            placeholder="Write your review, mistakes, strengths, and lessons from this trading day..."
            minHeight={180}
          />
        </div>

        <div className="ui-table-shell overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-white/56">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Volume</th>
                  <th className="px-4 py-3 font-medium">Execs</th>
                  <th className="px-4 py-3 font-medium">P&amp;L</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {day.trades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="cursor-pointer border-t border-[var(--line)] text-white/82 transition hover:bg-white/[0.03]"
                    onClick={() => onOpenTrade(trade.id)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">{trade.entryTimeLabel}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{trade.symbol}</div>
                      {trade.strategy ? <div className="mt-1 text-xs text-white/50">{trade.strategy}</div> : null}
                    </td>
                    <td className="px-4 py-3">{Math.round(Number(trade.quantity || 0)).toLocaleString()}</td>
                    <td className="px-4 py-3">{trade.execCount}</td>
                    <td className={`px-4 py-3 font-medium ${trade.dayPnl > 0 ? "text-mint" : trade.dayPnl < 0 ? "text-coral" : "text-white/70"}`}>
                      {formatCurrency(trade.dayPnl)}
                    </td>
                    <td className="px-4 py-3 text-white/54">
                      {trade.strategy ? trade.strategy : <span className="text-white/26">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {trade.parsedTags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {trade.parsedTags.map((tag) => (
                            <span key={`${trade.id}-${tag}`} className="ui-chip">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-white/26">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}

function JournalPage() {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDay = searchParams.get("day") || "";
  const [filters, setFilters] = useState({
    symbol: "",
    tag: "",
    strategy: "",
    side: "",
    from: selectedDay,
    to: selectedDay
  });
  const [page, setPage] = useState(1);
  const [draftNotes, setDraftNotes] = useState({});
  const [savingDayKey, setSavingDayKey] = useState("");

  const tradesResource = useCachedAsyncResource({
    peek: () => tradeService.peekAllTrades(),
    load: () => tradeService.getAllTrades(),
    initialValue: [],
    deps: []
  });

  const journalDaysResource = useCachedAsyncResource({
    peek: () => journalService.peekJournalDays(),
    load: () => journalService.getJournalDays(),
    initialValue: [],
    deps: []
  });

  const tagsResource = useCachedAsyncResource({
    peek: () => tagService.peekTags(),
    load: () => tagService.getTags(),
    initialValue: [],
    deps: []
  });

  const strategiesResource = useCachedAsyncResource({
    peek: () => strategyService.peekStrategies(),
    load: () => strategyService.getStrategies(),
    initialValue: [],
    deps: []
  });

  useEffect(() => {
    if (!selectedDay) {
      return;
    }

    setFilters((current) => ({
      ...current,
      from: selectedDay,
      to: selectedDay
    }));
    setPage(1);
  }, [selectedDay]);

  useEffect(() => {
    const nextDrafts = {};

    for (const day of journalDaysResource.data) {
      nextDrafts[day.dayKey] = day.notes || "";
    }

    setDraftNotes((current) => ({
      ...current,
      ...nextDrafts
    }));
  }, [journalDaysResource.data]);

  const sideOptions = useMemo(
    () => [
      { label: "All", value: "" },
      { label: "Long", value: "LONG" },
      { label: "Short", value: "SHORT" }
    ],
    []
  );

  const filteredTrades = useMemo(
    () => tradesResource.data.filter((trade) => matchesTradeFilters(trade, filters)),
    [tradesResource.data, filters]
  );

  const journalDays = useMemo(() => {
    const notesByDay = new Map(journalDaysResource.data.map((day) => [day.dayKey, day]));
    return buildDailyJournal(
      filteredTrades,
      notesByDay,
      user?.defaultCommission ?? 0,
      user?.defaultFees ?? 0
    );
  }, [filteredTrades, journalDaysResource.data, user?.defaultCommission, user?.defaultFees]);

  const totalPages = Math.max(1, Math.ceil(journalDays.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedDays = journalDays.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(journalDays.length / PAGE_SIZE))));
  }, [journalDays.length]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function handleResetFilters() {
    setFilters({
      symbol: "",
      tag: "",
      strategy: "",
      side: "",
      from: "",
      to: ""
    });
    setSearchParams({});
    setPage(1);
  }

  function handleNotesChange(dayKey, value) {
    setDraftNotes((current) => ({
      ...current,
      [dayKey]: value
    }));
  }

  async function handleSaveDay(dayKey) {
    setSavingDayKey(dayKey);

    try {
      await journalService.updateJournalDay(dayKey, {
        notes: draftNotes[dayKey] ?? ""
      });
      await journalDaysResource.reload();
      notify({
        title: "Journal notes saved",
        description: `Saved notes for ${formatDayLabel(dayKey)}.`,
        tone: "success"
      });
    } catch (err) {
      notify({ title: "Could not save day notes", description: err.message, tone: "error" });
    } finally {
      setSavingDayKey("");
    }
  }

  const loading =
    tradesResource.loading ||
    journalDaysResource.loading ||
    tagsResource.loading ||
    strategiesResource.loading;
  const error =
    tradesResource.error || journalDaysResource.error || tagsResource.error || strategiesResource.error;

  if (loading) {
    return <LoadingState label="Loading journal..." panel />;
  }

  if (error) {
    return <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <Card title="TRADING JOURNAL" subtitle="Review each trading day, capture lessons, and keep notes tied to the session itself.">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-[170px]">
            <label className="mb-2 block text-sm font-medium text-white/72">Symbol</label>
            <input
              value={filters.symbol}
              onChange={(event) => updateFilter("symbol", event.target.value)}
              placeholder="Symbol"
              className="ui-input"
            />
          </div>

          <div className="w-[170px]">
            <label className="mb-2 block text-sm font-medium text-white/72">Tags</label>
            <CustomSelect
              value={filters.tag}
              onChange={(value) => updateFilter("tag", value)}
              options={[{ label: "All", value: "" }, ...tagsResource.data.map((tag) => ({ label: tag.name, value: tag.name }))]}
            />
          </div>

          <div className="w-[170px]">
            <label className="mb-2 block text-sm font-medium text-white/72">Strategy</label>
            <CustomSelect
              value={filters.strategy}
              onChange={(value) => updateFilter("strategy", value)}
              options={[
                { label: "All", value: "" },
                ...strategiesResource.data.map((strategy) => ({ label: strategy.name, value: strategy.name }))
              ]}
            />
          </div>

          <div className="w-[170px]">
            <label className="mb-2 block text-sm font-medium text-white/72">Side</label>
            <CustomSelect value={filters.side} onChange={(value) => updateFilter("side", value)} options={sideOptions} />
          </div>

          <div className="w-[280px]">
            <label className="mb-2 block text-sm font-medium text-white/72">Date range</label>
            <DateRangePicker
              from={filters.from}
              to={filters.to}
              onChange={({ from, to }) => {
                updateFilter("from", from || "");
                updateFilter("to", to || "");
              }}
            />
          </div>

          <button type="button" onClick={handleResetFilters} className="ui-button h-[48px] px-5 text-sm">
            Reset
          </button>
        </div>
      </Card>

      {pagedDays.length === 0 ? (
        <EmptyState
          title="No journal days match these filters"
          description="Try widening the date range or clearing one of the current filters."
        />
      ) : (
        <>
          <div className="space-y-6">
            {pagedDays.map((day) => (
              <JournalDayCard
                key={day.dayKey}
                day={day}
                noteDraft={draftNotes[day.dayKey] ?? day.note ?? ""}
                onNoteChange={handleNotesChange}
                onSaveNote={handleSaveDay}
                isSaving={savingDayKey === day.dayKey}
                onOpenTrade={(tradeId) => navigate(`/trades/${tradeId}`)}
              />
            ))}
          </div>

          <Card bodyClassName="py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-white/56">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, journalDays.length)} of {journalDays.length} trading day
                {journalDays.length === 1 ? "" : "s"}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className="ui-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <div className="ui-chip text-sm">
                  Page {currentPage} / {totalPages}
                </div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                  className="ui-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default JournalPage;
