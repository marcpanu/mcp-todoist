// YouTube video summarization tools
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const YOUTUBE_SUMMARIZE_TOOL: Tool = {
  name: "todoist_youtube_summarize",
  description:
    "Summarize a YouTube video using Google Gemini API. Gemini has built-in access to YouTube transcripts and can provide concise summaries of video content. Returns a text summary of the video's main points.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "YouTube video URL (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)",
      },
      prompt: {
        type: "string",
        description:
          "Optional custom prompt for summarization. If not provided, will generate a general summary of the video content.",
      },
    },
    required: ["url"],
  },
};

export const YOUTUBE_TOOLS = [YOUTUBE_SUMMARIZE_TOOL];
