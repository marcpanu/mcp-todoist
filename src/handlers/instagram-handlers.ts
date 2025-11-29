import type {
  InstagramExtractTextArgs,
  InstagramExtractTextResponse,
} from "../types.js";
import { scrapeInstagramPost } from "../utils/apify-client.js";
import { sanitizeInput, VALIDATION_LIMITS } from "../validation.js";

/**
 * Handler for extracting text content from Instagram posts
 * Uses Apify Instagram Scraper to retrieve caption, comments, and metadata
 *
 * @param args - Instagram extraction arguments containing URL
 * @param apifyToken - Apify API token from environment
 * @returns Structured Instagram post data with text content
 */
export async function handleInstagramExtractText(
  args: InstagramExtractTextArgs,
  apifyToken: string
): Promise<InstagramExtractTextResponse> {
  try {
    // Sanitize URL without HTML encoding (allowHtml: true prevents / → &#x2F;)
    const cleanUrl = sanitizeInput(args.url, {
      allowHtml: true,
      maxLength: VALIDATION_LIMITS.URL_MAX,
    });

    // Basic Instagram URL validation
    if (!cleanUrl.includes("instagram.com") || !cleanUrl.startsWith("https://")) {
      return {
        success: false,
        instagram_url: args.url,
        type: "Unknown",
        caption: "",
        author: {
          username: "Unknown",
          displayName: "Unknown",
        },
        comments: [],
        likesCount: 0,
        commentsCount: 0,
        error: "Invalid Instagram URL provided",
      };
    }

    // Call Apify scraper
    const result = await scrapeInstagramPost(cleanUrl, apifyToken);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      instagram_url: args.url,
      type: "Unknown",
      caption: "",
      author: {
        username: "Unknown",
        displayName: "Unknown",
      },
      comments: [],
      likesCount: 0,
      commentsCount: 0,
      error: `Instagram extraction failed: ${errorMessage}`,
    };
  }
}
