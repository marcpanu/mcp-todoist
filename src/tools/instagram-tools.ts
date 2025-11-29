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

export const INSTAGRAM_TOOLS = [INSTAGRAM_EXTRACT_TEXT_TOOL];
