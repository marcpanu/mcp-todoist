/**
 * Shared API utilities for handling Todoist API responses and common operations
 */

import { TodoistTaskDueData } from "../types.js";
import { formatDueDetails } from "./datetime-utils.js";
import { fromApiPriority } from "./priority-mapper.js";

/**
 * Generic interface for Todoist API responses that may return data in different formats
 */
export interface TodoistAPIResponse<T> {
  results?: T[];
  data?: T[];
}

/**
 * Extracts array data from various Todoist API response formats.
 * Handles both direct arrays and object responses with 'results' or 'data' properties.
 *
 * @param result - The API response which could be an array or an object containing arrays
 * @returns Array of items of type T, or empty array if no data found
 *
 * @example
 * ```typescript
 * const tasks = extractArrayFromResponse<TodoistTask>(apiResponse);
 * const comments = extractArrayFromResponse<TodoistComment>(commentResponse);
 * ```
 */
export function extractArrayFromResponse<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  const responseObj = result as TodoistAPIResponse<T>;
  return responseObj?.results || responseObj?.data || [];
}

/**
 * Interface for comment response data from Todoist API
 */
export interface CommentResponse {
  content: string;
  attachment?: {
    fileName: string;
    fileType: string;
  };
  postedAt?: string;
  taskId?: string;
  projectId?: string;
}

/**
 * Interface for comment creation data
 */
export interface CommentCreationData {
  content: string;
  taskId: string;
  attachment?: {
    fileName: string;
    fileUrl: string;
    fileType: string;
  };
}

/**
 * Validates that a response object has the expected structure
 *
 * @param response - The API response to validate
 * @param expectedFields - Array of field names that should exist in the response
 * @returns boolean indicating if the response is valid
 */
export function validateApiResponse(
  response: unknown,
  expectedFields: string[]
): boolean {
  if (!response || typeof response !== "object") {
    return false;
  }

  const obj = response as Record<string, unknown>;
  return expectedFields.every((field) => field in obj);
}

/**
 * Creates a cache key from an object by serializing its properties
 *
 * @param prefix - Prefix for the cache key
 * @param params - Object containing parameters to include in the key
 * @returns Standardized cache key string
 */
export function createCacheKey(
  prefix: string,
  params: Record<string, unknown> = {}
): string {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null
    )
  );
  return `${prefix}_${JSON.stringify(cleanParams)}`;
}

/**
 * Formats a Todoist task for display in responses
 *
 * @param task - The task object to format
 * @param projectName - Optional project name to display with ID
 * @param sectionName - Optional section name to display with ID
 * @param parentTaskName - Optional parent task name to display with ID
 * @returns Formatted string representation of the task
 */
export function formatTaskForDisplay(
  task: {
    id?: string;
    content: string;
    description?: string;
    due?: { string: string } | null;
    deadline?: { date: string } | null;
    priority?: number;
    labels?: string[];
    projectId?: string;
    sectionId?: string | null;
    parentId?: string | null;
  },
  projectName?: string | null,
  sectionName?: string | null,
  parentTaskName?: string | null
): string {
  const displayPriority = fromApiPriority(task.priority);
  const dueDetails = formatDueDetails(
    task.due as TodoistTaskDueData | null | undefined
  );

  // Format project display
  let projectDisplay = "";
  if (task.projectId) {
    const name = projectName || "Unknown";
    projectDisplay = `\n  Project: ${name} (${task.projectId})`;
  }

  // Format section display
  let sectionDisplay = "";
  if (task.sectionId) {
    const name = sectionName || "Unknown";
    sectionDisplay = `\n  Section: ${name} (${task.sectionId})`;
  }

  // Format parent task display
  let parentDisplay = "";
  if (task.parentId) {
    const name = parentTaskName || "Unknown";
    parentDisplay = `\n  Parent Task: ${name} (${task.parentId})`;
  }

  return `- ${task.content}${task.id ? ` (ID: ${task.id})` : ""}${
    task.description ? `\n  Description: ${task.description}` : ""
  }${dueDetails ? `\n  Due: ${dueDetails}` : ""}${
    task.deadline ? `\n  Deadline: ${task.deadline.date}` : ""
  }${displayPriority ? `\n  Priority: ${displayPriority}` : ""}${
    task.labels && task.labels.length > 0
      ? `\n  Labels: ${task.labels.join(", ")}`
      : ""
  }${projectDisplay}${sectionDisplay}${parentDisplay}`;
}

