const app = require("./app");
const prisma = require("./config/prisma");
const env = require("./config/env");
const { startPremarketCapture } = require("./services/premarket.service");

const { startScheduler } = require("./services/trading-intelligence.service");

async function startServer() {
  try {
    await prisma.$connect();

    app.listen(env.port, () => {
      startPremarketCapture();
      startScheduler();
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

startServer();
