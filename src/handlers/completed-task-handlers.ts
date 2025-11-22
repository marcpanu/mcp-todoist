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
 */
function formatCompletedTaskForDisplay(task: SyncCompletedTask): string {
  const priority = fromApiPriority(task.priority);
  const completedDate = new Date(task.completed_at).toLocaleString();
  const dueInfo = task.due?.date ? `\n  Due: ${task.due.date}` : "";
  const priorityInfo = priority ? `\n  Priority: ${priority}` : "";
  const labelsInfo =
    task.labels && task.labels.length > 0
      ? `\n  Labels: ${task.labels.join(", ")}`
      : "";
  const descriptionInfo = task.description
    ? `\n  Description: ${task.description}`
    : "";
  const parentInfo = task.parent_id ? `\n  Parent ID: ${task.parent_id}` : "";

  return `• ${task.content} (ID: ${task.id})
  Completed: ${completedDate}${dueInfo}${priorityInfo}${labelsInfo}${descriptionInfo}${parentInfo}`;
}

/**
 * Filters completed tasks based on search criteria
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

  // Filter by labels
  if (args.label_id) {
    const labelFilters = args.label_id.split(",").map((l) => l.trim());
    filtered = filtered.filter((task) => {
      if (!Array.isArray(task.labels)) return false;
      return labelFilters.some((label) => task.labels!.includes(label));
    });
  }

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

  // Filter by original due date range
  if (args.due_after || args.due_before) {
    filtered = filtered.filter((task) => {
      if (!task.due?.date) return false;
      const dueDate = task.due.date;

      if (args.due_after && dueDate < args.due_after) {
        return false;
      }

      if (args.due_before && dueDate > args.due_before) {
        return false;
      }

      return true;
    });
  }

  // Filter by content/description search
  if (args.content_contains) {
    const searchTerm = args.content_contains.toLowerCase();
    filtered = filtered.filter((task) => {
      const contentMatch = task.content.toLowerCase().includes(searchTerm);
      const descriptionMatch = task.description
        ? task.description.toLowerCase().includes(searchTerm)
        : false;
      return contentMatch || descriptionMatch;
    });
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

    // Resolve label names to actual label names (in case numeric IDs were passed)
    let labelFilter = args.label_id;
    if (labelFilter) {
      const labelIds = labelFilter.split(",").map((l) => l.trim());
      const resolvedLabels: string[] = [];

      const allLabels = await getAllLabels(todoistClient);

      for (const labelId of labelIds) {
        // Remove @ prefix if present
        const cleanLabelId = labelId.startsWith("@")
          ? labelId.substring(1)
          : labelId;

        // Check if it's a numeric ID
        if (/^\d+$/.test(cleanLabelId)) {
          const label = allLabels.find((l) => l.id === cleanLabelId);
          resolvedLabels.push(label ? label.name : cleanLabelId);
        } else {
          resolvedLabels.push(cleanLabelId);
        }
      }

      labelFilter = resolvedLabels.join(",");
    }

    // Create cache key based on filters
    const cacheKey = JSON.stringify({
      project: projectId,
      labels: labelFilter,
      completed_after: args.completed_after,
      completed_before: args.completed_before,
      due_after: args.due_after,
      due_before: args.due_before,
      content: args.content_contains,
      limit: args.limit,
    });

    // Check cache
    let completedTasks = completedTaskCache.get(cacheKey);

    if (!completedTasks) {
      // Fetch from Sync API
      const allCompletedTasks = await syncClient.getCompletedTasks();

      // Apply filters with resolved project and labels
      const filteredArgs: GetCompletedTasksArgs = {
        ...args,
        project_id: projectId,
        label_id: labelFilter,
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
