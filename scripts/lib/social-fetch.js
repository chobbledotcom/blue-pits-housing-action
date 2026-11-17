/**
 * Shared orchestration for the social-post fetchers.
 *
 * Each platform supplies its actor id, input, parser, and save function;
 * this module prepares the directories, calls Apify, and counts how many
 * posts were written.
 */

import { ROOT_DIR } from "#lib/paths.js";
import {
  fetchActorItems,
  prepareSocialDirs,
  readApifyToken,
  readSiteConfig,
  readSocialUrl,
  saveFetchedPosts,
} from "#scripts/lib/apify.js";

/**
 * @template T
 * @param {{
 *   token: string,
 *   actorId: string,
 *   input: Record<string, unknown>,
 *   directory: string,
 *   rootDir: string,
 *   fetchFn: typeof fetch,
 *   parse: (items: Record<string, any>[]) => T[],
 *   save: (args: { post: T, postsDir: string, imagesDir: string, fetchFn: typeof fetch }) => Promise<boolean>
 * }} args
 * @returns {Promise<{ fetched: number, saved: number }>}
 */
export const runSocialFetch = async ({
  token,
  actorId,
  input,
  directory,
  rootDir,
  fetchFn,
  parse,
  save,
}) => {
  const { postsDir, imagesDir } = prepareSocialDirs(rootDir, directory);
  const items = await fetchActorItems({ token, actorId, input, fetchFn });
  const posts = parse(items);
  return saveFetchedPosts(posts, (post) =>
    save({ post, postsDir, imagesDir, fetchFn }),
  );
};

/**
 * @param {string} platform
 * @param {{ fetched: number, saved: number }} result
 */
export const logSocialFetch = (platform, result) => {
  console.log(
    `${platform}: ${result.fetched} posts found, ${result.saved} saved or updated`,
  );
};

/**
 * Run a platform's entry point with the default root and fetch function,
 * so each CLI script only supplies its own fetcher and reporter.
 *
 * @param {{ fetchPosts: (args: { rootDir: string, fetchFn: typeof fetch }) => Promise<any>, report: (result: any) => void }} fetcher
 * @param {{ rootDir?: string, fetchFn?: typeof fetch }} [options]
 */
export const runFetcherMain = async ({ fetchPosts, report }, options = {}) => {
  const { rootDir = ROOT_DIR, fetchFn = fetch } = options;
  report(await fetchPosts({ rootDir, fetchFn }));
};

/**
 * Build a platform's CLI entry point from its platform name, site-config key,
 * and fetcher. The shared root/token/URL handling lives here once.
 *
 * @param {{
 *   platform: string,
 *   socialKey: string,
 *   fetchPosts: (args: any) => Promise<{ fetched: number, saved: number }>,
 *   extraArgs: () => Record<string, any>
 * }} config
 * @returns {(options?: { rootDir?: string, fetchFn?: typeof fetch }) => Promise<void>}
 */
export const createSocialMain =
  ({ platform, socialKey, fetchPosts, extraArgs }) =>
  (options) =>
    runFetcherMain(
      {
        fetchPosts: ({ rootDir, fetchFn }) =>
          fetchPosts({
            token: readApifyToken(),
            profileUrl: readSocialUrl(readSiteConfig(rootDir), socialKey),
            rootDir,
            fetchFn,
            ...extraArgs(),
          }),
        report: (result) => logSocialFetch(platform, result),
      },
      options,
    );
