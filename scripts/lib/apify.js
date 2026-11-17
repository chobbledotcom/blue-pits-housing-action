/**
 * Shared helpers for the Apify social-post fetchers.
 *
 * Both fetchers call Apify synchronously, normalise the actor's timestamps,
 * and download the post images next to the JSON records. The site then loads
 * those records through the `socials` block.
 */

import { setDefaultResultOrder } from "node:dns";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { ROOT_DIR } from "#lib/paths.js";

// GitHub's runners have no IPv6 route; some CDNs resolve to IPv6 first, which
// makes plain fetch fail with ENETUNREACH. Prefer IPv4 for all fetcher requests.
setDefaultResultOrder("ipv4first");

const APIFY_API = "https://api.apify.com/v2";
const REQUEST_TIMEOUT_MS = 180000;
const RUN_POLL_MS = 5000;
const RUN_TIMEOUT_MS = 1800000;
const TERMINAL_STATUSES = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];

/** @typedef {typeof fetch} FetchLike */
/** @typedef {{ token: string, actorId: string, input: Record<string, unknown>, fetchFn?: FetchLike }} ActorRequest */
/** @typedef {{ method: "GET" | "POST", endpoint: string, token: string, body?: Record<string, unknown>, fetchFn?: FetchLike }} ApiRequest */

/** @param {any} payload @returns {any} */
const unwrapPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return payload.data;
  }
  return payload;
};

/**
 * @param {...any} values
 * @returns {any}
 */
export const firstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null);

/**
 * Fetch options for an Apify API call: JSON when there is a body, and a
 * timeout so a stalled request fails rather than hanging the fetch.
 * @param {string} method
 * @param {unknown} body
 * @returns {RequestInit}
 */
const requestInit = (method, body) => ({
  method,
  ...(body === undefined
    ? {}
    : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

/**
 * @param {ApiRequest} request
 * @returns {Promise<any>}
 */
export const apifyRequest = async ({
  method,
  endpoint,
  token,
  body,
  fetchFn = fetch,
}) => {
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${APIFY_API}${endpoint}${separator}token=${encodeURIComponent(token)}`;
  const response = await fetchFn(url, requestInit(method, body));
  if (response.ok) return unwrapPayload(await response.json());
  throw new Error(
    `Apify ${method} ${endpoint} failed: HTTP ${response.status}: ${await response.text()}`,
  );
};

/** @returns {string} */
export const readApifyToken = () => {
  const key = process.env.APIFY_API_KEY;
  if (key) return key;
  const token = process.env.APIFY_API_TOKEN;
  if (token) return token;
  throw new Error(
    "APIFY_API_KEY or APIFY_API_TOKEN is required. Get one at https://console.apify.com/account/integrations",
  );
};

/**
 * @param {string} [rootDir]
 * @returns {Record<string, any>}
 */
export const readSiteConfig = (rootDir = ROOT_DIR) =>
  JSON.parse(readFileSync(join(rootDir, "src", "_data", "site.json"), "utf8"));

/**
 * @param {Record<string, any>} config
 * @param {string} platform
 * @returns {string}
 */
export const readSocialUrl = (config, platform) => {
  const value = config?.socials?.[platform];
  if (typeof value !== "string" || value === "") {
    throw new Error(`socials.${platform} is missing from src/_data/site.json`);
  }
  return value;
};

/** @param {number} milliseconds @returns {Promise<void>} */
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Run an actor asynchronously and poll until it finishes. A full scrape of
 * a page's posts outlives the run-sync endpoint's limits, so every fetch
 * starts a run and polls it rather than holding one request open.
 *
 * @param {ActorRequest & { pollMs?: number, timeoutMs?: number }} request
 * @returns {Promise<Record<string, any>>}
 */
export const runActor = async ({
  token,
  actorId,
  input,
  fetchFn = fetch,
  pollMs = RUN_POLL_MS,
  timeoutMs = RUN_TIMEOUT_MS,
}) => {
  const started = await apifyRequest({
    method: "POST",
    endpoint: `/acts/${actorId}/runs`,
    token,
    body: input,
    fetchFn,
  });
  const runId = started?.id;
  if (typeof runId !== "string") {
    throw new Error("Apify did not return a run id");
  }

  /** @param {number} startedAt @returns {Promise<Record<string, any>>} */
  const poll = async (startedAt) => {
    const run = await apifyRequest({
      method: "GET",
      endpoint: `/actor-runs/${runId}`,
      token,
      fetchFn,
    });
    if (TERMINAL_STATUSES.includes(run?.status)) {
      if (run.status !== "SUCCEEDED") {
        throw new Error(`Apify run ${runId} finished ${run.status}`);
      }
      return run;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Apify run ${runId} still ${run?.status} after ${timeoutMs}ms`,
      );
    }
    await wait(pollMs);
    return poll(startedAt);
  };

  return poll(Date.now());
};

