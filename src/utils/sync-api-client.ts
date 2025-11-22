import type { SyncCompletedTask, SyncAPIResponse } from "../types.js";

const SYNC_API_BASE_URL = "https://api.todoist.com/sync/v9";

/**
 * Error class for Sync API specific errors
 */
export class SyncAPIError extends Error {
  public statusCode?: number;
  public responseBody?: string;

  constructor(message: string, statusCode?: number, responseBody?: string) {
    super(message);
    this.name = "SyncAPIError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/**
 * Sync API Client for accessing completed tasks via Todoist Sync API v9
 * Uses native fetch for HTTP requests (Node.js 18+)
 */
export class SyncAPIClient {
  private apiToken: string;

  constructor(apiToken: string) {
    if (!apiToken) {
      throw new Error("API token is required for SyncAPIClient");
    }
    this.apiToken = apiToken;
  }

  /**
   * Makes authenticated HTTP request to Sync API
   */
  private async makeRequest<T>(
    endpoint: string,
    method: string = "GET"
  ): Promise<T> {
    const url = `${SYNC_API_BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new SyncAPIError(
          `Sync API request failed: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      if (error instanceof SyncAPIError) {
        throw error;
      }

      // Handle network errors or JSON parsing errors
      throw new SyncAPIError(
        `Failed to connect to Sync API: ${(error as Error).message}`
      );
    }
  }

  /**
   * Retrieves all completed tasks from Sync API
   * Returns tasks with checked: true and is_deleted: false
   */
  async getCompletedTasks(): Promise<SyncCompletedTask[]> {
    try {
      const response =
        await this.makeRequest<SyncAPIResponse<SyncCompletedTask>>(
          "/completed/get_all"
        );

      // Extract items array from response
      const items = response.items || [];

      // Filter out deleted items and ensure they're actually completed
      const completedTasks = items.filter(
        (task) => task.checked && !task.is_deleted
      );

      return completedTasks;
    } catch (error) {
      if (error instanceof SyncAPIError) {
        throw error;
      }
      throw new SyncAPIError(
        `Failed to fetch completed tasks: ${(error as Error).message}`
      );
    }
  }

  /**
   * Retrieves completed tasks for specific parent task/project IDs
   * @param parentIds - Array of parent task or project IDs
   */
  async getCompletedTasksByIds(
    parentIds: string[]
  ): Promise<SyncCompletedTask[]> {
    if (!parentIds || parentIds.length === 0) {
      throw new Error("At least one parent ID must be provided");
    }

    try {
      // The Sync API endpoint expects IDs as query parameters
      const idsParam = parentIds.join(",");
      const response = await this.makeRequest<
        SyncAPIResponse<SyncCompletedTask>
      >(`/completed/get_by_ids?ids=${encodeURIComponent(idsParam)}`);

      const items = response.items || [];

      // Filter out deleted items
      const completedTasks = items.filter(
        (task) => task.checked && !task.is_deleted
      );

      return completedTasks;
    } catch (error) {
      if (error instanceof SyncAPIError) {
        throw error;
      }
      throw new SyncAPIError(
        `Failed to fetch completed tasks by IDs: ${(error as Error).message}`
      );
    }
  }
}

/**
 * Factory function to create SyncAPIClient instance
 * @param apiToken - Todoist API token
 */
export function createSyncAPIClient(apiToken: string): SyncAPIClient {
  return new SyncAPIClient(apiToken);
}
