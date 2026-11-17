import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  apifyRequest,
  downloadImage,
  fetchActorItems,
  fetchDatasetItems,
  firstValue,
  readApifyToken,
  readLimitArg,
  readSocialUrl,
  runActor,
  saveFetchedPosts,
  toIsoString,
  writeRecordIfChanged,
} from "#scripts/lib/apify.js";
import { logSocialFetch } from "#scripts/lib/social-fetch.js";
import { withTempDir, withTempDirAsync } from "#test/test-utils.js";

const jsonResponse = (value) => new Response(JSON.stringify(value));

const fetchReturning = (...values) => {
  const responses = [...values];
  return vi.fn(async () => {
    const value = responses.shift();
    return value instanceof Response ? value : jsonResponse(value);
  });
};

const withArgv = (args, callback) => {
  const original = process.argv;
  process.argv = ["node", "script", ...args];
  try {
    return callback();
  } finally {
    process.argv = original;
  }
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("apifyRequest", () => {
  test("unwraps data envelopes and raw values", async () => {
    const fetchFn = fetchReturning(
      jsonResponse([1, 2]),
      jsonResponse({ data: { id: "run" } }),
      jsonResponse({ plain: true }),
    );

    await expect(
      apifyRequest({ method: "GET", endpoint: "/one", token: "t", fetchFn }),
    ).resolves.toEqual([1, 2]);
    await expect(
      apifyRequest({ method: "GET", endpoint: "/two", token: "t", fetchFn }),
    ).resolves.toEqual({ id: "run" });
    await expect(
      apifyRequest({ method: "GET", endpoint: "/three", token: "t", fetchFn }),
    ).resolves.toEqual({ plain: true });
  });

  test("throws the response body on a failed request", async () => {
    const fetchFn = fetchReturning(
      new Response("bad request", { status: 400 }),
    );

    await expect(
      apifyRequest({ method: "POST", endpoint: "/bad", token: "t", fetchFn }),
    ).rejects.toThrow("Apify POST /bad failed: HTTP 400: bad request");
  });
});

describe("readApifyToken", () => {
  test("uses APIFY_API_KEY first", () => {
    vi.stubEnv("APIFY_API_KEY", "key");
    vi.stubEnv("APIFY_API_TOKEN", "token");

    expect(readApifyToken()).toBe("key");
  });

  test("falls back to APIFY_API_TOKEN", () => {
    vi.stubEnv("APIFY_API_KEY", "");
    vi.stubEnv("APIFY_API_TOKEN", "token");

    expect(readApifyToken()).toBe("token");
  });

  test("throws when neither is set", () => {
    vi.stubEnv("APIFY_API_KEY", "");
    vi.stubEnv("APIFY_API_TOKEN", "");

    expect(() => readApifyToken()).toThrow("APIFY_API_KEY or APIFY_API_TOKEN");
  });
});

describe("readSocialUrl", () => {
  test("reads a platform URL from the site config", () => {
    expect(
      readSocialUrl(
        { socials: { Instagram: "https://instagram.com/a" } },
        "Instagram",
      ),
    ).toBe("https://instagram.com/a");
  });

  test("throws when the platform URL is missing", () => {
    expect(() => readSocialUrl({ socials: {} }, "Facebook")).toThrow(
      "socials.Facebook is missing",
    );
  });
});

describe("fetchActorItems", () => {
  /** Fetch an actor's items, answering its requests with `responses`. */
  const fetchItemsAnswering = (...responses) => {
    const fetchFn = fetchReturning({ data: { id: "run-1" } }, ...responses);
    const items = fetchActorItems({
      token: "t",
      actorId: "actor",
      input: {},
      fetchFn,
    });
    return { fetchFn, items };
  };

  test("runs the actor and returns its dataset items", async () => {
    const { fetchFn, items } = fetchItemsAnswering(
      { data: { id: "run-1", status: "SUCCEEDED", defaultDatasetId: "ds-1" } },
      [{ id: 1 }],
    );

    await expect(items).resolves.toEqual([{ id: 1 }]);
    expect(String(fetchFn.mock.calls[0][0])).toContain("/acts/actor/runs?");
    expect(String(fetchFn.mock.calls[2][0])).toContain("/datasets/ds-1/items");
  });

  test("throws when the finished run has no dataset", async () => {
    const { items } = fetchItemsAnswering({
      data: { id: "run-1", status: "SUCCEEDED" },
    });

    await expect(items).rejects.toThrow("Apify run run-1 has no dataset id");
  });
});

describe("runActor", () => {
  test("polls until the run succeeds", async () => {
    const fetchFn = fetchReturning(
      { data: { id: "run-1" } },
      { data: { status: "RUNNING" } },
      { data: { status: "SUCCEEDED", id: "run-1" } },
    );

    await expect(
      runActor({
        token: "t",
        actorId: "actor",
        input: {},
        fetchFn,
        pollMs: 0,
      }),
    ).resolves.toEqual({ status: "SUCCEEDED", id: "run-1" });
  });

  test("throws when the run finishes unsuccessfully", async () => {
    const fetchFn = fetchReturning(
      { data: { id: "run-1" } },
      { data: { status: "FAILED" } },
    );

    await expect(
      runActor({ token: "t", actorId: "actor", input: {}, fetchFn }),
    ).rejects.toThrow("finished FAILED");
  });

  test("throws when the run times out", async () => {
    const fetchFn = fetchReturning(
      { data: { id: "run-1" } },
      { data: { status: "RUNNING" } },
    );

    await expect(
      runActor({
        token: "t",
        actorId: "actor",
        input: {},
        fetchFn,
        timeoutMs: -1,
      }),
    ).rejects.toThrow("still RUNNING");
  });

  test("throws when Apify returns no run id", async () => {
    const fetchFn = fetchReturning({ data: {} });

    await expect(
      runActor({ token: "t", actorId: "actor", input: {}, fetchFn }),
    ).rejects.toThrow("did not return a run id");
  });
});

describe("fetchDatasetItems", () => {
  test("pages through a full dataset", async () => {
    const fullPage = Array.from({ length: 500 }, (_value, index) => ({
      index,
    }));
    const fetchFn = fetchReturning(fullPage, [{ index: 500 }]);

    const items = await fetchDatasetItems({
      token: "t",
      datasetId: "dataset",
      fetchFn,
    });

    expect(items).toHaveLength(501);
    expect(items[500]).toEqual({ index: 500 });
  });

  test("rejects a non-array dataset page", async () => {
    const fetchFn = fetchReturning({ data: "not a page" });

    await expect(
      fetchDatasetItems({ token: "t", datasetId: "dataset", fetchFn }),
    ).rejects.toThrow("non-array dataset page");
  });
});

describe("toIsoString", () => {
  test("accepts seconds and milliseconds", () => {
    expect(toIsoString(1735819200)).toBe("2025-01-02T12:00:00.000Z");
    expect(toIsoString(1735819200000)).toBe("2025-01-02T12:00:00.000Z");
  });

  test("throws for an invalid date", () => {
    expect(() => toIsoString("not-a-date")).toThrow("Invalid social post date");
  });
});

describe("downloadImage", () => {
  test("skips an image that already exists", async () =>
    withTempDirAsync("apify-image-exists", async (dir) => {
      const filePath = join(dir, "photo.jpg");
      writeFileSync(filePath, "existing");
      const fetchFn = vi.fn();

      await downloadImage(
        fetchFn,
        "https://cdn.example.com/photo.jpg",
        filePath,
      );

      expect(fetchFn).not.toHaveBeenCalled();
      expect(readFileSync(filePath, "utf8")).toBe("existing");
    }));

  test("writes a downloaded image", async () =>
    withTempDirAsync("apify-image-download", async (dir) => {
      const filePath = join(dir, "photo.jpg");
      const fetchFn = fetchReturning(new Response(new Uint8Array([1, 2, 3])));

      await downloadImage(
        fetchFn,
        "https://cdn.example.com/photo.jpg",
        filePath,
      );

      expect([...readFileSync(filePath)]).toEqual([1, 2, 3]);
    }));

  test("throws for a failed image response", async () =>
    withTempDirAsync("apify-image-failure", async (dir) => {
      const fetchFn = fetchReturning(new Response("missing", { status: 404 }));

      await expect(
        downloadImage(
          fetchFn,
          "https://cdn.example.com/photo.jpg",
          join(dir, "photo.jpg"),
        ),
      ).rejects.toThrow("Image HTTP 404");
    }));
});

describe("record helpers", () => {
  test("writeRecordIfChanged writes only when the JSON differs", () =>
    withTempDir("apify-record", (dir) => {
      const jsonPath = join(dir, "record.json");

      expect(writeRecordIfChanged(jsonPath, { id: 1 })).toBe(true);
      expect(writeRecordIfChanged(jsonPath, { id: 1 })).toBe(false);
      expect(writeRecordIfChanged(jsonPath, { id: 2 })).toBe(true);
    }));

  test("saveFetchedPosts counts saved records", async () => {
    const result = await saveFetchedPosts(
      [1, 2, 3],
      async (value) => value > 1,
    );

    expect(result).toEqual({ fetched: 3, saved: 2 });
  });

  test("logSocialFetch reports the result", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logSocialFetch("Facebook", { fetched: 2, saved: 1 });

    expect(log).toHaveBeenCalledWith(
      "Facebook: 2 posts found, 1 saved or updated",
    );
    log.mockRestore();
  });
});

describe("readLimitArg", () => {
  test("uses the fallback without a limit argument", () => {
    expect(withArgv([], () => readLimitArg(50))).toBe(50);
  });

  test("reads a positive limit argument", () => {
    expect(withArgv(["--limit=12"], () => readLimitArg(50))).toBe(12);
  });

  test("rejects invalid limit arguments", () => {
    expect(() => withArgv(["--limit=0"], () => readLimitArg(50))).toThrow(
      "Invalid --limit",
    );
    expect(() => withArgv(["--limit=nope"], () => readLimitArg(50))).toThrow(
      "Invalid --limit",
    );
  });
});

describe("firstValue", () => {
  test("returns the first defined value", () => {
    expect(firstValue(undefined, null, "", "value")).toBe("");
  });
});
