import type {
  YoutubeSummarizeArgs,
  YoutubeSummarizeResponse,
} from "../types.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sanitizeInput, VALIDATION_LIMITS } from "../validation.js";

/**
 * Handler for summarizing YouTube videos using Google Gemini API
 * Gemini has built-in YouTube video access and can analyze video content
 *
 * @param args - YouTube summarization arguments containing URL and optional custom prompt
 * @param geminiApiKey - Google Gemini API key from environment
 * @param modelName - Gemini model name to use (e.g., "gemini-3-flash-preview")
 * @returns Video summary or error message
 */
export async function handleYoutubeSummarize(
  args: YoutubeSummarizeArgs,
  geminiApiKey: string,
  modelName: string
): Promise<YoutubeSummarizeResponse> {
  try {
    // Sanitize URL without HTML encoding
    const cleanUrl = sanitizeInput(args.url, {
      allowHtml: true,
      maxLength: VALIDATION_LIMITS.URL_MAX,
    });

    // Basic YouTube URL validation
    if (!cleanUrl.includes("youtube.com") && !cleanUrl.includes("youtu.be")) {
      return {
        success: false,
        youtube_url: args.url,
        summary: "",
        error: "Invalid YouTube URL provided",
      };
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Build prompt - use custom prompt if provided, otherwise use default
    const defaultPrompt = `Provide a concise summary of this video focusing on: main topic and key points, important takeaways, and any actionable insights. Make sure to include specific mentions of products, places, restaurants, recipes, scripts, tools, or technologies mentioned. Also include metadata such as the creator's name, channel name, and video title if available.`;
    const prompt = args.prompt || defaultPrompt;

    // Generate summary using file_data format for YouTube URL
    const result = await model.generateContent([
      {
        fileData: {
          fileUri: cleanUrl,
          mimeType: "video/*",
        },
      },
      { text: prompt },
    ]);
    const summary = result.response.text();

    if (!summary || summary.trim().length === 0) {
      return {
        success: false,
        youtube_url: cleanUrl,
        summary: "",
        error: "Failed to generate summary for this video",
      };
    }

    return {
      success: true,
      youtube_url: cleanUrl,
      summary: summary.trim(),
      prompt: args.prompt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      youtube_url: args.url,
      summary: "",
      error: `YouTube summarization failed: ${errorMessage}`,
    };
  }
}
