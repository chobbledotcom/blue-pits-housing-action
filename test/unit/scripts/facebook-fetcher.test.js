import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  facebookMain,
  parseFacebookItems,
  runFacebookFetch,
  saveFacebookPost,
} from "#scripts/fetch-facebook-posts.js";
import {
  withTempDir,
  withTempDirAsync,
  writeSiteDataFile,
} from "#test/test-utils.js";

const isApifyCall = (url) => String(url).startsWith("https://api.apify.com");

const FACEBOOK_POST = {
  postId: "1",
  createdTime: 1735819200,
  message: "Hello from the page",
  topLevelUrl: "https://www.facebook.com/example/posts/1",
  likes: 5,
  fullPicture: "https://cdn.example.com/one.jpg",
};

const createFetch = (items) =>
  vi.fn(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/runs")) {
      return Response.json({ data: { id: "run-1" } });
    }
    if (path.startsWith("/v2/actor-runs/")) {
      return Response.json({
        data: { id: "run-1", status: "SUCCEEDED", defaultDatasetId: "ds-1" },
      });
    }
    return isApifyCall(url)
      ? Response.json(items)
      : new Response(new Uint8Array([1, 2, 3]));
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

const postFiles = (rootDir) =>
  readdirSync(join(rootDir, "src/facebook-posts")).filter((file) =>
    file.endsWith(".json"),
  );

describe("Facebook fetcher", () => {
  test("normalises actor results into post records", () => {
    const posts = parseFacebookItems([
      {
        postId: "1",
        createdTime: 1735819200,
        message: "Hello from the page",
        topLevelUrl: "https://www.facebook.com/example/posts/1",
        likes: 5,
        fullPicture: "https://cdn.example.com/one.jpg",
      },
      {
        postId: "2",
        createdTime: 1700000000000,
        text: "A video post",
        url: "https://www.facebook.com/example/posts/2",
        isVideo: true,
        image: "https://cdn.example.com/two.png",
        media: [{ image: { uri: "https://cdn.example.com/three.jpg" } }],
      },
      { sharedPost: true, postId: "3", url: "https://facebook.com/3" },
      { postId: "4", createdTime: 1700000000000 },
    ]);

    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      id: "1",
      date: "2025-01-02T12:00:00.000Z",
      title: "Hello from the page",
      text: "Hello from the page",
      url: "https://www.facebook.com/example/posts/1",
      likes: 5,
      comments: 0,
      shares: 0,
      imageUrls: ["https://cdn.example.com/one.jpg"],
    });
    expect(posts[1]).toMatchObject({
      id: "2",
      date: "2023-11-14T22:13:20.000Z",
      isVideo: true,
      imageUrls: [
        "https://cdn.example.com/two.png",
        "https://cdn.example.com/three.jpg",
      ],
    });
  });

  test("writes JSON and downloads each image once", async () =>
    withTempDirAsync("facebook-fetch", async (rootDir) => {
      const fetchFn = createFetch([FACEBOOK_POST]);

      const fetchOnce = () =>
        runFacebookFetch({
          token: "token",
          profileUrl: "https://www.facebook.com/example",
          rootDir,
          fetchFn,
        });
      expect([await fetchOnce(), await fetchOnce()]).toEqual([
        { fetched: 1, saved: 1 },
        { fetched: 0, saved: 0 },
      ]);
      expect(postFiles(rootDir)).toEqual(["2025-01-02T12-00-00Z-1.json"]);
      const record = JSON.parse(
        readFileSync(
          join(rootDir, "src/facebook-posts/2025-01-02T12-00-00Z-1.json"),
          "utf8",
        ),
      );
      expect(record).toMatchObject({
        platform: "Facebook",
        id: "1",
        date: "2025-01-02T12:00:00.000Z",
        thumbnail: "/images/facebook-posts/2025-01-02T12-00-00Z-1.jpg",
        images: ["/images/facebook-posts/2025-01-02T12-00-00Z-1.jpg"],
      });
      expect(readdirSync(join(rootDir, "src/images/facebook-posts"))).toEqual([
        "2025-01-02T12-00-00Z-1.jpg",
      ]);
      const urls = fetchFn.mock.calls.map(([url]) => String(url));
      expect(urls.filter((url) => !isApifyCall(url))).toHaveLength(1);

      // The second run asks Apify only for posts newer than the saved one.
      const [firstInput, secondInput] = fetchFn.mock.calls
        .filter(([url]) => new URL(String(url)).pathname.endsWith("/runs"))
        .map(([, init]) => JSON.parse(init.body));
      expect(firstInput.onlyPostsNewerThan).toBeUndefined();
      expect(secondInput.onlyPostsNewerThan).toBe("2025-01-02T12:00:00.000Z");
    }));

  test("rejects a post without an image URL list", async () =>
    withTempDir("facebook-no-images", async (rootDir) => {
      await expect(
        saveFacebookPost({
          post: { id: "1", date: "2026-01-01T00:00:00.000Z" },
          postsDir: join(rootDir, "src/facebook-posts"),
          imagesDir: join(rootDir, "src/images/facebook-posts"),
          fetchFn: vi.fn(),
        }),
      ).rejects.toThrow("no image URL list");
    }));

  test("fetches through the CLI entry point", async () =>
    withTempDirAsync("facebook-main", async (rootDir) => {
      writeSiteDataFile(rootDir, {
        socials: { Facebook: "https://www.facebook.com/example" },
      });
      vi.stubEnv("APIFY_API_TOKEN", "token");
      vi.stubEnv("APIFY_API_KEY", "");

      await facebookMain({
        rootDir,
        fetchFn: createFetch([FACEBOOK_POST]),
      });

      expect(postFiles(rootDir)).toHaveLength(1);
    }));
});
