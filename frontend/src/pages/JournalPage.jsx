import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Filters from "../components/Filters";
import LoadingState from "../components/ui/LoadingState";
import RichTextEditor from "../components/ui/RichTextEditor";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import journalService from "../services/journalService";
import tagService from "../services/tagService";
import setupService from "../services/setupService";
import {
  formatCostCurrency,
  formatCurrency,
  formatDateTimeLocal,
  formatEuroCurrency
} from "../utils/formatters";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import {
  getEffectiveTradeCommission,
  getTradeFeeDisplayValue,
  getTradeGrossPnl,
  getTradeNetPnl,
  getTradePerSharePnl
} from "../utils/tradePnl";
import { normalizeRichTextHtml } from "../utils/richText";
import {
  JOURNAL_COMMISSION_FIELDS,
  getJournalCommissionTotal,
  getJournalCommissionValue
} from "../utils/journalCommissions";

const PAGE_SIZE = 5;
const JOURNAL_CHART_EDGE_PADDING_MS = 60 * 60 * 1000;

function getDayKey(value) {
  const formatted = formatDateTimeLocal(value);
  return formatted ? formatted.slice(0, 10) : "";
}

function parseDayKey(dayKey) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day)
  };
}

function addDays(dayKey, amount) {
  const parts = parseDayKey(dayKey);
  if (!parts) {
    return dayKey;
  }

  // Use UTC math so "YYYY-MM-DD" always moves forward regardless of local / market timezone.
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day);
  const next = new Date(utc + (Number(amount) || 0) * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

function getUtcDateParts(dayKey) {
  const parts = parseDayKey(dayKey);

  if (!parts) {
    return null;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return {
    date,
    year: parts.year,
    month: parts.month,
    day: parts.day
  };
}

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - firstDay.getUTCDay() + 7) % 7;
  return 1 + offset + (occurrence - 1) * 7;
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (lastDay.getUTCDay() - weekday + 7) % 7;
  return lastDay.getUTCDate() - offset;
}

function buildDayKey(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getObservedHolidayKey(year, month, day) {
  const holiday = new Date(Date.UTC(year, month - 1, day));
  const weekday = holiday.getUTCDay();

  if (weekday === 6) {
    holiday.setUTCDate(holiday.getUTCDate() - 1);
  } else if (weekday === 0) {
    holiday.setUTCDate(holiday.getUTCDate() + 1);
  }

  return holiday.toISOString().slice(0, 10);
}

function getEasterSundayUtc(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
}

function isUsMarketHoliday(dayKey) {
  const parts = getUtcDateParts(dayKey);

  if (!parts) {
    return false;
  }

  const { year, month, day } = parts;
  const holidayKeys = new Set([
    getObservedHolidayKey(year, 1, 1),
    buildDayKey(year, 1, nthWeekdayOfMonth(year, 0, 1, 3)),
    buildDayKey(year, 2, nthWeekdayOfMonth(year, 1, 1, 3)),
    (() => {
      const easter = getEasterSundayUtc(year);
      easter.setUTCDate(easter.getUTCDate() - 2);
      return easter.toISOString().slice(0, 10);
    })(),
    buildDayKey(year, 5, lastWeekdayOfMonth(year, 4, 1)),
    getObservedHolidayKey(year, 6, 19),
    getObservedHolidayKey(year, 7, 4),
    buildDayKey(year, 9, nthWeekdayOfMonth(year, 8, 1, 1)),
    buildDayKey(year, 11, nthWeekdayOfMonth(year, 10, 4, 4)),
    getObservedHolidayKey(year, 12, 25)
  ]);

  return holidayKeys.has(buildDayKey(year, month, day));
}

function isTradingDay(dayKey) {
  const parts = getUtcDateParts(dayKey);

  if (!parts) {
    return false;
  }

  const weekday = parts.date.getUTCDay();

  return weekday !== 0 && weekday !== 6 && !isUsMarketHoliday(dayKey);
}

function enumerateDayKeys(startKey, endKey) {
  if (!startKey || !endKey || startKey > endKey) {
    return [];
  }

  const keys = [];
  let cursor = startKey;
  let safety = 0;

  while (cursor <= endKey) {
    if (isTradingDay(cursor)) {
      keys.push(cursor);
    }
    const next = addDays(cursor, 1);
    if (next === cursor) {
      break;
    }
    cursor = next;
    safety += 1;
    if (safety > 5000) {
      break;
    }
  }

  return keys;
}

function formatDayLabel(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  })
    .format(date)
    .toUpperCase();
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

function formatCents(value) {
  return Number(value || 0).toFixed(2);
}

