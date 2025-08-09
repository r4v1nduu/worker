// @ts-nocheck
import { MongoClient, Db, Collection, ChangeStream } from "mongodb";
import { IEmail, ChangeStreamDocument } from "./types";

class MongoDBService {
  private client: MongoClient;
  private db!: Db;
  private emailCollection!: Collection<IEmail>;

  constructor(mongoUri: string) {
    this.client = new MongoClient(mongoUri);
  }

  async connect() {
    try {
      await this.client.connect();
      console.log("[INFO] MongoDB connected");

      this.db = this.client.db("emaildb");
      this.emailCollection = this.db.collection<IEmail>("emails");

      // Create indexes for better performance
      await this.createIndexes();
    } catch (error) {
      console.error("[BAD] MongoDB connection failed:", error);
      throw error;
    }
  }

  private async createIndexes() {
    try {
      // Create indexes for common query patterns
      await this.emailCollection.createIndex({ product: 1 });
      await this.emailCollection.createIndex({ customer: 1 });
      await this.emailCollection.createIndex({ date: -1 });
      await this.emailCollection.createIndex({
        subject: "text",
        body: "text",
        product: "text",
      });
      console.log("[INFO] MongoDB indexes created");
    } catch (error) {
      console.error("[BAD] Error creating MongoDB indexes:", error);
    }
  }

  watchEmails(
    changeHandler: (change: ChangeStreamDocument<IEmail>) => void
  ): ChangeStream {
    const changeStream = this.emailCollection.watch([], {
      fullDocument: "updateLookup",
    });

    changeStream.on("change", (change: ChangeStreamDocument<IEmail>) => {
      console.log(
        `[INFO] Email change detected: ${change.operationType} for ${change.documentKey?._id}`
      );
      changeHandler(change);
    });

    changeStream.on("error", (error) => {
      console.error("[BAD] Change stream error:", error);
    });

    changeStream.on("close", () => {
      console.log("[INFO] Change stream closed");
    });

    return changeStream;
  }

  async getAllEmails(): Promise<IEmail[]> {
    return await this.emailCollection.find({}).toArray();
  }

  async getEmailCollection(): Promise<Collection<IEmail>> {
    return this.emailCollection;
  }

  async close() {
    await this.client.close();
    console.log("[INFO] MongoDB connection closed");
  }
}

export default MongoDBService;
