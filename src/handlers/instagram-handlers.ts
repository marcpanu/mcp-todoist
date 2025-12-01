import type {
  InstagramExtractTextArgs,
  InstagramExtractTextResponse,
  TranscribeVideoArgs,
  TranscribeVideoResponse,
} from "../types.js";
import { scrapeInstagramPost } from "../utils/apify-client.js";
import { downloadAndTranscribe } from "../utils/openai-client.js";
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
    if (
      !cleanUrl.includes("instagram.com") ||
      !cleanUrl.startsWith("https://")
    ) {
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

/**
 * Handler for transcribing video content from Instagram posts
 * Downloads video from URL and transcribes using OpenAI Whisper API
 *
 * @param args - Video transcription arguments containing video URL
 * @param openaiToken - OpenAI API token from environment
 * @returns Transcription text or error message
 */
export async function handleTranscribeVideo(
  args: TranscribeVideoArgs,
  openaiToken: string
): Promise<TranscribeVideoResponse> {
  try {
    // Sanitize URL without HTML encoding
    const cleanUrl = sanitizeInput(args.video_url, {
      allowHtml: true,
      maxLength: VALIDATION_LIMITS.URL_MAX,
    });

    // Basic URL validation
    if (!cleanUrl.startsWith("https://")) {
      return {
        success: false,
        video_url: args.video_url,
        transcription: "",
        error: "Invalid video URL - must start with https://",
      };
    }

    // Download and transcribe
    const transcription = await downloadAndTranscribe(cleanUrl, openaiToken);

    return {
      success: true,
      video_url: cleanUrl,
      transcription,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      video_url: args.video_url,
      transcription: "",
      error: `Video transcription failed: ${errorMessage}`,
    };
  }
}
