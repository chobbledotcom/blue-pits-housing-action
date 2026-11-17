import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadSocialsFromDirectory } from "#collections/socials.js";
import { withTempDir } from "#test/test-utils.js";

/** @param {string} dir @param {string} filename @param {object} post */
const writePost = (dir, filename, post) => {
  writeFileSync(join(dir, filename), JSON.stringify(post));
};

const instagramPost = (overrides = {}) => ({
  platform: "Instagram",
  url: "https://www.instagram.com/p/example/",
  date: "2026-01-02T12:00:00.000Z",
  title: "A post from the gym",
  thumbnail: "/images/instagram-posts/example.jpg",
  ...overrides,
});

describe("socials loader", () => {
  test("loads posts newest first with card data attached", () =>
    withTempDir("socials-order", (dir) => {
      writePost(
        dir,
        "older.json",
        instagramPost({ date: "2026-01-01T00:00:00.000Z", title: "Older" }),
      );
      writePost(
        dir,
        "newer.json",
        instagramPost({ date: "2026-02-01T00:00:00.000Z", title: "Newer" }),
      );

      const posts = loadSocialsFromDirectory(dir);

      expect(posts.map((post) => post.data.name)).toEqual(["Newer", "Older"]);
      expect(posts[0].url).toBe("https://www.instagram.com/p/example/");
      expect(posts[0].fileSlug).toBe("newer");
      expect(posts[0].date).toEqual(new Date("2026-02-01T00:00:00.000Z"));
      expect(posts[0].data.tags).toEqual(["socials"]);
    }));

  test("accepts a post without a title or thumbnail", () =>
    withTempDir("socials-optional", (dir) => {
      writePost(dir, "image-only.json", {
        url: "https://www.facebook.com/example/posts/1",
        date: "2026-03-01T00:00:00.000Z",
      });

      const [post] = loadSocialsFromDirectory(dir);

      expect(post.data.name).toBe("");
      expect(post.data.thumbnail).toBeUndefined();
    }));

  test("truncates long captions to a card-sized title", () =>
    withTempDir("socials-truncate", (dir) => {
      writePost(dir, "long.json", instagramPost({ title: "x".repeat(200) }));

      const [post] = loadSocialsFromDirectory(dir);

      expect(post.data.name.length).toBeLessThan(200);
      expect(post.data.name.endsWith("…")).toBe(true);
    }));

  test("ignores files that are not JSON posts", () =>
    withTempDir("socials-ignored", (dir) => {
      writeFileSync(join(dir, ".gitkeep"), "");
      writeFileSync(join(dir, "notes.txt"), "not a post");
      writePost(dir, "post.json", instagramPost());

      expect(loadSocialsFromDirectory(dir)).toHaveLength(1);
    }));

  test("throws when a post has no url", () =>
    withTempDir("socials-missing-url", (dir) => {
      writePost(dir, "broken.json", {
        date: "2026-01-01T00:00:00.000Z",
      });

      expect(() => loadSocialsFromDirectory(dir)).toThrow(
        'Social post broken.json is missing "url"',
      );
    }));

  test("throws when a post date is invalid", () =>
    withTempDir("socials-invalid-date", (dir) => {
      writePost(dir, "broken.json", instagramPost({ date: "not-a-date" }));

      expect(() => loadSocialsFromDirectory(dir)).toThrow(
        'Social post broken.json has an invalid "date"',
      );
    }));

  test("throws when the configured directory does not exist", () =>
    withTempDir("socials-missing-dir", (dir) => {
      expect(() => loadSocialsFromDirectory(join(dir, "absent"))).toThrow(
        "Social posts directory not found",
      );
    }));
});
