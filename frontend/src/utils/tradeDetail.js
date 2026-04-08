function asNumber(value) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatMinuteLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
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

function getExecutionSignedQuantity(execution) {
  return execution.action === "BUY" ? asNumber(execution.quantity) : -asNumber(execution.quantity);
}

function buildTradeRunningPnl(trade) {
  const executions = Array.isArray(trade.executions) ? trade.executions : [];

  if (executions.length === 0) {
    const pnl = getTradePnl(trade);
    const entryTime = trade.entryDate;
    const exitTime = trade.exitDate || trade.entryDate;

    return [
      {
        id: `${trade.id}-entry`,
        label: formatMinuteLabel(entryTime),
        timestamp: entryTime,
        pnl: 0,
        marker: "Entry"
      },
      {
        id: `${trade.id}-exit`,
        label: formatMinuteLabel(exitTime),
        timestamp: exitTime,
        pnl,
        marker: trade.exitDate ? "Exit" : "Current"
      }
    ];
  }

  const direction = trade.side === "SHORT" ? -1 : 1;
  let openQuantity = 0;
  let averageEntryPrice = 0;
  let realizedPnl = 0;

  return executions.map((execution) => {
    const quantity = asNumber(execution.quantity);
    const price = asNumber(execution.price);
    const action = execution.action;
    const signedQuantity = getExecutionSignedQuantity(execution);
    const isOpeningAction =
      (trade.side === "LONG" && action === "BUY") || (trade.side === "SHORT" && action === "SELL");

    if (isOpeningAction) {
      const nextOpenQuantity = openQuantity + quantity;
      averageEntryPrice =
        nextOpenQuantity > 0
          ? (averageEntryPrice * openQuantity + price * quantity) / nextOpenQuantity
          : averageEntryPrice;
      openQuantity = nextOpenQuantity;
    } else {
      const closingQuantity = Math.min(quantity, openQuantity || quantity);
      realizedPnl += (price - averageEntryPrice) * closingQuantity * direction;
      openQuantity = Math.max(0, openQuantity - closingQuantity);
    }

    return {
      id: execution.id || `${trade.id}-${execution.sequence}`,
      label: formatMinuteLabel(execution.occurredAt),
      timestamp: execution.occurredAt,
      pnl: Number(realizedPnl.toFixed(2)),
      marker: action,
      price,
      quantity,
      signedQuantity,
      positionAfter:
        execution.positionAfter === null || execution.positionAfter === undefined
          ? null
          : asNumber(execution.positionAfter)
    };
  });
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
  const executions = Array.isArray(trade.executions) ? trade.executions : [];

  if (executions.length > 0) {
    return executions.map((execution, index) => ({
      id: execution.id || `${trade.id}-${index + 1}`,
      label: execution.action === "BUY" ? "Buy" : "Sell",
      time: execution.occurredAt,
      symbol: trade.symbol,
      quantity:
        execution.action === "BUY" ? asNumber(execution.quantity) : -asNumber(execution.quantity),
      price: asNumber(execution.price),
      position:
        execution.positionAfter === null || execution.positionAfter === undefined
          ? "-"
          : asNumber(execution.positionAfter),
      source: execution.source || "IMPORTED"
    }));
  }

  const timeline = [
    {
      id: `${trade.id}-entry`,
      label: "Entry",
      time: trade.entryDate,
      symbol: trade.symbol,
      quantity: Math.abs(asNumber(trade.quantity)),
      price: asNumber(trade.entryPrice),
      position: trade.side === "SHORT" ? -Math.abs(asNumber(trade.quantity)) : asNumber(trade.quantity),
      source: "SYNTHETIC"
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
      position: 0,
      source: "SYNTHETIC"
    });
  }

  return timeline;
}

function getDisplayedExecutionCount(trade) {
  const storedExecutions = Array.isArray(trade.executions) ? trade.executions.length : 0;
  return asNumber(trade.reportedExecutionCount) || storedExecutions;
}

export {
  buildDayRunningPnl,
  buildTradeRunningPnl,
  buildTradeTimeline,
  formatHoldTime,
  formatMinuteLabel,
  getDisplayedExecutionCount,
  getTradeHoldMinutes,
  getTradePnl
};
