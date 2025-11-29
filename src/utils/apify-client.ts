import { ApifyClient } from "apify-client";
import type {
  ApifyInstagramResponse,
  InstagramExtractTextResponse,
} from "../types.js";

/**
 * Creates and configures an Apify client for Instagram scraping
 * @param apiToken - Apify API token from environment
 * @returns Configured ApifyClient instance
 */
export function createApifyClient(apiToken: string): ApifyClient {
  return new ApifyClient({ token: apiToken });
}

/**
 * Scrapes Instagram post data using Apify Instagram Scraper actor
 * @param instagramUrl - Instagram post URL
 * @param apifyToken - Apify API token
 * @param actorId - Apify actor ID (default: apify/instagram-scraper)
 * @returns Structured Instagram post data
 */
export async function scrapeInstagramPost(
  instagramUrl: string,
  apifyToken: string,
  actorId: string = "apify/instagram-scraper"
): Promise<InstagramExtractTextResponse> {
  try {
    const client = createApifyClient(apifyToken);

    // Input for the Apify Instagram Scraper actor
    const actorInput = {
      directUrls: [instagramUrl],
      resultsLimit: 1,
      includeComments: true,
      maxComments: 50,
    };

    // Call the Apify actor
    const run = await client.actor(actorId).call(actorInput);

    // Fetch results from dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      return {
        success: false,
        instagram_url: instagramUrl,
        type: "Unknown",
        caption: "",
        author: {
          username: "Unknown",
          displayName: "Unknown",
        },
        comments: [],
        likesCount: 0,
        commentsCount: 0,
        error: "No data found for the provided Instagram URL",
      };
    }

    // Map raw Apify data to structured response
    const rawPostData = items[0] as unknown as ApifyInstagramResponse;

    return {
      success: true,
      instagram_url: rawPostData.url || instagramUrl,
      type: rawPostData.type || "Unknown",
      caption: rawPostData.caption || "",
      author: {
        username: rawPostData.ownerUsername || "Unknown",
        displayName:
          rawPostData.ownerFullName || rawPostData.ownerUsername || "Unknown",
      },
      comments: (rawPostData.latestComments || []).map((comment) => ({
        username: comment.ownerUsername,
        text: comment.text,
        timestamp: comment.timestamp,
      })),
      likesCount: rawPostData.likesCount || 0,
      commentsCount: rawPostData.commentsCount || 0,
      videoUrl: rawPostData.videoUrl,
      videoDuration: rawPostData.videoDuration,
      displayUrl: rawPostData.displayUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      instagram_url: instagramUrl,
      type: "Unknown",
      caption: "",
      author: {
        username: "Unknown",
        displayName: "Unknown",
      },
      comments: [],
      likesCount: 0,
      commentsCount: 0,
      error: `Apify scraping failed: ${errorMessage}`,
    };
  }
}
