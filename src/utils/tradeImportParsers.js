function normalizeDateTime(value) {
  if (!value) {
    return null;
  }

  const trimmedValue = String(value).trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.includes("T")) {
    return trimmedValue;
  }

  const slashDateTimeMatch = trimmedValue.match(
    /^(\d{2})\/(\d{2})\/(\d{2,4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/
  );

  if (slashDateTimeMatch) {
    const [, month, day, year, time = "00:00:00"] = slashDateTimeMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month}-${day}T${time}`;
  }

  return trimmedValue.replace(" ", "T");
}

function sanitizeNotes(value) {
  if (!value) {
    return null;
  }

  const plainText = String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plainText || null;
}

function mapCsvSide(side) {
  const normalizedSide = String(side || "").trim().toUpperCase();

  if (normalizedSide === "L" || normalizedSide === "LONG") {
    return "LONG";
  }

  if (normalizedSide === "S" || normalizedSide === "SHORT") {
    return "SHORT";
  }

  return normalizedSide;
}

function normalizeImportedCsvRow(row) {
  if (row.symbol || row.entryPrice || row.entryDate) {
    return row;
  }

  if (!row.Symbol || !row["Open Datetime"]) {
    return row;
  }

  return {
    symbol: String(row.Symbol).trim().toUpperCase(),
    side: mapCsvSide(row.Side),
    quantity: row.Volume,
    entryPrice: row["Entry Price"],
    exitPrice: row["Exit Price"],
    entryDate: normalizeDateTime(row["Open Datetime"]),
    exitDate: normalizeDateTime(row["Close Datetime"]),
    fees: 0,
    grossPnl: row["Gross P&L"],
    netPnl: row["Gross P&L"],
    strategy: row.Tags ? String(row.Tags).trim() : null,
    notes: sanitizeNotes(row.Notes)
  };
}

function sanitizeTradeText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\ufeff/g, "")
    .trim();
}

function parseTradeTextLine(line) {
  const columns = line
    .split(",")
    .map((column) => column.trim())
    .filter((column, index, values) => column !== "" || index < values.length - 1);

  if (columns.length < 6) {
    return null;
  }

  const [date, time, symbol, quantity, price, action] = columns;

  return {
    date,
    time,
    symbol: String(symbol || "").trim().toUpperCase(),
    quantity: Number(quantity),
    price: Number(price),
    action: String(action || "").trim().toUpperCase()
  };
}

function parseTradeText(text) {
  const sanitizedText = sanitizeTradeText(text);

  if (!sanitizedText) {
    return [];
  }

  return sanitizedText
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseTradeTextLine)
    .filter(Boolean);
}

function createTradeState(fill, quantityOverride = fill.quantity) {
  const side = fill.action === "B" ? "LONG" : "SHORT";

  return {
    symbol: fill.symbol,
    side,
    entryDate: fill.datetime,
    entryQuantity: quantityOverride,
    entryValue: quantityOverride * fill.price,
    openQuantity: quantityOverride,
    closedQuantity: 0,
    exitValue: 0,
    exitDate: null
  };
}

function sameDirectionAction(side) {
  return side === "LONG" ? "B" : "S";
}

function buildClosedTrade(state) {
  return {
    symbol: state.symbol,
    side: state.side,
    quantity: state.entryQuantity,
    entryPrice: Number((state.entryValue / state.entryQuantity).toFixed(4)),
    exitPrice: Number((state.exitValue / state.closedQuantity).toFixed(4)),
    entryDate: state.entryDate,
    exitDate: state.exitDate,
    fees: 0,
    strategy: null,
    notes: "Imported from trade text"
  };
}

function convertFillsToTrades(fills) {
  const states = new Map();
  const trades = [];

  const sortedFills = [...fills].sort(
    (left, right) => new Date(left.datetime).getTime() - new Date(right.datetime).getTime()
  );

  for (const fill of sortedFills) {
    let state = states.get(fill.symbol);

    if (!state) {
      states.set(fill.symbol, createTradeState(fill));
      continue;
    }

    const openAction = sameDirectionAction(state.side);

    if (fill.action === openAction) {
      state.entryQuantity += fill.quantity;
      state.entryValue += fill.quantity * fill.price;
      state.openQuantity += fill.quantity;
      continue;
    }

    let remainingQuantity = fill.quantity;

    while (remainingQuantity > 0 && state) {
      const closeQuantity = Math.min(remainingQuantity, state.openQuantity);

      state.closedQuantity += closeQuantity;
      state.exitValue += closeQuantity * fill.price;
      state.openQuantity -= closeQuantity;
      state.exitDate = fill.datetime;
      remainingQuantity -= closeQuantity;

      if (state.openQuantity === 0) {
        trades.push(buildClosedTrade(state));
        states.delete(fill.symbol);
        state = null;

        if (remainingQuantity > 0) {
          const nextState = createTradeState(fill, remainingQuantity);
          states.set(fill.symbol, nextState);
          remainingQuantity = 0;
        }
      }
    }
  }

  const openPositions = Array.from(states.values()).map((state) => ({
    symbol: state.symbol,
    quantity: state.openQuantity,
    side: state.side
  }));

  return {
    trades,
    openPositions
  };
}

function parseTradesFromText(text) {
  const rows = parseTradeText(text);

  const invalidRows = [];
  const validFills = [];

  rows.forEach((row, index) => {
    const errors = [];

    if (!row.symbol) {
      errors.push("symbol is required");
    }

    if (!row.date || !row.time) {
      errors.push("date and time are required");
    }

    if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
      errors.push("quantity must be a positive number");
    }

    if (!Number.isFinite(row.price) || row.price <= 0) {
      errors.push("price must be a positive number");
    }

    if (!["B", "S"].includes(row.action)) {
      errors.push("action must be B or S");
    }

    const datetime = normalizeDateTime(`${row.date} ${row.time}`);

    if (datetime && Number.isNaN(new Date(datetime).getTime())) {
      errors.push("date/time must be valid");
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber: index + 1,
        rawData: row,
        errors
      });
      return;
    }

    validFills.push({
      ...row,
      datetime
    });
  });

  const { trades, openPositions } = convertFillsToTrades(validFills);

  openPositions.forEach((position) => {
    invalidRows.push({
      rowNumber: null,
      rawData: position,
      errors: [`Open ${position.side.toLowerCase()} position for ${position.symbol} was not fully closed`]
    });
  });

  return {
    totalRows: rows.length,
    trades,
    invalidRows
  };
}

module.exports = {
  normalizeImportedCsvRow,
  parseTradesFromText
};