/**
 * Safely extracts string value from unknown input
 *
 * @param value - The value to extract as string
 * @param defaultValue - Default value if extraction fails
 * @returns String value or default
 */
export function safeStringExtract(value: unknown, defaultValue = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (value != null) {
    return String(value);
  }
  return defaultValue;
}

/**
 * Safely extracts number value from unknown input
 *
 * @param value - The value to extract as number
 * @param defaultValue - Default value if extraction fails
 * @returns Number value or default
 */
export function safeNumberExtract(value: unknown, defaultValue = 0): number {
  if (typeof value === "number" && !isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Resolves a project identifier to a project ID.
 * If the input is already a valid project ID, returns it as-is.
 * If the input is a project name, searches for the project and returns its ID.
 *
 * @param todoistClient - The Todoist API client
 * @param projectIdentifier - Either a project ID or project name
 * @returns The resolved project ID
 * @throws Error if project name is not found
 */
export async function resolveProjectIdentifier(
  todoistClient: { getProjects: () => Promise<unknown> },
  projectIdentifier: string
): Promise<string> {
  if (!projectIdentifier || projectIdentifier.trim().length === 0) {
    throw new Error("Project identifier cannot be empty");
  }

  // First, try to get all projects
  const result = await todoistClient.getProjects();
  const projects = extractArrayFromResponse<{ id: string; name: string }>(
    result
  );

  // Check if the identifier matches a project ID exactly
  const projectById = projects.find((p) => p.id === projectIdentifier);
  if (projectById) {
    return projectById.id;
  }

  // Try to find by name (case-insensitive)
  const projectByName = projects.find(
    (p) => p.name.toLowerCase() === projectIdentifier.toLowerCase()
  );

  if (projectByName) {
    return projectByName.id;
  }

  // If not found, throw an error
  throw new Error(`Project not found: "${projectIdentifier}"`);
}

/**
 * Builds a map of project IDs to project names
 * Fetches all projects across all pages
 *
 * @param todoistClient - The Todoist API client
 * @returns Map of project ID to project name
 */
export async function buildProjectIdToNameMap(
  todoistClient: { getProjects: (args?: any) => Promise<unknown> }
): Promise<Map<string, string>> {
  const projectMap = new Map<string, string>();
  let cursor: string | null = null;

  // Fetch all pages of projects
  do {
    const result = await todoistClient.getProjects(cursor ? { cursor } : {});
    const response = result as {
      results?: any[];
      nextCursor?: string | null;
    };

    const projects = response.results || [];
    for (const project of projects) {
      if (project.id && project.name) {
        projectMap.set(project.id, project.name);
      }
    }

    cursor = response.nextCursor || null;
  } while (cursor);

  return projectMap;
}

/**
 * Builds a map of section IDs to section names
 * Fetches all sections across all pages
 *
 * @param todoistClient - The Todoist API client
 * @returns Map of section ID to section name
 */
export async function buildSectionIdToNameMap(
  todoistClient: { getSections: (args: any) => Promise<unknown> }
): Promise<Map<string, string>> {
  const sectionMap = new Map<string, string>();
  let cursor: string | null = null;

  // Fetch all pages of sections
  do {
    const result = await todoistClient.getSections(
      cursor ? { projectId: null, cursor } : { projectId: null }
    );
    const response = result as {
      results?: any[];
      nextCursor?: string | null;
    };

    const sections = response.results || [];
    for (const section of sections) {
      if (section.id && section.name) {
        sectionMap.set(section.id, section.name);
      }
    }

    cursor = response.nextCursor || null;
  } while (cursor);

  return sectionMap;
}

/**
 * Builds a map of task IDs to task content (names)
 * Fetches all tasks across all pages
 *
 * @param todoistClient - The Todoist API client
 * @returns Map of task ID to task content
 */
export async function buildTaskIdToNameMap(
  todoistClient: { getTasks: (args?: any) => Promise<unknown> }
): Promise<Map<string, string>> {
  const taskMap = new Map<string, string>();
  let cursor: string | null = null;

  // Fetch all pages of tasks
  do {
    const result = await todoistClient.getTasks(cursor ? { cursor } : {});
    const response = result as { results?: any[]; nextCursor?: string | null };

    const tasks = response.results || [];
    for (const task of tasks) {
      if (task.id && task.content) {
        taskMap.set(task.id, task.content);
      }
    }

    cursor = response.nextCursor || null;
  } while (cursor);

  return taskMap;
}
