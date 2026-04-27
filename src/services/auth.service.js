const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { execSync } = require("node:child_process");
const prisma = require("../config/prisma");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const packageJson = require("../../package.json");

function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn
    }
  );
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    activeAccountScope: user.activeAccountScope || "SIMULATOR",
    liveDataStartDate: user.liveDataStartDate ? user.liveDataStartDate.toISOString().slice(0, 10) : null,
    defaultCommission: Number(user.defaultCommission || 0),
    defaultFees: Number(user.defaultFees || 0)
  };
}

function parseDayKeyToDate(dayKey) {
  if (!dayKey) {
    return null;
  }

  const [year, month, day] = String(dayKey)
    .split("-")
    .map((value) => Number(value));

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function getRuntimeGitSha() {
  const envSha =
    process.env.APP_BUILD_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA;

  if (envSha) {
    return String(envSha).slice(0, 7);
  }

  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function getRuntimeBuildTime() {
  return process.env.APP_BUILD_TIME || process.env.RAILWAY_DEPLOYMENT_CREATED_AT || null;
}

async function register(data) {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email }
  });

  if (existingUser) {
    throw new ApiError(409, "Email is already registered");
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash
    }
  });

  const token = generateToken(user);

  return {
    token,
    user: serializeUser(user)
  };
}

async function login(data) {
  const user = await prisma.user.findUnique({
    where: { email: data.email }
  });

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = generateToken(user);

  return {
    token,
    user: serializeUser(user)
  };
}

async function getSettings(actor) {
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      activeAccountScope: true,
      liveDataStartDate: true,
      defaultCommission: true,
      defaultFees: true
    }
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return serializeUser(user);
}

async function updateSettings(actor, data) {
  const user = await prisma.user.update({
    where: { id: actor.id },
    data: {
      activeAccountScope: data.activeAccountScope,
      liveDataStartDate:
        data.liveDataStartDate === undefined
          ? undefined
          : data.liveDataStartDate
            ? parseDayKeyToDate(data.liveDataStartDate)
            : null,
      defaultCommission: data.defaultCommission,
      defaultFees: data.defaultFees
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      activeAccountScope: true,
      liveDataStartDate: true,
      defaultCommission: true,
      defaultFees: true
    }
  });

  return serializeUser(user);
}

function getMeta() {
  return {
    version: packageJson.version,
    sha: getRuntimeGitSha(),
    buildTime: getRuntimeBuildTime()
  };
}

module.exports = {
  register,
  login,
  getSettings,
  updateSettings,
  getMeta
};
