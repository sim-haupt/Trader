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

async function getTradeTags(actor) {
  const trades = await prisma.trade.findMany({
    where: actor.role === "ADMIN" ? undefined : { userId: actor.id },
    select: {
      tags: true
    }
  });

  return [...new Set(
    trades
      .flatMap((trade) => String(trade.tags || "").split(","))
      .map((tag) => tag.trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
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

async function updateTradeMeta(actor, tradeId, payload) {
  const existingTrade = await findAccessibleTrade(actor, tradeId);
  const tagsMode = payload.tagsMode || "append";

  const nextTags =
    payload.tags === undefined
      ? undefined
      : payload.tags === null || payload.tags === ""
        ? null
        : tagsMode === "replace"
          ? payload.tags
          : mergeTagStrings(existingTrade.tags, payload.tags);

  const notes =
    payload.notes === undefined ? undefined : payload.notes === "" ? null : payload.notes;

  const data = {};

  if (nextTags !== undefined) {
    data.tags = nextTags;
  }

  if (notes !== undefined) {
    data.notes = notes;
  }

  return prisma.trade.update({
    where: { id: tradeId },
    data,
    include: tradeDetailInclude
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

function mergeTagStrings(existingTags, incomingTags) {
  const current = String(existingTags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const incoming = String(incomingTags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return [...new Set([...current, ...incoming])].join(", ");
}

async function bulkUpdateTrades(actor, payload) {
  const uniqueTradeIds = [...new Set(payload.tradeIds)];

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

  const trades = await prisma.trade.findMany({
    where,
    select: {
      id: true,
      tags: true
    }
  });

  if (trades.length === 0) {
    return { updatedCount: 0 };
  }

  const notes =
    payload.notes === undefined ? undefined : payload.notes === "" ? null : payload.notes;
  const tagsMode = payload.tagsMode || "append";

  await prisma.$transaction(
    trades.map((trade) => {
      const nextTags =
        payload.tags === undefined
          ? undefined
          : payload.tags === ""
            ? null
            : tagsMode === "replace"
              ? payload.tags
              : mergeTagStrings(trade.tags, payload.tags);

      const data = {};

      if (nextTags !== undefined) {
        data.tags = nextTags;
      }

      if (notes !== undefined) {
        data.notes = notes;
      }

      return prisma.trade.update({
        where: { id: trade.id },
        data
      });
    })
  );

  return {
    updatedCount: trades.length
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
  getTradeTags,
  getTradeById,
  updateTrade,
  updateTradeMeta,
  deleteTrade,
  bulkDeleteTrades,
  bulkUpdateTrades,
  deleteAllTrades,
  createManyTrades
};
