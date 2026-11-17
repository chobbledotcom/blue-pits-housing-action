/* jscpd:ignore-start -- block schema declaration data */
import {
  HORIZONTAL_FIELD,
  IMAGE_ASPECT_RATIO_FIELD,
  INTRO_CONTENT_FIELD,
  ITEMS_GRID_META,
  num,
  str,
} from "#utils/block-schema/shared.js";

export const type = "socials";

export const fields = {
  directory: {
    ...str("Directory", { required: true }),
    description:
      'Directory under `src/` holding social-post JSON files — e.g. `"instagram-posts"` or `"facebook-posts"`. Each JSON file needs `url` and `date`, and may include `title`, `thumbnail`, and `platform`.',
  },
  limit: {
    ...num("Limit"),
    description: "Show at most this many posts, newest first.",
  },
  intro_content: INTRO_CONTENT_FIELD,
  horizontal: HORIZONTAL_FIELD,
  image_aspect_ratio: IMAGE_ASPECT_RATIO_FIELD,
};

export const docs = {
  summary:
    "Renders social-media posts loaded from a directory of JSON files as a card grid or horizontal strip.",
  ...ITEMS_GRID_META,
  notes:
    "Posts are loaded per-block from the given directory, so one template serves Instagram, Facebook, or any other feed. Captions are shown as plain text and each card links out to the original post.",
};

export const example = {
  type: "socials",
  directory: "facebook-posts",
  horizontal: true,
  limit: 12,
  intro_content:
    "## Latest from social media\n\nRecent posts, pulled from the feed automatically.",
};
/* jscpd:ignore-end */
