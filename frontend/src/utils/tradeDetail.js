function asNumber(value) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatMinuteLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getTradePnl(trade) {
  return asNumber(trade.netPnl ?? trade.grossPnl);
}

function getTradeHoldMinutes(trade) {
  if (!trade.entryDate || !trade.exitDate) {
    return 0;
  }

  const entryTime = new Date(trade.entryDate).getTime();
  const exitTime = new Date(trade.exitDate).getTime();
  return Math.max(0, (exitTime - entryTime) / 60000);
}

function formatHoldTime(minutes) {
  if (!minutes) {
    return "Open";
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function buildTradeRunningPnl(trade) {
  const pnl = getTradePnl(trade);
  const entryTime = trade.entryDate;
  const exitTime = trade.exitDate || trade.entryDate;

  return [
    {
      label: formatMinuteLabel(entryTime),
      timestamp: entryTime,
      pnl: 0,
      marker: "Entry"
    },
    {
      label: formatMinuteLabel(exitTime),
      timestamp: exitTime,
      pnl,
      marker: trade.exitDate ? "Exit" : "Current"
    }
  ];
}

function buildDayRunningPnl(selectedTrade, trades) {
  if (!selectedTrade?.entryDate) {
    return [];
  }

  const selectedDay = new Date(selectedTrade.entryDate).toISOString().slice(0, 10);
  const dayTrades = trades
    .filter((trade) => trade.entryDate?.slice(0, 10) === selectedDay)
    .sort((a, b) => {
      const aTime = new Date(a.exitDate || a.entryDate).getTime();
      const bTime = new Date(b.exitDate || b.entryDate).getTime();
      return aTime - bTime;
    });

  let cumulativePnl = 0;

  return dayTrades.map((trade) => {
    cumulativePnl += getTradePnl(trade);

    return {
      id: trade.id,
      label: formatMinuteLabel(trade.exitDate || trade.entryDate),
      timestamp: trade.exitDate || trade.entryDate,
      pnl: Number(cumulativePnl.toFixed(2)),
      isSelected: trade.id === selectedTrade.id,
      symbol: trade.symbol
    };
  });
}

function buildTradeTimeline(trade) {
  const timeline = [
    {
      id: `${trade.id}-entry`,
      label: "Entry",
      time: trade.entryDate,
      symbol: trade.symbol,
      quantity: Math.abs(asNumber(trade.quantity)),
      price: asNumber(trade.entryPrice),
      position: trade.side === "SHORT" ? "Short open" : "Long open"
    }
  ];

  if (trade.exitDate && trade.exitPrice != null) {
    timeline.push({
      id: `${trade.id}-exit`,
      label: "Exit",
      time: trade.exitDate,
      symbol: trade.symbol,
      quantity: Math.abs(asNumber(trade.quantity)),
      price: asNumber(trade.exitPrice),
      position: trade.side === "SHORT" ? "Cover" : "Sell"
    });
  }

  return timeline;
}

export {
  buildDayRunningPnl,
  buildTradeRunningPnl,
  buildTradeTimeline,
  formatHoldTime,
  getTradeHoldMinutes,
  getTradePnl
};
