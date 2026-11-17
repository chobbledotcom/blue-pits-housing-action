# Blue Pits Housing Action

The website of [Blue Pits Housing Action](https://www.bluepitshousingaction.co.uk),
a Rochdale charity providing supported housing and CQC registered personal care
for adults with mental health needs, learning disabilities and complex needs.

## Provenance

Built from [Chobble Template](https://github.com/chobbledotcom/chobble-template).
It replaces the earlier Jekyll site (`../blue-pits`), keeping every page URL,
every page title and meta description, the copy word for word, and the PDFs at
their old `/docs/*.pdf` addresses. Template updates arrive only through a
reviewed merge from an `upstream` remote.

## Customisations

- **Pages:** home, about, activities, directors, services, lead team,
  complaints, compliments, news, privacy and thank-you, in `src/pages/`.
  The demo collections (news, guides, products, reviews) and their pages are
  removed; the CMS edits pages and snippets only.
- **Facebook posts:** `scripts/fetch-facebook-posts.js` (ported from the Enigma
  Performance Centre site) saves the Facebook page's posts through Apify to
  `src/facebook-posts/*.json`, with images in `src/images/facebook-posts/`.
  The `socials` block (`src/_lib/collections/socials.js`,
  `src/_lib/utils/block-schema/socials.js`) renders them: all of them on
  `/news/`, and the newest 12 in a strip on every page. The fetcher starts an
  Apify run and polls it, because a full scrape outlives Apify's synchronous
  endpoint. `.github/workflows/fetch-facebook-posts.yml` fetches new posts
  weekly, commits them and redeploys. Delete a post's JSON file to drop it from
  the site; only a full re-scrape (`--all`) would bring it back.
- **Shared band:** the `footer-content` snippet's blocks put the Facebook
  strip, the live CQC rating widget and the accreditation badges at the foot
  of every page, where the old site had a sidebar. Its headings carry
  `data-toc-skip` so the "Jump to" contents on the directors, lead team and
  activities pages list only that page's own sections; the
  `table-of-contents` transform honours that attribute.
- **Header:** the logo comes from `site.json`; `src/_includes/navigation-end.html`
  adds the phone number and email address, as the old header had.
- **Head:** `src/_includes/head-scripts.html` loads Goatcounter analytics from
  `analytics.bluepitshousingaction.co.uk` and carries the Trustpilot domain
  verification tag.
- **Complaints form:** a `contact-form` block posting to the same Formspark form
  and Botpoison key as before (`formspark_id` and `botpoison_public_key` in
  `src/_data/config.json`), with the same field names.
- **Theme:** `src/css/theme.scss` uses the logo's blue and green and
  self-hosted Atkinson Hyperlegible Next (`src/assets/fonts/atkinson/`).
- **Config:** breadcrumbs, search, placeholder images and the theme switcher
  are off.

## Working on it

Read `CLAUDE.md` first. `docs/developer-reference.md` lists the commands and
every setting; the generated
[block reference](skills/chobble-template-site-builder/references/blocks.md)
is the authority on block fields. Site identity lives in `src/_data/site.json`,
settings in `src/_data/config.json`.

```sh
npm install
npm run serve                  # local preview
npm run build                  # build, then check internal links
APIFY_API_KEY=... npm run fetch-facebook-posts           # new posts only
APIFY_API_KEY=... npm run fetch-facebook-posts -- --all  # full re-scrape
```

## Checks

`npm run test` runs the full suite; `npm run lint` and `npm run check:a11y`
(after a build) gate style and accessibility.

## Deployment

`.github/workflows/build-and-deploy.yaml` builds every push and deploys `main`
to Bunny. It needs the `BUNNY_ACCESS_KEY` secret and `BUNNY_STORAGE_ZONE_NAME`
set to `blue-pits-2` (the old Jekyll site deployed to `blue-pits`). The weekly
Facebook fetch needs `APIFY_API_KEY`.
