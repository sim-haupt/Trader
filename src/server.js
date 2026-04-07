const app = require("./app");
const prisma = require("./config/prisma");
const env = require("./config/env");

async function startServer() {
  try {
    await prisma.$connect();

    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

startServer();
