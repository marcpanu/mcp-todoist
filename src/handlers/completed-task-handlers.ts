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
import {
  resolveProjectIdentifier,
  buildProjectIdToNameMap,
  buildSectionIdToNameMap,
  buildTaskIdToNameMap,
} from "../utils/api-helpers.js";

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
 * Formats a completed task for display with full metadata from item_object
 * With annotate_items=true, includes description, labels, due dates, priority, and parent task
 */
function formatCompletedTaskForDisplay(
  task: SyncCompletedTask,
  projectName?: string | null,
  sectionName?: string | null,
  parentTaskName?: string | null
): string {
  const completedDate = new Date(task.completed_at).toLocaleString();
  const item = task.item_object;

  const projectDisplayName = projectName || "Unknown";
  const projectInfo = `\n  Project: ${projectDisplayName} (${task.project_id})`;

  let sectionInfo = "";
  if (task.section_id) {
    const sectionDisplayName = sectionName || "Unknown";
    sectionInfo = `\n  Section: ${sectionDisplayName} (${task.section_id})`;
  }

  const descriptionInfo = item?.description
    ? `\n  Description: ${item.description}`
    : "";

  const priorityMap: { [key: number]: string } = {
    4: "P1 (Highest)",
    3: "P2",
    2: "P3",
    1: "P4 (Lowest)",
  };
  const priorityInfo = item?.priority
    ? `\n  Priority: ${priorityMap[item.priority]}`
    : "";

  const labelsInfo =
    item?.labels && item.labels.length > 0
      ? `\n  Labels: ${item.labels.join(", ")}`
      : "";

  const dueInfo = item?.due
    ? `\n  Due Date: ${item.due.string} (${item.due.date})${item.due.is_recurring ? " [Recurring]" : ""}`
    : "";

  const parentInfo = item?.parent_id
    ? `\n  Parent Task: ${parentTaskName || "Unknown"} (${item.parent_id})`
    : "";

  return `• ${task.content}
  Task ID: ${task.task_id}
  Completed: ${completedDate}${projectInfo}${sectionInfo}${descriptionInfo}${priorityInfo}${labelsInfo}${dueInfo}${parentInfo}`;
}

/**
 * Filters completed tasks based on search criteria
 */
function filterCompletedTasks(
  tasks: SyncCompletedTask[],
  args: GetCompletedTasksArgs
): SyncCompletedTask[] {
  let filtered = tasks;

  if (args.project_id) {
    filtered = filtered.filter((task) => task.project_id === args.project_id);
  }

  // Filter by labels
  if (args.label_id) {
    const labelNames = args.label_id
      .split(",")
      .map((l) => l.trim().replace(/^@/, ""));
    filtered = filtered.filter((task) => {
      const taskLabels = task.item_object?.labels || [];
      return labelNames.some((label) => taskLabels.includes(label));
    });
  }

  // Filter by original due date range
  if (args.due_after || args.due_before) {
    filtered = filtered.filter((task) => {
      const dueDate = task.item_object?.due?.date;
      if (!dueDate) return false;

      if (args.due_after && dueDate < args.due_after) return false;
      if (args.due_before && dueDate > args.due_before) return false;

      return true;
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

  // Filter by content or description search
  if (args.content_contains) {
    const searchTerm = args.content_contains.toLowerCase();
    filtered = filtered.filter(
      (task) =>
        task.content.toLowerCase().includes(searchTerm) ||
        task.item_object?.description?.toLowerCase().includes(searchTerm)
    );
  }

  // Apply limit
  if (args.limit && args.limit > 0) {
    filtered = filtered.slice(0, args.limit);
  }

  return filtered;
}

/**
 * Handles retrieval of completed tasks with comprehensive filtering
 */
export async function handleGetCompletedTasks(
  todoistClient: TodoistApi,
  syncClient: SyncAPIClient,
  args: GetCompletedTasksArgs
): Promise<string> {
  return ErrorHandler.wrapAsync("get completed tasks", async () => {
    validateProjectId(args.project_id);
    validateDateString(args.completed_after, "completed_after");
    validateDateString(args.completed_before, "completed_before");
    validateDateString(args.due_after, "due_after");
    validateDateString(args.due_before, "due_before");
    validateLimit(args.limit);

    let projectId = args.project_id;
    if (projectId && !/^\d+$/.test(projectId)) {
      try {
        projectId = await resolveProjectIdentifier(todoistClient, projectId);
      } catch {
        return `Project "${args.project_id}" not found`;
      }
    }

    const cacheKey = JSON.stringify({
      project: projectId,
      label: args.label_id,
      completed_after: args.completed_after,
      completed_before: args.completed_before,
      due_after: args.due_after,
      due_before: args.due_before,
      content: args.content_contains,
      limit: args.limit,
    });

    let completedTasks = completedTaskCache.get(cacheKey);

    if (!completedTasks) {
      const allCompletedTasks = await syncClient.getCompletedTasks();

      const filteredArgs: GetCompletedTasksArgs = {
        ...args,
        project_id: projectId,
      };

      completedTasks = filterCompletedTasks(allCompletedTasks, filteredArgs);

      completedTaskCache.set(cacheKey, completedTasks);
    }

    if (completedTasks.length === 0) {
      return "No completed tasks found matching the criteria";
    }

    // Lazy-load name maps only if needed
    let projectMap: Map<string, string> | null = null;
    let sectionMap: Map<string, string> | null = null;
    let taskMap: Map<string, string> | null = null;

    const hasProjectIds = completedTasks.some((task) => task.project_id);
    const hasSectionIds = completedTasks.some((task) => task.section_id);
    const hasParentIds = completedTasks.some(
      (task) => task.item_object?.parent_id
    );

    if (hasProjectIds) {
      projectMap = await buildProjectIdToNameMap(todoistClient);
    }
    if (hasSectionIds) {
      sectionMap = await buildSectionIdToNameMap(todoistClient);
    }
    if (hasParentIds) {
      taskMap = await buildTaskIdToNameMap(todoistClient);
    }

    const taskList = completedTasks
      .map((task) => {
        const projectName =
          task.project_id && projectMap
            ? projectMap.get(task.project_id) || null
            : null;
        const sectionName =
          task.section_id && sectionMap
            ? sectionMap.get(task.section_id) || null
            : null;
        const parentTaskName =
          task.item_object?.parent_id && taskMap
            ? taskMap.get(task.item_object.parent_id) || null
            : null;
        return formatCompletedTaskForDisplay(
          task,
          projectName,
          sectionName,
          parentTaskName
        );
      })
      .join("\n\n");

    const taskWord = completedTasks.length === 1 ? "task" : "tasks";
    return `Found ${completedTasks.length} completed ${taskWord}:\n\n${taskList}`;
  });
}
