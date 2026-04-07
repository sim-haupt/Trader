const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const buildTradePayload = require("../utils/buildTradePayload");

const adminTradeInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
};

const tradeDetailInclude = {
  executions: {
    orderBy: {
      sequence: "asc"
    }
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
};

function hasGlobalTradeScope(actor, filters = {}) {
  return actor.role === "ADMIN" && filters.scope === "all";
}

function buildTradeWhere(actor, filters = {}) {
  const where = {};

  if (!hasGlobalTradeScope(actor, filters)) {
    where.userId = actor.id;
  }

  if (filters.symbol) {
    where.symbol = filters.symbol.toUpperCase();
  }

  if (filters.side) {
    where.side = filters.side;
  }

  if (filters.strategy) {
    where.strategy = filters.strategy;
  }

  if (filters.from || filters.to) {
    where.entryDate = {};

    if (filters.from) {
      where.entryDate.gte = new Date(filters.from);
    }

    if (filters.to) {
      where.entryDate.lte = new Date(filters.to);
    }
  }

  return where;
}

async function findAccessibleTrade(actor, tradeId) {
  const trade = await prisma.trade.findFirst({
    where: {
      id: tradeId,
      ...(actor.role === "ADMIN" ? {} : { userId: actor.id })
    }
  });

  if (!trade) {
    throw new ApiError(404, "Trade not found");
  }

  return trade;
}

async function createTrade(userId, data) {
  return prisma.trade.create({
    data: buildTradePayload(data, userId)
  });
}

async function getTrades(actor, filters) {
  const where = buildTradeWhere(actor, filters);

  return prisma.trade.findMany({
    where,
    include: hasGlobalTradeScope(actor, filters) ? adminTradeInclude : undefined,
    orderBy: {
      entryDate: "desc"
    }
  });
}

async function getTradeById(actor, tradeId) {
  const trade = await prisma.trade.findFirst({
    where: {
      id: tradeId,
      ...(actor.role === "ADMIN" ? {} : { userId: actor.id })
    },
    include: tradeDetailInclude
  });

  if (!trade) {
    throw new ApiError(404, "Trade not found");
  }

  return trade;
}

async function updateTrade(actor, tradeId, data) {
  const existingTrade = await findAccessibleTrade(actor, tradeId);

  return prisma.trade.update({
    where: { id: tradeId },
    data: buildTradePayload(data, existingTrade.userId)
  });
}

async function deleteTrade(actor, tradeId) {
  await findAccessibleTrade(actor, tradeId);

  await prisma.trade.delete({
    where: {
      id: tradeId
    }
  });

  return {
    message: "Trade deleted successfully"
  };
}

async function bulkDeleteTrades(actor, tradeIds) {
  const uniqueTradeIds = [...new Set(tradeIds)];

  if (uniqueTradeIds.length === 0) {
    throw new ApiError(400, "At least one trade id is required");
  }

  const where = {
    id: {
      in: uniqueTradeIds
    }
  };

  if (actor.role !== "ADMIN") {
    where.userId = actor.id;
  }

  const result = await prisma.trade.deleteMany({ where });

  return {
    deletedCount: result.count
  };
}

async function deleteAllTrades(actor, options = {}) {
  const where = {};

  if (!(actor.role === "ADMIN" && options.scope === "all")) {
    where.userId = actor.id;
  }

  const result = await prisma.trade.deleteMany({ where });

  return {
    deletedCount: result.count
  };
}

async function createManyTrades(userId, trades) {
  if (trades.length === 0) {
    return { count: 0 };
  }

  return prisma.trade.createMany({
    data: trades.map((trade) => buildTradePayload(trade, userId))
  });
}

module.exports = {
  createTrade,
  getTrades,
  getTradeById,
  updateTrade,
  deleteTrade,
  bulkDeleteTrades,
  deleteAllTrades,
  createManyTrades
};
