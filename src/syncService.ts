import {
  IEmail,
  ChangeStreamDocument,
  ElasticsearchEmailPayload,
} from "./types";
import ElasticsearchService from "./elasticsearch";
import MongoDBService from "./mongodb";

class SyncService {
  private esService: ElasticsearchService;
  private mongoService: MongoDBService;

  constructor(esService: ElasticsearchService, mongoService: MongoDBService) {
    this.esService = esService;
    this.mongoService = mongoService;
  }

  private mapEmailToESPayload(email: IEmail): ElasticsearchEmailPayload {
    return {
      product: email.product, // ✅ Searchable
      subject: email.subject, // ✅ Primary search field
      body: email.body, // ✅ Main content search
      // customer, date, createdAt, updatedAt stay only in MongoDB
    };
  }

  async handleEmailChange(change: ChangeStreamDocument<IEmail>) {
    const documentId = change.documentKey._id.toString();

    try {
      switch (change.operationType) {
        case "insert":
        case "update":
        case "replace":
          if (change.fullDocument) {
            const esPayload = this.mapEmailToESPayload(change.fullDocument);
            await this.esService.indexEmail(documentId, esPayload);
            console.log(
              `[INFO] Synced ${change.operationType} for email ${documentId}`
            );
          }
          break;

        case "delete":
          await this.esService.deleteEmail(documentId);
          console.log(`[INFO] Synced delete for email ${documentId}`);
          break;

        default:
          console.log(
            `[INFO] Unhandled operation type: ${change.operationType}`
          );
      }
    } catch (error) {
      console.error(`[BAD] Error syncing email ${documentId}:`, error);
      // In production, you might want to implement retry logic or dead letter queue
    }
  }

  async performInitialSync() {
    console.log("[INFO] Starting initial sync...");

    try {
      const emails = await this.mongoService.getAllEmails();
      console.log(`[INFO] Found ${emails.length} emails to sync`);

      let synced = 0;
      for (const email of emails) {
        try {
          const esPayload = this.mapEmailToESPayload(email);
          await this.esService.indexEmail(email._id!.toString(), esPayload);
          synced++;

          if (synced % 100 === 0) {
            console.log(`[INFO] Synced ${synced}/${emails.length} emails`);
          }
        } catch (error) {
          console.error(`[BAD] Error syncing email ${email._id}:`, error);
        }
      }

      console.log(
        `[INFO] Initial sync completed: ${synced}/${emails.length} emails synced`
      );
    } catch (error) {
      console.error("[BAD] Initial sync failed:", error);
      throw error;
    }
  }

  startWatching() {
    console.log("[INFO] Starting to watch for email changes...");
    this.mongoService.watchEmails((change) => {
      this.handleEmailChange(change);
    });
  }
}

export default SyncService;
