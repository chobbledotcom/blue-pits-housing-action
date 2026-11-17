#!/usr/bin/env node
/**
 * Fetch the Facebook page's posts through Apify and save one JSON record per
 * post, downloading the images alongside. Runs incrementally from the newest
 * saved date; pass `--all` for a full re-scrape.
 *
 * Usage:
 *   APIFY_API_TOKEN=... node scripts/fetch-facebook-posts.js
 *   APIFY_API_KEY=... node scripts/fetch-facebook-posts.js --limit=40
 *   APIFY_API_KEY=... node scripts/fetch-facebook-posts.js --all
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
/* jscpd:ignore-start -- shared social-fetch imports */
import { join } from "node:path";
import { ROOT_DIR } from "#lib/paths.js";
import {
  downloadImage,
  firstValue,
  formatTimestamp,
  imageExtension,
  readLimitArg,
  toIsoString,
  writeRecordIfChanged,
} from "#scripts/lib/apify.js";
import { runIfMain } from "#scripts/lib/is-main-module.js";
import { createSocialMain, runSocialFetch } from "#scripts/lib/social-fetch.js";

const ACTOR_ID = "KoJrdxJCTtpon81KY";
const RESULTS_LIMIT = 100;
const DIRECTORY = "facebook-posts";
/* jscpd:ignore-end */

/** @typedef {typeof fetch} FetchLike */
/** @typedef {{ post: Record<string, any>, slug: string, imagesDir: string, fetchFn: FetchLike }} DownloadPostArgs */
/** @typedef {{ post: Record<string, any>, postsDir: string, imagesDir: string, fetchFn: FetchLike }} SavePostArgs */

/** @param {Record<string, any>} post @returns {string} */
const postText = (post) => {
  const text = firstValue(post.message, post.text, post.caption);
  return typeof text === "string" ? text.trim() : "";
};

/** @param {Record<string, any>} post @returns {boolean} */
const isFacebookPost = (post) => {
  const url = firstValue(post.topLevelUrl, post.url);
  const date = firstValue(post.createdTime, post.time, post.timestamp);
  return (
    post.sharedPost !== true &&
    typeof url === "string" &&
    url !== "" &&
    date !== undefined
  );
};

/** @param {Record<string, any>} item @returns {string | undefined} */
const mediaImageUrl = (item) =>
  item?.image?.uri || item?.photo_image?.uri || item?.thumbnail;

/** @param {Record<string, any>} post @returns {string[]} */
const postImageUrls = (post) => {
  const media = Array.isArray(post.media) ? post.media.map(mediaImageUrl) : [];
  const candidates = [post.fullPicture, post.image, post.displayUrl, ...media];
  return [
    ...new Set(
      candidates.filter((url) => typeof url === "string" && url !== ""),
    ),
  ];
};

/** @param {unknown} value @returns {number} */
const numberOrZero = (value) => (typeof value === "number" ? value : 0);

/** @param {Record<string, any>} post @returns {Record<string, any>} */
const postStats = (post) => ({
  likes: numberOrZero(post.likes),
  comments: numberOrZero(post.comments),
  shares: numberOrZero(post.shares),
  ...(post.isVideo === true ? { isVideo: true } : {}),
});

/** @param {Record<string, any>} post @returns {Record<string, any>} */
const toFacebookPost = (post) => {
  const text = postText(post);
  return {
    id: String(firstValue(post.postId, post.id, post.url)),
    date: toIsoString(firstValue(post.createdTime, post.time, post.timestamp)),
    title: text,
    text,
    url: firstValue(post.topLevelUrl, post.url),
    ...postStats(post),
    imageUrls: postImageUrls(post),
  };
};

/**
 * @param {Record<string, any>[]} items
 * @returns {Record<string, any>[]}
 */
export const parseFacebookItems = (items) =>
  items.filter(isFacebookPost).map(toFacebookPost);

/**
 * @param {string} iso
 * @param {unknown} id
 * @returns {string}
 */
export const formatFacebookSlug = (iso, id) => {
  const safeId = String(id)
    .replace(/[^a-z0-9]/gi, "-")
    .slice(0, 24);
  return `${formatTimestamp(iso)}-${safeId}`;
};

