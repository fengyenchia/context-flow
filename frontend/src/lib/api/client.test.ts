import { afterEach, expect, it, vi } from "vitest";
import { refreshSession } from "./client";

const { setSession } = vi.hoisted(() => ({ setSession: vi.fn() }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: { getState: () => ({ setSession }) },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shares concurrent refresh calls instead of rotating the same cookie repeatedly", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ accessToken: "new-token", user: { id: "user" } }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  expect(
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]),
  ).toEqual(["new-token", "new-token", "new-token"]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(setSession).toHaveBeenCalledTimes(1);
});

it("allows retry after a failed refresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 503 })),
  );
  await expect(refreshSession()).rejects.toThrow();
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ accessToken: "retry", user: {} }), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(refreshSession()).resolves.toBe("retry");
  expect(fetch).toHaveBeenCalledTimes(1);
});