function formatCostCents(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function buildJournalFeeDraft(day = {}) {
  return JOURNAL_COMMISSION_FIELDS.reduce((draft, field) => {
    draft[field.key] = String(getJournalCommissionValue(day, field.key));
    return draft;
  }, {});
}

function mergeJournalDays(currentDays = [], updatedDays = []) {
  const byDayKey = new Map(currentDays.map((day) => [day.dayKey, day]));

  for (const day of updatedDays) {
    if (day?.dayKey) {
      byDayKey.set(day.dayKey, {
        ...(byDayKey.get(day.dayKey) || {}),
        ...day
      });
    }
  }

  return [...byDayKey.values()];
}

function buildTradePnl(trade, pnlType, defaultCommission, defaultFees) {
  return pnlType === "NET"
    ? getTradeNetPnl(trade, defaultCommission, defaultFees)
    : getTradeGrossPnl(trade);
}

function formatAxisTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function buildSignedChartSeries(points) {
  const withTime = points.map((point) => ({
    ...point,
    timeValue: new Date(point.timestamp).getTime()
  }));

  if (withTime.length === 0) {
    return { data: [] };
  }

  const toSplitPoint = (point, forceZero = false) => ({
    ...point,
    positivePnl: forceZero || point.pnl === 0 ? 0 : point.pnl > 0 ? point.pnl : null,
    negativePnl: forceZero || point.pnl === 0 ? 0 : point.pnl < 0 ? point.pnl : null
  });

  const data = [toSplitPoint(withTime[0])];

  for (let index = 1; index < withTime.length; index += 1) {
    const previousPoint = withTime[index - 1];
    const currentPoint = withTime[index];
    const crossedZero =
      (previousPoint.pnl < 0 && currentPoint.pnl > 0) ||
      (previousPoint.pnl > 0 && currentPoint.pnl < 0);

    if (crossedZero) {
      const span = currentPoint.timeValue - previousPoint.timeValue;
      const ratio = Math.abs(previousPoint.pnl) / (Math.abs(previousPoint.pnl) + Math.abs(currentPoint.pnl));
      const crossingTime = previousPoint.timeValue + span * ratio;

      data.push(
        toSplitPoint(
          {
            id: `${previousPoint.id}-${currentPoint.id}-zero`,
            label: formatAxisTime(crossingTime),
            timestamp: new Date(crossingTime).toISOString(),
            timeValue: crossingTime,
            pnl: 0,
            isSelected: false
          },
          true
        )
      );
    }

    data.push(toSplitPoint(currentPoint));
  }

  return { data };
}

function matchesTradeFilters(trade, filters) {
  const symbol = String(trade.symbol || "").toUpperCase();
  const setup = String(trade.setup || "").trim();
  const side = String(trade.side || "").toUpperCase();
  const dayKey = getDayKey(trade.entryDate);
  const tags = getTradeTags(trade);

  if (filters.symbol && !symbol.includes(filters.symbol.trim().toUpperCase())) {
    return false;
  }

  if (filters.tag && !tags.some((tag) => tag.toLowerCase() === String(filters.tag).toLowerCase())) {
    return false;
  }

  if (filters.setup && setup !== filters.setup) {
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

function matchesJournalDayRange(dayKey, filters) {
  if (!dayKey) {
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

function buildJournalVisualization(dayKey, trades) {
  const sortedTrades = [...trades].sort(
    (left, right) => new Date(left.exitDate || left.entryDate).getTime() - new Date(right.exitDate || right.entryDate).getTime()
  );

  if (sortedTrades.length === 0) {
    const fallbackStart = `${dayKey}T08:30:00-04:00`;
    const fallbackEnd = `${dayKey}T17:00:00-04:00`;

    return {
      trades: sortedTrades,
      chartData: [
        {
          id: `${dayKey}-empty-start`,
          label: formatTimeLabel(fallbackStart),
          timestamp: fallbackStart,
          pnl: 0,
          isSelected: false
        },
        {
          id: `${dayKey}-empty-end`,
          label: formatTimeLabel(fallbackEnd),
          timestamp: fallbackEnd,
          pnl: 0,
          isSelected: false
        }
      ]
    };
  }

  let cumulative = 0;
  const firstTradeTimestamp = new Date(sortedTrades[0].exitDate || sortedTrades[0].entryDate).getTime();
  const lastTradeTimestamp = new Date(
    sortedTrades[sortedTrades.length - 1].exitDate || sortedTrades[sortedTrades.length - 1].entryDate
  ).getTime();
  const leadingPoint = {
    id: `${dayKey}-leading`,
    label: formatTimeLabel(new Date(firstTradeTimestamp - JOURNAL_CHART_EDGE_PADDING_MS).toISOString()),
    timestamp: new Date(firstTradeTimestamp - JOURNAL_CHART_EDGE_PADDING_MS).toISOString(),
    pnl: 0,
    isSelected: false
  };
  const chartPoints = [leadingPoint];

  for (let index = 0; index < sortedTrades.length; index += 1) {
    const trade = sortedTrades[index];
    cumulative += trade.dayPnl;

    chartPoints.push({
      id: trade.id,
      label: formatTimeLabel(trade.exitDate || trade.entryDate),
      timestamp: trade.exitDate || trade.entryDate,
      pnl: Number(cumulative.toFixed(2)),
      isSelected: index === sortedTrades.length - 1,
      symbol: trade.symbol
    });
  }

  chartPoints.push({
    id: `${dayKey}-trailing`,
    label: formatTimeLabel(new Date(lastTradeTimestamp + JOURNAL_CHART_EDGE_PADDING_MS).toISOString()),
    timestamp: new Date(lastTradeTimestamp + JOURNAL_CHART_EDGE_PADDING_MS).toISOString(),
    pnl: Number(cumulative.toFixed(2)),
    isSelected: false
  });

  return {
    trades: sortedTrades,
    chartData: chartPoints
  };
}

function formatFxRate(rate) {
  return Number.isFinite(Number(rate)) ? Number(rate).toFixed(6) : "Unavailable";
}

function csvValue(value) {
  const stringValue = value === undefined || value === null ? "" : String(value);

  if (/["\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJournalDayTrades(day) {
  const header = [
    "Day",
    "Symbol",
    "Side",
    "Quantity",
    "Entry Price",
    "Exit Price",
    "Entry Date",
    "Exit Date",
    "Executions",
    "Setup",
    "Tags",
    "Gross P&L USD",
    "Commissions USD",
    "Trade Fees USD",
    ...JOURNAL_COMMISSION_FIELDS.map((field) => `${field.label} USD`),
    "Total Costs USD",
    "Net P&L USD",
    "USD/EUR FX Rate",
    "FX Rate Date",
    "Gross P&L EUR",
    "Commissions EUR",
    "Trade Fees EUR",
    ...JOURNAL_COMMISSION_FIELDS.map((field) => `${field.label} EUR`),
    "Total Costs EUR",
    "Net P&L EUR",
    "Day Total Net P&L USD",
    "Day Total Net P&L EUR",
    "Notes"
  ];
  const rows = day.trades.map((trade) => [
    day.dayKey,
    trade.symbol,
    trade.side,
    trade.quantity,
    trade.entryPrice,
    trade.exitPrice ?? "",
    trade.entryDate,
    trade.exitDate ?? "",
    trade.execCount,
    trade.setup ?? "",
    trade.parsedTags.join("; "),
    Number(trade.dayPnl ?? 0).toFixed(2),
    Number(trade.dayCommissions ?? 0).toFixed(2),
    Number(trade.dayFees ?? 0).toFixed(2),
    ...JOURNAL_COMMISSION_FIELDS.map(() => ""),
    Number(trade.dayCosts ?? 0).toFixed(2),
    Number(trade.dayNetPnl ?? 0).toFixed(2),
    day.fxRate ?? "",
    day.fxRateDate ?? "",
    day.fxRate ? Number(trade.dayPnlEur ?? 0).toFixed(2) : "",
    day.fxRate ? Number(trade.dayCommissionsEur ?? 0).toFixed(2) : "",
    day.fxRate ? Number(trade.dayFeesEur ?? 0).toFixed(2) : "",
    ...JOURNAL_COMMISSION_FIELDS.map(() => ""),
    day.fxRate ? Number(trade.dayCostsEur ?? 0).toFixed(2) : "",
    day.fxRate ? Number(trade.dayNetPnlEur ?? 0).toFixed(2) : "",
    Number(day.totalNetPnl ?? 0).toFixed(2),
    day.fxRate ? Number(day.totalNetPnlEur ?? 0).toFixed(2) : "",
    trade.notes ?? ""
  ]);

  rows.push([
    day.dayKey,
    "TOTAL",
    "",
    day.totalVolume,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    Number(day.totalPnl ?? 0).toFixed(2),
    Number(day.totalTradeCommissions ?? 0).toFixed(2),
    Number(day.totalFees ?? 0).toFixed(2),
    ...JOURNAL_COMMISSION_FIELDS.map((field) => formatCents(day[field.key])),
    Number(day.totalCosts ?? 0).toFixed(2),
    Number(day.totalNetPnl ?? 0).toFixed(2),
    day.fxRate ?? "",
    day.fxRateDate ?? "",
    day.fxRate ? Number(day.totalPnlEur ?? 0).toFixed(2) : "",
    day.fxRate ? Number(day.totalTradeCommissionsEur ?? 0).toFixed(2) : "",
    day.fxRate ? Number(day.totalFeesEur ?? 0).toFixed(2) : "",
    ...JOURNAL_COMMISSION_FIELDS.map((field) => (day.fxRate ? formatCents(day[`${field.key}Eur`]) : "")),
    day.fxRate ? Number(day.totalCostsEur ?? 0).toFixed(2) : "",
    day.fxRate ? Number(day.totalNetPnlEur ?? 0).toFixed(2) : "",
    Number(day.totalNetPnl ?? 0).toFixed(2),
    day.fxRate ? Number(day.totalNetPnlEur ?? 0).toFixed(2) : "",
    ""
  ]);

  downloadCsv(`journal-${day.dayKey}-trades.csv`, [header, ...rows]);
}

function buildDailyJournal(
  trades,
  journalDaysByDay,
  defaultCommission,
  defaultFees,
  fxRatesByDay = {},
  includeDayKeys = [],
  pnlType = "GROSS"
) {
  const grouped = new Map();

  for (const trade of trades) {
    const dayKey = getDayKey(trade.entryDate);

    if (!dayKey) {
      continue;
    }

    const grossPnl = getTradeGrossPnl(trade);
    const netPnl = getTradeNetPnl(trade, defaultCommission, defaultFees);
    const pnl = pnlType === "NET" ? grossPnl : buildTradePnl(trade, pnlType, defaultCommission, defaultFees);
    const quantity = Number(trade.quantity || 0);
    const perSharePnl = getTradePerSharePnl(trade, pnl);
    const commissions = getEffectiveTradeCommission(trade);
    const fees = getTradeFeeDisplayValue(trade);
    const costs = commissions + fees;
    const fxRate = Number(fxRatesByDay[dayKey]?.rate);
    const hasFxRate = Number.isFinite(fxRate);
    const existing = grouped.get(dayKey) || {
      ...(journalDaysByDay.get(dayKey) || {}),
      dayKey,
      label: formatDayLabel(dayKey),
      trades: [],
      totalTrades: 0,
      totalVolume: 0,
      totalTradeCommissions: 0,
      totalTradeCommissionsEur: 0,
      totalCommissionsEur: 0,
      totalFees: 0,
      totalFeesEur: 0,
      totalCosts: 0,
      totalCostsEur: 0,
      totalPnl: 0,
      totalPnlEur: 0,
      totalNetPnl: 0,
      totalNetPnlEur: 0,
      perShareTotal: 0,
      wins: 0,
      losses: 0,
      fxRate: hasFxRate ? fxRate : null,
      fxRateDate: fxRatesByDay[dayKey]?.rateDate || "",
      fxRateError: fxRatesByDay[dayKey]?.error || ""
    };

    existing.trades.push({
      ...trade,
      dayPnl: pnl,
      dayPnlEur: hasFxRate ? Number((pnl * fxRate).toFixed(4)) : null,
      dayNetPnl: netPnl,
      dayNetPnlEur: hasFxRate ? Number((netPnl * fxRate).toFixed(4)) : null,
      dayCommissions: Number(commissions.toFixed(2)),
      dayCommissionsEur: hasFxRate ? Number((commissions * fxRate).toFixed(2)) : null,
      dayFees: Number(fees.toFixed(2)),
      dayFeesEur: hasFxRate ? Number((fees * fxRate).toFixed(2)) : null,
      dayCosts: Number(costs.toFixed(2)),
      dayCostsEur: hasFxRate ? Number((costs * fxRate).toFixed(2)) : null,
      entryTimeLabel: formatTimeLabel(trade.entryDate),
      execCount: trade.reportedExecutionCount ?? trade.executions?.length ?? 0,
      parsedTags: getTradeTags(trade)
    });
    existing.totalTrades += 1;
    existing.totalVolume += quantity;
    existing.totalTradeCommissions += commissions;
    existing.totalTradeCommissionsEur += hasFxRate ? commissions * fxRate : 0;
    existing.totalFees += fees;
    existing.totalFeesEur += hasFxRate ? fees * fxRate : 0;
    existing.totalCosts += costs;
    existing.totalCostsEur += hasFxRate ? costs * fxRate : 0;
    existing.totalPnl += pnl;
    existing.totalPnlEur += hasFxRate ? pnl * fxRate : 0;
    existing.totalNetPnl += netPnl;
    existing.totalNetPnlEur += hasFxRate ? netPnl * fxRate : 0;
    existing.perShareTotal += perSharePnl;

    if (pnl > 0) {
      existing.wins += 1;
    } else if (pnl < 0) {
      existing.losses += 1;
    }

    grouped.set(dayKey, existing);
  }

  for (const dayKey of includeDayKeys) {
    if (!dayKey || grouped.has(dayKey)) {
      continue;
    }

    grouped.set(dayKey, {
      ...(journalDaysByDay.get(dayKey) || {}),
      dayKey,
      label: formatDayLabel(dayKey),
      trades: [],
      totalTrades: 0,
      totalVolume: 0,
      totalTradeCommissions: 0,
      totalTradeCommissionsEur: 0,
      totalCommissionsEur: 0,
      totalFees: 0,
      totalFeesEur: 0,
      totalCosts: 0,
      totalCostsEur: 0,
      totalPnl: 0,
      totalPnlEur: 0,
      totalNetPnl: 0,
      totalNetPnlEur: 0,
      perShareTotal: 0,
      wins: 0,
      losses: 0,
      fxRate: Number.isFinite(Number(fxRatesByDay[dayKey]?.rate)) ? Number(fxRatesByDay[dayKey].rate) : null,
      fxRateDate: fxRatesByDay[dayKey]?.rateDate || "",
      fxRateError: fxRatesByDay[dayKey]?.error || ""
    });
  }

  return [...grouped.values()]
    .map((day) => {
      const visualization = buildJournalVisualization(day.dayKey, day.trades);
      const journalCommissionTotal = getJournalCommissionTotal(day);
      const totalGrossPnlEur = day.fxRate ? Number(day.totalPnlEur.toFixed(2)) : null;
      const totalCommissionEur = day.fxRate ? Number((journalCommissionTotal * day.fxRate).toFixed(2)) : null;
      const totalNetPnlEur =
        totalGrossPnlEur !== null && totalCommissionEur !== null
          ? Number((totalGrossPnlEur - totalCommissionEur).toFixed(2))
          : null;

      return {
        ...day,
        trades: visualization.trades,
        chartData: visualization.chartData,
        ...Object.fromEntries(
          JOURNAL_COMMISSION_FIELDS.flatMap((field) => {
            const value = Number(getJournalCommissionValue(day, field.key).toFixed(2));
            return [
              [field.key, value],
              [`${field.key}Eur`, day.fxRate ? Number((value * day.fxRate).toFixed(2)) : null]
            ];
          })
        ),
        totalPnl: Number((day.totalPnl - (pnlType === "NET" ? journalCommissionTotal : 0)).toFixed(2)),
        totalPnlEur: pnlType === "NET" ? totalNetPnlEur : totalGrossPnlEur,
        totalNetPnl: Number((day.totalPnl - journalCommissionTotal).toFixed(2)),
        totalNetPnlEur,
        totalCommissions: Number(journalCommissionTotal.toFixed(2)),
        totalCommissionsEur: totalCommissionEur,
        totalTradeCommissions: Number(day.totalTradeCommissions.toFixed(2)),
        totalTradeCommissionsEur: day.fxRate ? Number(day.totalTradeCommissionsEur.toFixed(2)) : null,
        totalFees: Number(day.totalFees.toFixed(2)),
        totalFeesEur: day.fxRate ? Number(day.totalFeesEur.toFixed(2)) : null,
        totalCosts: Number(journalCommissionTotal.toFixed(2)),
        totalCostsEur: totalCommissionEur,
        averagePerShare: Number(day.perShareTotal.toFixed(4)),
        winRate: day.totalTrades ? (day.wins / day.totalTrades) * 100 : 0,
        note: journalDaysByDay.get(day.dayKey)?.notes || ""
      };
    })
    .sort((left, right) => right.dayKey.localeCompare(left.dayKey));
}

function JournalChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  const value = Number(point?.pnl ?? payload[0]?.value ?? 0);
  const valueClass = value < 0 ? "text-coral" : value > 0 ? "text-mint" : "text-white";

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2 text-xs text-phosphor">
      <div className="font-medium text-white">{point?.label || label}</div>
      <div className={`mt-1 ${valueClass}`}>{formatCurrency(value)}</div>
    </div>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M13.958 3.542a1.5 1.5 0 0 1 2.122 0l.378.378a1.5 1.5 0 0 1 0 2.122l-8.75 8.75-3.166.792.791-3.166 8.625-8.876Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m12.5 5 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function JournalDayCard({
  day,
  noteDraft,
  feeDraft,
  onNoteChange,
  onFeeChange,
  onSaveNote,
  onSaveCosts,
  onImportCostsFile,
  onCostFileChange,
  onStartEditingNote,
  onStartEditingCosts,
  onCancelEditingNote,
  onCancelEditingCosts,
  isEditingNote,
  isEditingCosts,
  isSaving,
  isSavingCosts,
  isImportingCosts,
  selectedCostFile,
  onOpenTrade,
  onExportTrades
}) {
  const positive = day.totalPnl >= 0;
  const negative = day.totalPnl < 0;
  const hasTrades = day.totalTrades > 0;
  const averagePerSharePositive = day.averagePerShare >= 0;
  const averagePerShareNegative = day.averagePerShare < 0;
  const winRateClass =
    day.winRate < 50 ? "text-coral" : day.winRate <= 65 ? "text-gold" : "text-mint";
  const signedChartData = useMemo(() => buildSignedChartSeries(day.chartData), [day.chartData]);

  return (
    <Card
      title={<span className="text-[14px] text-white/72">{day.label}</span>}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className={`rounded-[6px] border px-3 py-2 text-sm font-semibold ${
              positive
                ? "border-mint bg-mint/10 text-mint"
                : negative
                  ? "border-coral bg-coral/10 text-coral"
                  : "border-[#e5e7eb42] bg-white/[0.05] text-mist"
            }`}
          >
            P&amp;L: {formatCurrency(day.totalPnl)}
          </div>
          <div
            className={`rounded-[6px] border px-3 py-2 text-sm font-semibold ${
              averagePerSharePositive
                ? "border-mint bg-mint/10 text-mint"
                : averagePerShareNegative
                  ? "border-coral bg-coral/10 text-coral"
                  : "border-[#e5e7eb42] bg-white/[0.05] text-mist"
            }`}
          >
            /SH: {formatCurrency(day.averagePerShare)}
          </div>
          <button
            type="button"
            onClick={() => onExportTrades(day)}
            disabled={!hasTrades}
            className="ui-button-solid px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="ui-surface-subtle overflow-hidden">
            <div className="ui-widget-heading-bg border-b border-[var(--line)] px-4 py-4">
              <div className="ui-title text-[10px] text-white/72">Day Running P&amp;L</div>
            </div>
            <div className="h-[290px] pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={signedChartData.data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                  <defs>
                    <linearGradient id={`journal-day-pnl-fill-positive-${day.dayKey}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(52, 224, 161, 0.34)" />
                      <stop offset="65%" stopColor="rgba(52, 224, 161, 0.12)" />
                      <stop offset="100%" stopColor="rgba(52, 224, 161, 0.02)" />
                    </linearGradient>
                    <linearGradient id={`journal-day-pnl-fill-negative-${day.dayKey}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(255, 95, 122, 0.28)" />
                      <stop offset="65%" stopColor="rgba(255, 95, 122, 0.12)" />
                      <stop offset="100%" stopColor="rgba(255, 95, 122, 0.02)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="timeValue"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={formatAxisTime}
                    tick={{ fill: "#bcc4d4", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(value) => `$${value}`}
                    tick={{ fill: "#bcc4d4", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<JournalChartTooltip />}
                    offset={14}
                    allowEscapeViewBox={{ x: true, y: true }}
                    wrapperStyle={{ zIndex: 20 }}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="#ffffff"
                    strokeOpacity={0.72}
                    strokeWidth={1.5}
                    strokeDasharray="6 6"
                    ifOverflow="extendDomain"
                  />
                  <Area
                    type="monotone"
                    dataKey="positivePnl"
                    stroke="none"
                    fill={`url(#journal-day-pnl-fill-positive-${day.dayKey})`}
                    fillOpacity={1}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="negativePnl"
                    stroke="none"
                    fill={`url(#journal-day-pnl-fill-negative-${day.dayKey})`}
                    fillOpacity={1}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="positivePnl"
                    stroke="#34e0a1"
                    strokeWidth={3}
                    dot={false}
                    isAnimationActive={false}
                    activeDot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="negativePnl"
                    stroke="#ff5f7a"
                    strokeWidth={3}
                    dot={false}
                    isAnimationActive={false}
                    activeDot={false}
                    connectNulls={false}
                  />
                  {day.chartData
                    .filter((point) => point.symbol)
                    .map((point) => (
                      <ReferenceDot
                        key={point.id}
                        x={new Date(point.timestamp).getTime()}
                        y={point.pnl}
                        r={point.isSelected ? 6 : 5}
                        fill={point.pnl > 0 ? "#34e0a1" : point.pnl < 0 ? "#ff5f7a" : "#ededed"}
                        stroke="transparent"
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Total Trades</div>
              <div className="mt-2 text-2xl font-semibold text-white">{day.totalTrades}</div>
            </div>
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Total Volume</div>
              <div className="mt-2 text-2xl font-semibold text-white">{Math.round(day.totalVolume).toLocaleString()}</div>
            </div>
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Win %</div>
              <div className={`mt-2 text-2xl font-semibold ${hasTrades ? winRateClass : "text-white"}`}>
                {hasTrades ? `${day.winRate.toFixed(1)}%` : "No trades"}
              </div>
            </div>
            <div className="ui-metric-tile sm:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <div className="ui-title text-[10px] text-white/52">Commissions</div>
                {!isEditingCosts ? (
                  <button
                    type="button"
                    onClick={() => onStartEditingCosts(day.dayKey)}
                    className="ui-button inline-flex h-8 w-8 items-center justify-center rounded-[6px] p-0 text-white/70 hover:text-white"
                    aria-label={`Edit regulatory fees for ${day.label}`}
                    title="Edit regulatory fees"
                  >
                    <EditIcon />
                  </button>
                ) : null}
              </div>
              {isEditingCosts ? (
                <div className="mt-3 space-y-3">
                  <div className="block">
                    <span className="mb-2 block text-[10px] font-medium text-white/62">Upload commissions file</span>
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                      <div className="ui-panel flex-1 border-dashed p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <input
                            id={`commission-file-${day.dayKey}`}
                            key={selectedCostFile?.name || "empty"}
                            type="file"
                            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            disabled={isImportingCosts}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              onCostFileChange(day.dayKey, file || null);
                            }}
                            className="sr-only"
                          />
                          <label
                            htmlFor={`commission-file-${day.dayKey}`}
                            className={`ui-button shrink-0 text-sm ${isImportingCosts ? "pointer-events-none opacity-50" : ""}`}
                          >
                            Choose file
                          </label>
                          <span className="min-w-0 flex-1 truncate text-sm text-white/72">
                            {selectedCostFile?.name || "No file selected"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onImportCostsFile(day.dayKey, selectedCostFile)}
                        disabled={!selectedCostFile || isImportingCosts}
                        className="ui-button-solid shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isImportingCosts ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {JOURNAL_COMMISSION_FIELDS.map((field) => (
                      <label key={field.key} className="block">
                        <span className="mb-1 block text-[10px] font-medium text-white/62">{field.label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={feeDraft[field.key] ?? "0"}
                          onChange={(event) => onFeeChange(day.dayKey, field.key, event.target.value)}
                          className="ui-input px-3 py-2 text-sm"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onCancelEditingCosts(day.dayKey)}
                      className="ui-button px-3 py-1.5 text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => onSaveCosts(day.dayKey)}
                      disabled={isSavingCosts}
                      className="ui-button-solid px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingCosts ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 text-2xl font-semibold text-white">{formatCostCurrency(day.totalCosts)}</div>
                  <div className="mt-2 text-xs text-white/48">
                    {JOURNAL_COMMISSION_FIELDS.map((field) => `${field.label} ${formatCostCents(day[field.key])}`).join(" · ")}
                  </div>
                </>
              )}
            </div>
            <div className="ui-metric-tile sm:col-span-3">
              <div className="ui-title text-[10px] text-white/52">USD to EUR FX Rate</div>
              <div className="mt-3 grid gap-3 text-xs text-white/54 sm:grid-cols-3">
                <span className="min-w-0">
                  Rate:{" "}
                  <span className="font-medium text-white">{formatFxRate(day.fxRate)}</span>
                </span>
                <span className="min-w-0">
                  Comm/Fees EUR:{" "}
                  <span className="font-medium text-white">
                    {day.fxRate ? formatCostCurrency(day.totalCostsEur, "EUR") : "Unavailable"}
                  </span>
                </span>
                <span className="min-w-0">
                  P&amp;L EUR:{" "}
                  <span
                    className={`font-medium ${
                      day.fxRate
                        ? Number(day.totalPnlEur || 0) >= 0
                          ? "text-mint"
                          : "text-coral"
                        : "text-white/54"
                    }`}
                  >
                    {day.fxRate ? formatEuroCurrency(day.totalPnlEur) : "Unavailable"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="ui-inset-box p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="ui-title inline-flex min-h-[36px] items-center text-[10px] leading-none text-white/56">
              Day Review
            </div>
            {!isEditingNote ? (
              <button
                type="button"
                onClick={() => onStartEditingNote(day.dayKey)}
                className="ui-button px-4 py-2 text-xs"
              >
                Edit day
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCancelEditingNote(day.dayKey, day.note || "")}
                  className="ui-button px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onSaveNote(day.dayKey)}
                  disabled={isSaving}
                  className="ui-button-solid px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save day"}
                </button>
              </div>
            )}
          </div>

          {isEditingNote ? (
            <RichTextEditor
              value={noteDraft}
              onChange={(value) => onNoteChange(day.dayKey, value)}
              placeholder="Write your review, mistakes, strengths, and lessons from this trading day..."
              minHeight={180}
            />
          ) : (
            <div className="space-y-4">
              {day.note ? (
                <div className="ui-surface-subtle px-4 py-4">
                  <div
                    className="prose prose-invert max-w-none text-sm text-white/72"
                    dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(day.note) }}
                  />
                </div>
              ) : (
                <div className="ui-surface-subtle border-dashed px-4 py-5 text-sm text-white/40">
                  No notes captured for this trading day yet.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ui-table-shell overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="ui-widget-heading-bg text-left text-white/56">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Volume</th>
                  <th className="px-4 py-3 font-medium">Execs</th>
                  <th className="px-4 py-3 font-medium">P&amp;L</th>
                  <th className="px-4 py-3 font-medium">P&amp;L / Share</th>
                  <th className="px-4 py-3 font-medium">Setup</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {day.trades.length > 0 ? (
                  day.trades.map((trade) => (
                    <tr
                      key={trade.id}
                      className="cursor-pointer border-t border-[var(--line)] bg-[rgba(255,255,255,0.05)] text-white/82 transition hover:bg-white/[0.08]"
                      onClick={() => onOpenTrade(trade.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">{trade.entryTimeLabel}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{trade.symbol}</div>
                      </td>
                      <td className="px-4 py-3">{Math.round(Number(trade.quantity || 0)).toLocaleString()}</td>
                      <td className="px-4 py-3">{trade.execCount}</td>
                      <td className={`px-4 py-3 font-medium ${trade.dayPnl > 0 ? "text-mint" : trade.dayPnl < 0 ? "text-coral" : "text-white/70"}`}>
                        {formatCurrency(trade.dayPnl)}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          Number(trade.quantity || 0) === 0
                            ? "text-white/70"
                            : trade.dayPnl / Math.abs(Number(trade.quantity || 0)) > 0
                              ? "text-mint"
                              : trade.dayPnl / Math.abs(Number(trade.quantity || 0)) < 0
                                ? "text-coral"
                                : "text-white/70"
                        }`}
                      >
                        {formatCurrency(
                          Number(trade.quantity || 0) === 0
                            ? 0
                            : trade.dayPnl / Math.abs(Number(trade.quantity || 0))
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/54">
                        {trade.setup ? <span className="ui-chip">{trade.setup}</span> : <span className="text-white/26">—</span>}
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
                  ))
                ) : (
                  <tr className="border-t border-[var(--line)] bg-[rgba(255,255,255,0.05)]">
                    <td colSpan={8} className="px-4 py-5 text-sm text-white/40">
                      No trades logged for this day.
                    </td>
                  </tr>
                )}
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
    setup: "",
    side: "",
    from: selectedDay,
    to: selectedDay,
    hideNoTradeDays: false
  });
  const [page, setPage] = useState(1);
  const [draftNotes, setDraftNotes] = useState({});
  const [draftDayFees, setDraftDayFees] = useState({});
  const [editingNotesByDay, setEditingNotesByDay] = useState({});
  const [editingCostsByDay, setEditingCostsByDay] = useState({});
  const [selectedCostFilesByDay, setSelectedCostFilesByDay] = useState({});
  const [savingDayKey, setSavingDayKey] = useState("");
  const [savingCostDayKey, setSavingCostDayKey] = useState("");
  const [importingCostDayKey, setImportingCostDayKey] = useState("");
  const [fxRatesByDay, setFxRatesByDay] = useState({});
  const [loadingFxRates, setLoadingFxRates] = useState(false);
  const [fxRateError, setFxRateError] = useState("");
  const [pnlType, setPnlType] = useState("GROSS");

  const tradesResource = useCachedAsyncResource({
    peek: () => tradeService.peekAllTrades(),
    load: () => tradeService.getAllTrades(),
    initialValue: [],
    deps: [user?.activeAccountScope]
  });

  const journalDaysResource = useCachedAsyncResource({
    peek: () => journalService.peekJournalDays(),
    load: () => journalService.getJournalDays(),
    initialValue: [],
    deps: [user?.activeAccountScope]
  });

  const tagsResource = useCachedAsyncResource({
    peek: () => tagService.peekTags(),
    load: () => tagService.getTags(),
    initialValue: [],
    deps: []
  });

  const setupsResource = useCachedAsyncResource({
    peek: () => setupService.peekSetups(),
    load: () => setupService.getSetups(),
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

  useEffect(() => {
    const nextDrafts = {};

    for (const day of journalDaysResource.data) {
      nextDrafts[day.dayKey] = buildJournalFeeDraft(day);
    }

    setDraftDayFees((current) => ({
      ...current,
      ...nextDrafts
    }));
  }, [journalDaysResource.data]);

  const filteredTrades = useMemo(
    () => tradesResource.data.filter((trade) => matchesTradeFilters(trade, filters)),
    [tradesResource.data, filters]
  );

  const journalDayKeys = useMemo(() => {
    const todayKey = getDayKey(new Date());
    const accountStartKey =
      user?.activeAccountScope === "LIVE" && user?.liveDataStartDate ? user.liveDataStartDate : null;
    const hasTradeSpecificFilters = Boolean(
      filters.symbol || filters.tag || filters.setup || filters.side
    );

    // If you filter by ticker/tag/setup/side, default to hiding empty days (matches your request).
    const hideNoTradeDays = Boolean(filters.hideNoTradeDays || hasTradeSpecificFilters);

    const allTradeDayKeys = tradesResource.data.map((trade) => getDayKey(trade.entryDate)).filter(Boolean);
    allTradeDayKeys.sort();
    const earliestTradeDayKey = allTradeDayKeys[0] || todayKey;
    const latestTradeDayKey = allTradeDayKeys[allTradeDayKeys.length - 1] || todayKey;

    const noteDayKeys = journalDaysResource.data.map((day) => day.dayKey).filter(Boolean);
    noteDayKeys.sort();
    const earliestNoteDayKey = noteDayKeys[0] || earliestTradeDayKey;
    const latestNoteDayKey = noteDayKeys[noteDayKeys.length - 1] || latestTradeDayKey;

    // Default range is: first trade day (or first note day) -> today.
    const defaultStartCandidate =
      earliestTradeDayKey < earliestNoteDayKey ? earliestTradeDayKey : earliestNoteDayKey;
    const defaultStart = accountStartKey
      ? accountStartKey < defaultStartCandidate
        ? accountStartKey
        : defaultStartCandidate
      : defaultStartCandidate;
    const defaultEnd = latestTradeDayKey > latestNoteDayKey ? latestTradeDayKey : latestNoteDayKey;
    const startKey = filters.from || defaultStart || todayKey;
    const endKey = filters.to || (defaultEnd > todayKey ? defaultEnd : todayKey);

    if (hideNoTradeDays) {
      const tradeKeysInRange = [...new Set(filteredTrades.map((trade) => getDayKey(trade.entryDate)).filter(Boolean))]
        .filter(
          (dayKey) => isTradingDay(dayKey) && matchesJournalDayRange(dayKey, { from: startKey, to: endKey })
        )
        .sort((left, right) => right.localeCompare(left));
      return tradeKeysInRange;
    }

    return enumerateDayKeys(startKey, endKey).sort((left, right) => right.localeCompare(left));
  }, [
    tradesResource.data,
    filteredTrades,
    journalDaysResource.data,
    filters.symbol,
    filters.tag,
    filters.setup,
    filters.side,
    filters.from,
    filters.to,
    filters.hideNoTradeDays,
    user?.activeAccountScope,
    user?.liveDataStartDate
  ]);

  const totalPages = Math.max(1, Math.ceil(journalDayKeys.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedDayKeys = useMemo(
    () => journalDayKeys.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [journalDayKeys, currentPage]
  );

  useEffect(() => {
    if (pagedDayKeys.length === 0) {
      return;
    }

    let cancelled = false;
    setLoadingFxRates(true);
    setFxRateError("");

    journalService
      .getUsdEurRates(pagedDayKeys)
      .then((rates) => {
        if (cancelled) {
          return;
        }

        setFxRatesByDay((current) => ({
          ...current,
          ...rates
        }));
      })
      .catch((err) => {
        if (!cancelled) {
          setFxRateError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingFxRates(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pagedDayKeys]);

  const pagedDays = useMemo(() => {
    const notesByDay = new Map(journalDaysResource.data.map((day) => [day.dayKey, day]));
    const pagedSet = new Set(pagedDayKeys);
    const tradesForPage = filteredTrades.filter((trade) => pagedSet.has(getDayKey(trade.entryDate)));

    return buildDailyJournal(
      tradesForPage,
      notesByDay,
      user?.defaultCommission ?? 0,
      user?.defaultFees ?? 0,
      fxRatesByDay,
      pagedDayKeys,
      pnlType
    );
  }, [
    filteredTrades,
    journalDaysResource.data,
    user?.defaultCommission,
    user?.defaultFees,
    fxRatesByDay,
    pagedDayKeys,
    pnlType
  ]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(journalDayKeys.length / PAGE_SIZE))));
  }, [journalDayKeys.length]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function handleResetFilters() {
    setFilters({
      symbol: "",
      tag: "",
      setup: "",
      side: "",
      from: "",
      to: "",
      hideNoTradeDays: false
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

  function handleDayFeeChange(dayKey, field, value) {
    setDraftDayFees((current) => ({
      ...current,
      [dayKey]: {
        ...buildJournalFeeDraft(),
        ...(current[dayKey] || {}),
        [field]: value
      }
    }));
  }

  function handleCostFileChange(dayKey, file) {
    setSelectedCostFilesByDay((current) => ({
      ...current,
      [dayKey]: file
    }));
  }

  function handleStartEditingDay(dayKey) {
    setEditingNotesByDay((current) => ({
      ...current,
      [dayKey]: true
    }));
  }

  function handleStartEditingCosts(dayKey) {
    setEditingCostsByDay((current) => ({
      ...current,
      [dayKey]: true
    }));
  }

  function handleCancelEditingDay(dayKey, value) {
    setDraftNotes((current) => ({
      ...current,
      [dayKey]: value
    }));
    const journalDay = journalDaysResource.data.find((day) => day.dayKey === dayKey);
    setDraftDayFees((current) => ({
      ...current,
      [dayKey]: buildJournalFeeDraft(journalDay)
    }));
    setEditingNotesByDay((current) => ({
      ...current,
      [dayKey]: false
    }));
  }

  function handleCancelEditingCosts(dayKey) {
    const journalDay = journalDaysResource.data.find((day) => day.dayKey === dayKey);
    setDraftDayFees((current) => ({
      ...current,
      [dayKey]: buildJournalFeeDraft(journalDay)
    }));
    setSelectedCostFilesByDay((current) => ({
      ...current,
      [dayKey]: null
    }));
    setEditingCostsByDay((current) => ({
      ...current,
      [dayKey]: false
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
        description: `Saved review for ${formatDayLabel(dayKey)}.`,
        tone: "success"
      });
      setEditingNotesByDay((current) => ({
        ...current,
        [dayKey]: false
      }));
    } catch (err) {
      notify({ title: "Could not save journal notes", description: err.message, tone: "error" });
    } finally {
      setSavingDayKey("");
    }
  }

  async function handleSaveCosts(dayKey) {
    setSavingCostDayKey(dayKey);

    try {
      await journalService.updateJournalDay(dayKey, {
        ...Object.fromEntries(
          JOURNAL_COMMISSION_FIELDS.map((field) => [
            field.key,
            Number(draftDayFees[dayKey]?.[field.key] || 0)
          ])
        )
      });
      await journalDaysResource.reload();
      notify({
        title: "Commissions saved",
        description: `Saved commission breakdown for ${formatDayLabel(dayKey)}.`,
        tone: "success"
      });
      setEditingCostsByDay((current) => ({
        ...current,
        [dayKey]: false
      }));
    } catch (err) {
      notify({ title: "Could not save regulatory fees", description: err.message, tone: "error" });
    } finally {
      setSavingCostDayKey("");
    }
  }

  async function handleImportCostsFile(dayKey, file) {
    if (!file) {
      notify({ title: "Choose a commissions file first", tone: "error" });
      return;
    }

    setImportingCostDayKey(dayKey);

    try {
      const importedDays = await journalService.importCommissionFile(file);
      journalDaysResource.setData((current) => mergeJournalDays(current, importedDays));
      setDraftDayFees((current) => ({
        ...current,
        ...Object.fromEntries(importedDays.map((day) => [day.dayKey, buildJournalFeeDraft(day)]))
      }));
      setSelectedCostFilesByDay((current) => ({
        ...current,
        [dayKey]: null
      }));
      notify({
        title: "Commissions imported",
        description: `Updated ${importedDays.length} ${importedDays.length === 1 ? "journal day" : "journal days"} from ${file.name}.`,
        tone: "success"
      });
    } catch (err) {
      notify({ title: "Could not import commissions", description: err.message, tone: "error" });
    } finally {
      setImportingCostDayKey("");
    }
  }

  const loading =
    tradesResource.loading ||
    journalDaysResource.loading ||
    tagsResource.loading ||
    setupsResource.loading;
  const error =
    tradesResource.error || journalDaysResource.error || tagsResource.error || setupsResource.error;

  if (loading) {
    return <LoadingState label="Loading journal..." panel />;
  }

  if (error) {
    return <div className="ui-notice border-coral/20 bg-coral/10 text-coral">{error}</div>;
  }

  return (
    <div className="journal-page space-y-6">
      <Card title="TRADING JOURNAL">
        {fxRateError ? (
          <div className="mb-4 ui-notice border-gold/20 bg-gold/10 text-gold">
            EUR totals are temporarily unavailable: {fxRateError}
          </div>
        ) : null}
        <div className="mb-4 flex justify-end">
          <div className="ui-segment">
            {[
              { key: "GROSS", label: "Gross" },
              { key: "NET", label: "Net" }
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                data-active={option.key === pnlType}
                onClick={() => setPnlType(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <Filters
          filters={filters}
          onChange={updateFilter}
          onReset={handleResetFilters}
          setups={setupsResource.data || []}
          tags={tagsResource.data || []}
          actionContent={
            <button
              type="button"
              onClick={() => updateFilter("hideNoTradeDays", !filters.hideNoTradeDays)}
              className={`ui-button min-h-[46px] px-4 py-3 text-sm ${
                filters.hideNoTradeDays ? "border-white/20 bg-[#1f1f1f] text-white" : "text-white/62"
              }`}
            >
              Hide no-trade days
            </button>
          }
        />
      </Card>

      {pagedDays.length === 0 ? (
        <EmptyState
          title="No journal days match these filters"
          description="Try widening the date range or clearing one of the current filters."
        />
      ) : (
        <>
          <div className="space-y-12">
            {pagedDays.map((day) => (
            <JournalDayCard
              key={day.dayKey}
              day={day}
              noteDraft={draftNotes[day.dayKey] ?? day.note ?? ""}
              feeDraft={draftDayFees[day.dayKey] ?? buildJournalFeeDraft(day)}
              onNoteChange={handleNotesChange}
              onFeeChange={handleDayFeeChange}
              onSaveNote={handleSaveDay}
              onSaveCosts={handleSaveCosts}
              onImportCostsFile={handleImportCostsFile}
              onCostFileChange={handleCostFileChange}
              onStartEditingNote={handleStartEditingDay}
              onStartEditingCosts={handleStartEditingCosts}
              onCancelEditingNote={handleCancelEditingDay}
              onCancelEditingCosts={handleCancelEditingCosts}
              isEditingNote={Boolean(editingNotesByDay[day.dayKey])}
              isEditingCosts={Boolean(editingCostsByDay[day.dayKey])}
              isSaving={savingDayKey === day.dayKey}
              isSavingCosts={savingCostDayKey === day.dayKey}
              isImportingCosts={importingCostDayKey === day.dayKey}
              selectedCostFile={selectedCostFilesByDay[day.dayKey] || null}
              onOpenTrade={(tradeId) => navigate(`/trades/${tradeId}`)}
              onExportTrades={exportJournalDayTrades}
            />
            ))}
          </div>

          <Card bodyClassName="py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-white/56">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, journalDayKeys.length)} of {journalDayKeys.length} trading day
                {journalDayKeys.length === 1 ? "" : "s"}
                {loadingFxRates ? " · loading FX rates" : ""}
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
