import type { SyncCompletedTask, SyncAPIResponse } from "../types.js";

const SYNC_API_BASE_URL = "https://api.todoist.com/api/v1";

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
 * Todoist API v1 client for accessing completed tasks
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
   * Retrieves all completed tasks from Todoist API v1
   * Uses annotate_items=true to get full task details including description, labels, due dates, etc.
   */
  async getCompletedTasks(): Promise<SyncCompletedTask[]> {
    try {
      const response = await this.makeRequest<
        SyncAPIResponse<SyncCompletedTask>
      >("/tasks/completed?annotate_items=true");

      return response.items || [];
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
   * Retrieves completed tasks for a specific project
   * @param projectId - Project ID to filter by
   */
  async getCompletedTasksByProject(
    projectId: string
  ): Promise<SyncCompletedTask[]> {
    if (!projectId) {
      throw new Error("Project ID must be provided");
    }

    try {
      const response = await this.makeRequest<
        SyncAPIResponse<SyncCompletedTask>
      >(
        `/tasks/completed?annotate_items=true&project_id=${encodeURIComponent(projectId)}`
      );

      return response.items || [];
    } catch (error) {
      if (error instanceof SyncAPIError) {
        throw error;
      }
      throw new SyncAPIError(
        `Failed to fetch completed tasks by project: ${(error as Error).message}`
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
