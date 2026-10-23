"use client";

import { useAuthStore } from "@/stores/auth-store";
import type { CurrentUser } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function parse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new ApiError(message || "Request failed", response.status);
  }
  return body;
}

let pendingRefresh: Promise<string> | undefined;
export function refreshSession(): Promise<string> {
  if (!pendingRefresh) {
    pendingRefresh = (async () => {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await parse(response)) as {
        accessToken: string;
        user: CurrentUser;
      };
      useAuthStore.getState().setSession(data.accessToken, data.user);
      return data.accessToken;
    })().finally(() => {
      pendingRefresh = undefined;
    });
  }
  return pendingRefresh;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  let token = useAuthStore.getState().accessToken;
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    try {
      token = await refreshSession();
      headers.set("Authorization", `Bearer ${token}`);
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status))
        useAuthStore.getState().clear();
      else throw error;
    }
  }
  return parse(response) as Promise<T>;
}

export { API_URL };
