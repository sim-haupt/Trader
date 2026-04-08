const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const buildTradePayload = require("../utils/buildTradePayload");
const tagService = require("./tag.service");
const strategyService = require("./strategy.service");

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
  const trade = await prisma.trade.create({
    data: buildTradePayload(data, userId)
  });

  if (data.tags) {
    await tagService.ensureTags(userId, data.tags);
  }

  if (data.strategy) {
    await strategyService.ensureStrategies(userId, data.strategy);
  }

  return trade;
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
  const tags = await tagService.listTags(actor);
  return tags.map((tag) => tag.name);
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

  const trade = await prisma.trade.update({
    where: { id: tradeId },
    data: buildTradePayload(data, existingTrade.userId)
  });

  if (data.tags) {
    await tagService.ensureTags(existingTrade.userId, data.tags);
  }

  if (data.strategy) {
    await strategyService.ensureStrategies(existingTrade.userId, data.strategy);
  }

  return trade;
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
  const strategy =
    payload.strategy === undefined ? undefined : payload.strategy === "" ? null : payload.strategy.trim();

  const data = {};

  if (nextTags !== undefined) {
    data.tags = nextTags;
  }

  if (notes !== undefined) {
    data.notes = notes;
  }

  if (strategy !== undefined) {
    data.strategy = strategy;
  }

  const trade = await prisma.trade.update({
    where: { id: tradeId },
    data,
    include: tradeDetailInclude
  });

  if (nextTags) {
    await tagService.ensureTags(existingTrade.userId, nextTags);
  }

  if (strategy) {
    await strategyService.ensureStrategies(existingTrade.userId, strategy);
  }

  return trade;
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
  const strategy =
    payload.strategy === undefined ? undefined : payload.strategy === "" ? null : payload.strategy.trim();

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

      if (strategy !== undefined) {
        data.strategy = strategy;
      }

      return prisma.trade.update({
        where: { id: trade.id },
        data
      });
    })
  );

  if (payload.tags) {
    const userIds = actor.role === "ADMIN"
      ? [...new Set((await prisma.trade.findMany({
          where: {
            id: {
              in: trades.map((trade) => trade.id)
            }
          },
          select: { userId: true }
        })).map((trade) => trade.userId))]
      : [actor.id];

    await Promise.all(userIds.map((userId) => tagService.ensureTags(userId, payload.tags)));
  }

  if (strategy) {
    const userIds = actor.role === "ADMIN"
      ? [...new Set((await prisma.trade.findMany({
          where: {
            id: {
              in: trades.map((trade) => trade.id)
            }
          },
          select: { userId: true }
        })).map((trade) => trade.userId))]
      : [actor.id];

    await Promise.all(userIds.map((userId) => strategyService.ensureStrategies(userId, strategy)));
  }

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

  const result = await prisma.trade.createMany({
    data: trades.map((trade) => buildTradePayload(trade, userId))
  });

  const tagValues = [...new Set(
    trades.flatMap((trade) =>
      String(trade.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )].join(", ");
  const strategyValues = [...new Set(
    trades
      .map((trade) => String(trade.strategy || "").trim())
      .filter(Boolean)
  )].join(", ");

  if (tagValues) {
    await tagService.ensureTags(userId, tagValues);
  }

  if (strategyValues) {
    await strategyService.ensureStrategies(userId, strategyValues);
  }

  return result;
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
