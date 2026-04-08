const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

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
    defaultCommission: Number(user.defaultCommission || 0),
    defaultFees: Number(user.defaultFees || 0)
  };
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
      defaultCommission: data.defaultCommission,
      defaultFees: data.defaultFees
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      defaultCommission: true,
      defaultFees: true
    }
  });

  return serializeUser(user);
}

module.exports = {
  register,
  login,
  getSettings,
  updateSettings
};
