/**
 * Socials loader
 *
 * Loads social-media posts from a directory of JSON files under `src/`.
 * The `socials` block passes the directory, so the same template renders
 * Instagram, Facebook, or any other feed. Posts do not become pages; they
 * render as cards that link out to the original post.
 *
 * @module #collections/socials
 */

import fs from "node:fs";
import { isAbsolute, join } from "node:path";
import { registerFilters } from "#eleventy/register.js";
import { SRC_DIR } from "#lib/paths.js";
import { memoize } from "#utils/fp/memoize.js";
import { sortByDateDescending } from "#utils/sorting.js";

const MAX_TITLE_LENGTH = 100;

/** @typedef {{ url: string, date: Date, fileSlug: string, data: Record<string, unknown> }} SocialPost */

/**
 * @param {any} raw
 * @param {string} filename
 * @param {string} field
 * @param {boolean} required
 * @returns {string}
 */
const readString = (raw, filename, field, required) => {
  const value = raw?.[field];
  if (typeof value === "string" && (value !== "" || !required)) return value;
  if (!required && value === undefined) return "";
  throw new Error(`Social post ${filename} is missing "${field}"`);
};

const loadSocialsFromDirectory = memoize(
  /**
   * @param {string} directory
   * @param {string} [baseDir]
   * @returns {SocialPost[]}
   */
  (directory, baseDir = SRC_DIR) => {
    const dir = isAbsolute(directory) ? directory : join(baseDir, directory);
    if (!fs.existsSync(dir)) {
      throw new Error(`Social posts directory not found: ${dir}`);
    }

    /** @param {string} filename @returns {SocialPost} */
    const readPost = (filename) => {
      const raw = JSON.parse(fs.readFileSync(join(dir, filename), "utf8"));
      const url = readString(raw, filename, "url", true);
      const dateValue = readString(raw, filename, "date", true);
      const date = new Date(dateValue);
      if (Number.isNaN(Date.parse(dateValue))) {
        throw new Error(`Social post ${filename} has an invalid "date"`);
      }
      const title = readString(raw, filename, "title", false)
        .replace(/\s+/g, " ")
        .trim();
      const thumbnail = readString(raw, filename, "thumbnail", false);
      const name =
        title.length > MAX_TITLE_LENGTH
          ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
          : title;

      return {
        url,
        date,
        fileSlug: filename.replace(/\.json$/, ""),
        data: {
          ...raw,
          name,
          ...(thumbnail === "" ? {} : { thumbnail }),
          tags: ["socials"],
        },
      };
    };

    return fs
      .readdirSync(dir)
      .filter((filename) => filename.endsWith(".json"))
      .map(readPost)
      .sort(sortByDateDescending);
  },
  { cacheKey: (args) => `${String(args[0])}|${String(args[1])}` },
);

/** @param {*} eleventyConfig */
const configureSocials = (eleventyConfig) =>
  registerFilters(eleventyConfig)({ loadSocials: loadSocialsFromDirectory });

export { configureSocials, loadSocialsFromDirectory };
