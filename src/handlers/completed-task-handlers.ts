import { TodoistApi } from "@doist/todoist-api-typescript";
import type { GetCompletedTasksArgs, SyncCompletedTask } from "../types.js";
import { SyncAPIClient } from "../utils/sync-api-client.js";
import { CacheManager } from "../cache.js";
import { ErrorHandler } from "../utils/error-handling.js";
import {
  validateDateString,
  validateLimit,
  validateProjectId,
} from "../validation.js";
import { resolveProjectIdentifier } from "../utils/api-helpers.js";
import { fromApiPriority } from "../utils/priority-mapper.js";

// Get centralized cache manager and register completed tasks cache
const cacheManager = CacheManager.getInstance();
const completedTaskCache = cacheManager.getOrCreateCache<SyncCompletedTask[]>(
  "completed_tasks",
  60000, // 60 second TTL (longer than active tasks since completed tasks change less frequently)
  {
    maxSize: 500,
    enableStats: true,
    enableAccessTracking: true,
  }
);

/**
 * Helper function to get all labels (for label name resolution)
 */
async function getAllLabels(
  todoistClient: TodoistApi
): Promise<{ id: string; name: string }[]> {
  const labelCache = cacheManager.getOrCreateCache<
    { id: string; name: string }[]
  >("labels", 30000);
  const cacheKey = "all_labels";

  let labels = labelCache.get(cacheKey);
  if (!labels) {
    const response = await todoistClient.getLabels();
    labels = Array.isArray(response) ? response : [];
    labelCache.set(cacheKey, labels);
  }

  return labels || [];
}

/**
 * Formats a completed task for display
 * Note: Sync API returns minimal fields - just content, completion time, and IDs
 */
function formatCompletedTaskForDisplay(task: SyncCompletedTask): string {
  const completedDate = new Date(task.completed_at).toLocaleString();
  const sectionInfo = task.section_id
    ? `\n  Section ID: ${task.section_id}`
    : "";

  return `• ${task.content}
  Task ID: ${task.task_id}
  Completed: ${completedDate}
  Project ID: ${task.project_id}${sectionInfo}`;
}

/**
 * Filters completed tasks based on search criteria
 * Note: Sync API returns limited fields, so some filters are not available
 */
function filterCompletedTasks(
  tasks: SyncCompletedTask[],
  args: GetCompletedTasksArgs
): SyncCompletedTask[] {
  let filtered = tasks;

  // Filter by project
  if (args.project_id) {
    filtered = filtered.filter((task) => task.project_id === args.project_id);
  }

  // Note: label_id filtering is not available - Sync API doesn't return labels
  // Note: due date filtering is not available - Sync API doesn't return original due dates

  // Filter by completion date range
  if (args.completed_after || args.completed_before) {
    filtered = filtered.filter((task) => {
      const completedDate = task.completed_at.split("T")[0]; // Extract YYYY-MM-DD

      if (args.completed_after && completedDate < args.completed_after) {
        return false;
      }

      if (args.completed_before && completedDate > args.completed_before) {
        return false;
      }

      return true;
    });
  }

  // Filter by content search only (no description available)
  if (args.content_contains) {
    const searchTerm = args.content_contains.toLowerCase();
    filtered = filtered.filter((task) =>
      task.content.toLowerCase().includes(searchTerm)
    );
  }

  // Apply limit
  if (args.limit && args.limit > 0) {
    filtered = filtered.slice(0, args.limit);
  }

  return filtered;
}

/**
 * Handles retrieval of completed tasks from Sync API with comprehensive filtering
 */
export async function handleGetCompletedTasks(
  todoistClient: TodoistApi,
  syncClient: SyncAPIClient,
  args: GetCompletedTasksArgs
): Promise<string> {
  return ErrorHandler.wrapAsync("get completed tasks", async () => {
    // Validate input
    validateProjectId(args.project_id);
    validateDateString(args.completed_after, "completed_after");
    validateDateString(args.completed_before, "completed_before");
    validateDateString(args.due_after, "due_after");
    validateDateString(args.due_before, "due_before");
    validateLimit(args.limit);

    // Resolve project name to ID if needed
    let projectId = args.project_id;
    if (projectId && !/^\d+$/.test(projectId)) {
      // It's a project name, resolve to ID
      try {
        projectId = await resolveProjectIdentifier(todoistClient, projectId);
      } catch {
        return `Project "${args.project_id}" not found`;
      }
    }

    // Note: Label filtering is not supported by Sync API (doesn't return label data)
    // Note: Due date filtering is not supported by Sync API (doesn't return original due dates)

    // Create cache key based on available filters
    const cacheKey = JSON.stringify({
      project: projectId,
      completed_after: args.completed_after,
      completed_before: args.completed_before,
      content: args.content_contains,
      limit: args.limit,
    });

    // Check cache
    let completedTasks = completedTaskCache.get(cacheKey);

    if (!completedTasks) {
      // Fetch from Sync API
      const allCompletedTasks = await syncClient.getCompletedTasks();

      // Apply filters with resolved project
      const filteredArgs: GetCompletedTasksArgs = {
        ...args,
        project_id: projectId,
      };

      completedTasks = filterCompletedTasks(allCompletedTasks, filteredArgs);

      // Cache the results
      completedTaskCache.set(cacheKey, completedTasks);
    }

    if (completedTasks.length === 0) {
      return "No completed tasks found matching the criteria";
    }

    const taskList = completedTasks
      .map((task) => formatCompletedTaskForDisplay(task))
      .join("\n\n");

    const taskWord = completedTasks.length === 1 ? "task" : "tasks";
    return `Found ${completedTasks.length} completed ${taskWord}:\n\n${taskList}`;
  });
}
