// @ts-nocheck
import dotenv from "dotenv";
import MongoDBService from "./mongodb";
import ElasticsearchService from "./elasticsearch";
import SyncService from "./syncService";

dotenv.config();

// Validate required environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;
if (!MONGODB_URI) {
  console.error("[BAD] MONGODB_URI environment variable is required");
  process.exit(1);
}
if (!ELASTICSEARCH_URL) {
  console.error("[BAD] ELASTICSEARCH_URL environment variable is required");
  process.exit(1);
}

async function main() {
  console.log("[INFO] Starting Data Sync");

  let mongoService: MongoDBService;
  let esService: ElasticsearchService;
  let syncService: SyncService;

  try {
    // Initialize services
    mongoService = new MongoDBService(MONGODB_URI);
    esService = new ElasticsearchService(ELASTICSEARCH_URL);
    syncService = new SyncService(esService, mongoService);

    // Connect to databases
    await mongoService.connect();
    await esService.connect();

    // Perform initial sync
    await syncService.performInitialSync();

    // Start watching for changes
    syncService.startWatching();

    console.log("[INFO] Data Sync Worker is running and watching for changes");

    // Graceful shutdown handling
    process.on("SIGINT", async () => {
      console.log("\n[INFO] Received SIGINT, shutting down gracefully");
      await cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      console.log("\n[INFO] Received SIGTERM, shutting down gracefully");
      await cleanup();
      process.exit(0);
    });

    async function cleanup() {
      try {
        if (mongoService) {
          await mongoService.close();
        }
        console.log("[INFO] Cleanup completed");
      } catch (error) {
        console.error("[BAD] Error during cleanup:", error);
      }
    }
  } catch (error) {
    console.error("[BAD] Failed to start Data Sync Worker:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("[BAD] Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("[BAD] Uncaught Exception:", error);
  process.exit(1);
});

main().catch((error) => {
  console.error("[BAD] Main function failed:", error);
  process.exit(1);
});