/** @param {string} postsDir @returns {Record<string, any>[]} */
const readExistingPosts = (postsDir) => {
  if (!existsSync(postsDir)) return [];
  return readdirSync(postsDir).flatMap((filename) =>
    filename.endsWith(".json")
      ? [JSON.parse(readFileSync(join(postsDir, filename), "utf8"))]
      : [],
  );
};

/** @param {Record<string, any>[]} records @returns {number | null} */
const newestSavedDate = (records) => {
  const times = records
    .map((record) => new Date(record.date).getTime())
    .filter((time) => Number.isFinite(time));
  return times.length > 0 ? Math.max(...times) : null;
};

/**
 * @param {string} slug
 * @param {number} index
 * @param {string} imageUrl
 * @returns {string}
 */
const imageFilename = (slug, index, imageUrl) => {
  const suffix = index === 0 ? "" : `-${index + 1}`;
  return `${slug}${suffix}.${imageExtension(imageUrl)}`;
};

/** @param {DownloadPostArgs} args @returns {Promise<string[]>} */
const downloadPostImages = async ({ post, slug, imagesDir, fetchFn }) => {
  if (!Array.isArray(post.imageUrls)) {
    throw new Error(`Facebook post ${post.id} has no image URL list`);
  }
  return Promise.all(
    post.imageUrls.map(async (imageUrl, index) => {
      const filename = imageFilename(slug, index, imageUrl);
      await downloadImage(fetchFn, imageUrl, join(imagesDir, filename));
      return `/images/${DIRECTORY}/${filename}`;
    }),
  );
};

/**
 * @param {Record<string, any>} post
 * @param {string[]} images
 * @returns {Record<string, any>}
 */
const buildFacebookRecord = (post, images) => ({
  platform: "Facebook",
  id: post.id,
  date: post.date,
  title: post.title,
  text: post.text,
  url: post.url,
  ...postStats(post),
  ...(images.length > 0 ? { images, thumbnail: images[0] } : {}),
});

/**
 * @param {SavePostArgs} args
 * @returns {Promise<boolean>} Whether the JSON record was written
 */
export const saveFacebookPost = async (args) => {
  const { post, postsDir, imagesDir, fetchFn } = args;
  const slug = formatFacebookSlug(post.date, post.id);
  const jsonPath = join(postsDir, `${slug}.json`);
  const images = await downloadPostImages({
    post,
    slug,
    imagesDir,
    fetchFn,
  });
  return writeRecordIfChanged(jsonPath, buildFacebookRecord(post, images));
};

/** @param {string} rootDir @param {boolean} forceAll @returns {number | null} */
const facebookCutoff = (rootDir, forceAll) =>
  forceAll
    ? null
    : newestSavedDate(readExistingPosts(join(rootDir, "src", DIRECTORY)));

/**
 * @param {{ profileUrl: string, limit: number, cutoff: number | null }} args
 * @returns {Record<string, unknown>}
 */
const facebookInput = ({ profileUrl, limit, cutoff }) => ({
  startUrls: [{ url: profileUrl }],
  resultsLimit: limit,
  ...(cutoff === null
    ? {}
    : { onlyPostsNewerThan: new Date(cutoff).toISOString() }),
});

/**
 * @param {{ token: string, profileUrl: string, rootDir?: string, fetchFn?: FetchLike, limit?: number, forceAll?: boolean }} args
 * @returns {Promise<{ fetched: number, saved: number }>}
 */
export const runFacebookFetch = (args) => {
  const {
    profileUrl,
    token,
    rootDir = ROOT_DIR,
    fetchFn = fetch,
    limit = RESULTS_LIMIT,
    forceAll = false,
  } = args;
  const cutoff = facebookCutoff(rootDir, forceAll);
  return runSocialFetch({
    token,
    actorId: ACTOR_ID,
    input: facebookInput({ profileUrl, limit, cutoff }),
    directory: DIRECTORY,
    rootDir,
    fetchFn,
    parse: (items) =>
      parseFacebookItems(items).filter(
        (post) => cutoff === null || new Date(post.date).getTime() > cutoff,
      ),
    save: saveFacebookPost,
  });
};

export const facebookMain = createSocialMain({
  platform: "Facebook",
  socialKey: "Facebook",
  fetchPosts: runFacebookFetch,
  extraArgs: () => ({
    limit: readLimitArg(RESULTS_LIMIT),
    forceAll: process.argv.includes("--all"),
  }),
});

await runIfMain(import.meta.url, facebookMain);