/**
 * @param {{ token: string, datasetId: string, fetchFn?: FetchLike }} request
 * @returns {Promise<Record<string, any>[]>}
 */
export const fetchDatasetItems = async ({
  token,
  datasetId,
  fetchFn = fetch,
}) => {
  /** @param {number} offset @param {Record<string, any>[]} items @returns {Promise<Record<string, any>[]>} */
  const fetchPage = async (offset, items) => {
    const page = await apifyRequest({
      method: "GET",
      endpoint: `/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=500`,
      token,
      fetchFn,
    });
    if (!Array.isArray(page)) {
      throw new Error("Apify returned a non-array dataset page");
    }
    const combined = items.concat(page);
    return page.length < 500
      ? combined
      : fetchPage(offset + page.length, combined);
  };
  return fetchPage(0, []);
};

/**
 * Run an actor to completion and return every item in its dataset.
 *
 * @param {ActorRequest} request
 * @returns {Promise<Record<string, any>[]>}
 */
export const fetchActorItems = async ({
  token,
  actorId,
  input,
  fetchFn = fetch,
}) => {
  const run = await runActor({ token, actorId, input, fetchFn });
  const datasetId = run.defaultDatasetId;
  if (typeof datasetId !== "string") {
    throw new Error(`Apify run ${run.id} has no dataset id`);
  }
  return fetchDatasetItems({ token, datasetId, fetchFn });
};

/**
 * @param {string | number | Date} value
 * @returns {string}
 */
export const toIsoString = (value) => {
  const milliseconds =
    typeof value === "number" && value < 1e12 ? value * 1000 : value;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid social post date: ${String(value)}`);
  }
  return date.toISOString();
};

/** @param {string} iso @returns {string} */
export const formatTimestamp = (iso) =>
  iso.replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");

/** @param {string} url @returns {string} */
export const imageExtension = (url) => {
  const extension = extname(new URL(url).pathname).toLowerCase();
  if (extension === ".png") return "png";
  if (extension === ".webp") return "webp";
  return "jpg";
};

/**
 * @param {FetchLike} fetchFn
 * @param {string} url
 * @param {string} filePath
 * @returns {Promise<void>}
 */
export const downloadImage = async (fetchFn, url, filePath) => {
  if (existsSync(filePath)) return;
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Image HTTP ${response.status} for ${url}`);
  }
  writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
};

/**
 * @param {string} rootDir
 * @param {string} directory
 * @returns {{ postsDir: string, imagesDir: string }}
 */
export const prepareSocialDirs = (rootDir, directory) => {
  const postsDir = join(rootDir, "src", directory);
  const imagesDir = join(rootDir, "src", "images", directory);
  mkdirSync(postsDir, { recursive: true });
  mkdirSync(imagesDir, { recursive: true });
  return { postsDir, imagesDir };
};

/** @param {Record<string, unknown>} record @returns {string} */
export const serialiseRecord = (record) =>
  `${JSON.stringify(record, null, 2)}\n`;

/**
 * @param {string} jsonPath
 * @param {Record<string, unknown>} record
 * @returns {boolean} Whether the file was written
 */
export const writeRecordIfChanged = (jsonPath, record) => {
  const serialised = serialiseRecord(record);
  if (existsSync(jsonPath) && readFileSync(jsonPath, "utf8") === serialised) {
    return false;
  }
  writeFileSync(jsonPath, serialised);
  return true;
};

/**
 * @template T
 * @param {T[]} posts
 * @param {(post: T) => Promise<boolean>} save
 * @returns {Promise<{ fetched: number, saved: number }>}
 */
export const saveFetchedPosts = async (posts, save) => {
  const saved = (await Promise.all(posts.map(save))).filter(Boolean).length;
  return { fetched: posts.length, saved };
};

/**
 * @param {number} fallback
 * @returns {number}
 */
export const readLimitArg = (fallback) => {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  if (arg === undefined) return fallback;
  const limit = Number(arg.split("=")[1]);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${arg}`);
  }
  return limit;
};
