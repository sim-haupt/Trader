const dotenv = require("dotenv");

dotenv.config();

const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

module.exports = {
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  alpacaApiKeyId: process.env.APCA_API_KEY_ID || "",
  alpacaSecretKey: process.env.APCA_API_SECRET_KEY || "",
  alpacaDataUrl: process.env.ALPACA_DATA_URL || "https://data.alpaca.markets",
  alpacaFeed: process.env.ALPACA_DATA_FEED || "iex"
};
