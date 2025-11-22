// Completed task retrieval tools
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const GET_COMPLETED_TASKS_TOOL: Tool = {
  name: "todoist_completed_tasks_get",
  description:
    "Get completed tasks from Todoist with comprehensive filtering options. " +
    "This tool uses the Sync API v9 to retrieve tasks that have been marked as complete. " +
    "Supports filtering by project, labels, completion date, due date, and content search.",
  inputSchema: {
    type: "object",
    properties: {
      project_id: {
        type: "string",
        description:
          "Filter by project ID or project name (optional). If a project name is provided, it will be resolved to an ID.",
      },
      label_id: {
        type: "string",
        description:
          "Filter by label ID or label name (optional). Supports multiple labels separated by commas. " +
          "The @ prefix is optional (e.g., 'urgent' or '@urgent').",
      },
      completed_after: {
        type: "string",
        description:
          "Get tasks completed after this date (optional). Format: YYYY-MM-DD (e.g., '2025-01-01').",
      },
      completed_before: {
        type: "string",
        description:
          "Get tasks completed before this date (optional). Format: YYYY-MM-DD (e.g., '2025-01-31').",
      },
      due_after: {
        type: "string",
        description:
          "Filter by original due date - get tasks that were due after this date (optional). Format: YYYY-MM-DD.",
      },
      due_before: {
        type: "string",
        description:
          "Filter by original due date - get tasks that were due before this date (optional). Format: YYYY-MM-DD.",
      },
      content_contains: {
        type: "string",
        description:
          "Filter by text search in task content or description (optional). Case-insensitive partial matching.",
      },
      limit: {
        type: "number",
        description:
          "Limit the number of results returned (optional). Useful for large result sets. No limit by default.",
      },
    },
    required: [],
  },
};

export const COMPLETED_TASK_TOOLS = [GET_COMPLETED_TASKS_TOOL];
