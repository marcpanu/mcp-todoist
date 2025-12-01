// Instagram content extraction tools
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const INSTAGRAM_EXTRACT_TEXT_TOOL: Tool = {
  name: "todoist_instagram_extract_text",
  description:
    "Extract text content (caption, comments, metadata) from an Instagram post URL using Apify Instagram Scraper. Returns post type, caption, author info, comments (up to 50), likes/comments count, and video information if applicable.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "Instagram post URL (e.g., https://www.instagram.com/p/.../ or https://www.instagram.com/reel/.../)",
      },
    },
    required: ["url"],
  },
};

export const TRANSCRIBE_VIDEO_TOOL: Tool = {
  name: "todoist_transcribe_video",
  description:
    "Transcribe audio/video content from a video URL (e.g., Instagram video URL) using OpenAI Whisper API. Downloads the video file and returns the transcribed text. Supports videos up to 25MB in formats: m4a, mp3, webm, mp4, mpga, wav, mpeg.",
  inputSchema: {
    type: "object",
    properties: {
      video_url: {
        type: "string",
        description:
          "Direct URL to the video file (e.g., https://scontent-ord5-1.cdninstagram.com/...)",
      },
    },
    required: ["video_url"],
  },
};

export const INSTAGRAM_TOOLS = [
  INSTAGRAM_EXTRACT_TEXT_TOOL,
  TRANSCRIBE_VIDEO_TOOL,
];
