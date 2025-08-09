// @ts-nocheck
import { Client } from "@elastic/elasticsearch";

class ElasticsearchService {
  private client: Client;
  private indexName = "emaildb-email"; // Changed to prefixed naming

  constructor(elasticsearchUrl: string) {
    this.client = new Client({
      node: elasticsearchUrl,
      requestTimeout: 30000,
      pingTimeout: 30000,
    });
  }

  async connect() {
    try {
      const health = await this.client.cluster.health();
      console.log("[GOOD] Elasticsearch connected:", health.status);

      // Create index if it doesn't exist
      await this.createIndexIfNotExists();
    } catch (error) {
      console.error("[BAD] Elasticsearch connection failed:", error);
      throw error;
    }
  }

  private async createIndexIfNotExists() {
    try {
      const exists = await this.client.indices.exists({
        index: this.indexName,
      });

      if (!exists) {
        await this.client.indices.create({
          index: this.indexName,
          body: {
            mappings: {
              properties: {
                product: {
                  type: "text",
                  analyzer: "standard",
                  // Optimized for direct search queries
                  fields: {
                    exact: { type: "keyword" }, // Exact matching
                    stemmed: { type: "text", analyzer: "english" }, // Word variations
                  },
                },
                subject: {
                  type: "text",
                  analyzer: "standard",
                  // Subject is most important for search
                  fields: {
                    exact: { type: "keyword" },
                    stemmed: { type: "text", analyzer: "english" },
                  },
                },
                body: {
                  type: "text",
                  analyzer: "standard",
                  // Body gets stemming for better matches
                  fields: {
                    stemmed: { type: "text", analyzer: "english" },
                  },
                },
                // Note: customer, date, createdAt, updatedAt are NOT indexed
                // They remain only in MongoDB for full document retrieval
              },
            },
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
            },
          },
        });
        console.log(`[GOOD] Created Elasticsearch index: ${this.indexName}`);
      }
    } catch (error) {
      console.error("[BAD] Error creating Elasticsearch index:", error);
      throw error;
    }
  }

  async indexEmail(id: string, payload: any) {
    try {
      const response = await this.client.index({
        index: this.indexName,
        id: id,
        document: payload,
      });
      console.log(`[GOOD] Indexed email ${id}:`, response.result);
      return response;
    } catch (error) {
      console.error(`[BAD] Error indexing email ${id}:`, error);
      throw error;
    }
  }

  async deleteEmail(id: string) {
    try {
      const response = await this.client.delete({
        index: this.indexName,
        id: id,
      });
      console.log(`[GOOD] Deleted email ${id}:`, response.result);
      return response;
    } catch (error: any) {
      if (error.meta?.statusCode === 404) {
        console.log(
          `[INFO] Email ${id} not found in Elasticsearch (already deleted)`
        );
        return;
      }
      console.error(`[BAD] Error deleting email ${id}:`, error);
      throw error;
    }
  }

  async search(query: string, size: number = 50, from: number = 0) {
    try {
      const searchQuery = {
        index: this.indexName,
        size,
        from,
        query: {
          bool: {
            should: [
              // 1. Exact phrase match (highest priority)
              {
                multi_match: {
                  query,
                  fields: ["subject.exact^10", "product.exact^8"],
                  type: "phrase",
                  boost: 10,
                },
              },
              // 2. Standard fuzzy search (main engine)
              {
                multi_match: {
                  query,
                  fields: ["subject^5", "product^3", "body^1"],
                  type: "best_fields",
                  fuzziness: "AUTO",
                  prefix_length: 0, // Allow fuzzy from first character
                  max_expansions: 50, // Balanced performance vs accuracy
                  tie_breaker: 0.3, // Better multi-field scoring
                },
              },
              // 3. Phrase matching (for multi-word queries)
              {
                multi_match: {
                  query,
                  fields: ["subject^3", "product^2", "body"],
                  type: "phrase",
                  boost: 3,
                },
              },
              // 4. Stemmed search (for word variations like "run"/"running")
              {
                multi_match: {
                  query,
                  fields: [
                    "subject.stemmed^2",
                    "product.stemmed^1.5",
                    "body.stemmed",
                  ],
                  type: "best_fields",
                  fuzziness: "AUTO",
                  boost: 2,
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
        highlight: {
          fields: {
            subject: {
              fragment_size: 200,
              number_of_fragments: 1,
            },
            body: {
              fragment_size: 200,
              number_of_fragments: 2,
            },
            product: {},
          },
          pre_tags: ["<mark>"],
          post_tags: ["</mark>"],
        },
        sort: [
          "_score", // Sort by relevance only
        ],
      };

      const response = await this.client.search(searchQuery);
      return response;
    } catch (error) {
      console.error("[BAD] Error searching emails:", error);
      throw error;
    }
  }
}

export default ElasticsearchService;
