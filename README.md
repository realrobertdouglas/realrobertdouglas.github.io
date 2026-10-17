# douglas.lol

Douglas Labs: essays, and a research section that is a clickable periodic table.

Published with GitHub Pages at https://douglas.lol from the `master` branch. The theme (Jekyll on the github-pages gem, Roboto Condensed, a light and a dark mode that follows the clock and the device) is the one [Captain's Notes](https://github.com/realrobertdouglas/captainnotes.com) and the [Journal of Experiments](https://github.com/realrobertdouglas/journalsofexperiments.com) carry too, so a change to it is the same edit in each repo.

## Writing a post

Make `_posts/YYYY-MM-DD-slug.md` with this front matter, then write in Markdown below it:

```yaml
---
layout: post
title:  "Fear in church clothes"
date:   2026-10-02 00:00:00 +0000
categories: [life]
comments: false
---
```

- `date` is UTC; posts made the same day are ordered by giving them different hours.
- Every category needs a page in `category/` (`layout: posts_by_category`, `categories: caving`, `permalink: /category/caving`); the post header links there.
- `subtitle` is optional and shows under the title. Images go in `static/img/posts/`.
- A post that moves gets a page in `redirects/` that keeps its old `permalink` and sets `redirect_to`, either a path here or a full URL on another site (the three future essays moved to Captain's Notes this way).

Push to `master` and GitHub rebuilds the site within a minute or two.

## The research section

`/research/` lists the projects in `_research/`, newest `updated` first. A project is one file there with `title`, `summary` and `updated` in its front matter (`updated` is set by hand when the project changes) and its page below; the `research` collection gives it the `research` layout and `/research/<name>/`.

There is one project so far, **Elements** (`_research/elements.html`): the periodic table, then a table of the molecules and compounds written up so far. It draws on three more collections, each a folder of Markdown files whose front matter is the data and whose body, if any, becomes a Notes section on the page:

| Folder | Page | Layout |
|---|---|---|
| `_elements/` (118 files) | `/research/elements/<name>/` | `_layouts/element.html` |
| `_molecules/` | `/research/molecules/<name>/` | `_layouts/molecule.html` |
| `_compounds/` | `/research/compounds/<name>/` | `_layouts/compound.html` |

The collections and their layouts are set in `_config.yml`; every research page gets `research: true`, which loads `static/css/research.css`.

### An element

```yaml
---
title: Lead
symbol: "Pb"
number: 82
category: Post-transition metal
period: 6
group: 14
column: 14          # where the cell sits on the periodic table grid
row: 6              # lanthanides are row 9, actinides row 10
configuration: "[Xe] 4f14 5d10 6s2 6p2"
refining: "Sinter-roasting of galena ... See [galena](/research/compounds/galena/)."
isotopes:
  - mass_number: 204
    relative_atomic_mass: "203.9730440(13)"
    abundance: "0.014(1)"
    obtained: ""
---

Notes in Markdown, shown first on the page.
```

- `category` is one of the ten in the table's legend (`_includes/research/periodic-table.html`); it colors the cell and the element's tile.
- `configuration` draws the electron shell diagram (`_includes/research/electron-shells.html`): the noble-gas core in grey, the outer s and p electrons in green, and the d and f electrons that can take part in bonding in a softer green. Dot positions come from `_data/electron_rings.yml`, because Liquid has no sine or cosine. `configuration_predicted: true` marks the 15 heaviest elements, whose configurations are calculated, not measured.
- `refining` is the shared "How it's obtained" paragraph, Markdown, optional. An isotope's own `obtained` text adds a "How this isotope is separated" column to the isotope table; the column only appears when at least one isotope has one (hydrogen, helium, lithium, boron, carbon, nitrogen, oxygen, silicon and uranium so far).
- Masses and abundances are copied from NIST's Atomic Weights and Isotopic Compositions, with the uncertainty digits in parentheses as NIST prints them. An element with no natural isotope of defined abundance (technetium, promethium and the rest) leaves `isotopes` out, and the page says so.
- The page ends with the molecules and compounds the element appears in (computed from their formulas) and links to its two neighbors by atomic number.

### A molecule

```yaml
---
title: Ethanol
formula: C2H6O
isomers:
  - name: Ethanol
    structure: CH3CH2OH
    atoms: [[C, 0, 0], [C, 0.866, -0.5], [O, 1.732, 0], [H, 2.598, -0.5], ...]
    bonds: [[1, 2], [2, 3], [3, 4], ...]
    made: >-
      Yeast ferments the sugars in corn ...
---
```

- `formula` is plain text; `_includes/research/formula.html` sets the digits as subscripts and `formula-elements.html` reads the element symbols out of it, so the Elements line, the table on the Elements page and each element's "Molecules" list need nothing more.
- Every isomer is drawn by `_includes/research/molecule-structure.html` at build time: `atoms` are `[element, x, y]` in bond lengths with y growing downward, `bonds` name atoms by their position in that list counting from 1, with an optional third value of 2 or 3 for a double or triple bond. A single-isomer molecule says it has no other isomers.

### A compound

```yaml
---
title: Galena
formula: PbS
found: >-
  Hydrothermal veins and replacement deposits in limestone ...
mined: >-
  Underground by room-and-pillar mining or stoping ...
---
```

A compound page also shows its unit cell when `_data/lattices/<slug>.yml` exists. That file is generated, never edited by hand:

```bash
python3 _tools/crystal_lattice.py galena 9008694.cif --bond Pb-S:3.1
```

The tool reads a CIF file (the four so far came from the Crystallography Open Database, `https://www.crystallography.net/cod/<id>.cif`), fills the cell, adds the atoms shared on its faces, edges and corners, views it from a fixed angle and writes the atoms, bonds and cell edges in pixels, plus the source, authors, year, space group and cell dimensions the page cites. `--bond A-B:max` says which pairs to join, repeatable; `--group A` also draws atoms just outside the cell that bond to an A inside it, so calcite's carbonate triangles come out whole. Standard library only. `_includes/research/crystal-lattice.html` draws the file; atom colors are the molecule palette in `research.css`, with the metals given their own so chalcopyrite's copper and iron differ, chosen to stay distinct with red-green color blindness.

### The periodic table

`_includes/research/periodic-table.html` lays every element out on an 18-column grid from its `column` and `row`, with the 57–71 and 89–103 markers in the gap. Every cell is a plain link to its element's page, so the table works without JavaScript. With `static/js/periodic-table.js`:

- a click opens a **quick look** (symbol, name, category, place, natural isotopes, and which molecules and compounds here contain it, whose rows in the table below are highlighted) and a second click opens the page;
- the 57–71 and 89–103 markers open their whole series as tiles and outline its row under the table;
- on a wide screen the quick look sits in the empty space above the transition metals; when the table is wider than the screen and scrolls sideways (phones), it is a card pinned to the bottom of the screen with a close button, so it is never half off-screen. Escape closes it.

### The lab bench

Under the table, `_includes/research/lab-bench.html` and `static/js/lab-bench.js` put a beaker on the page. The quick look's **Add to bench** button puts the element in it (so does dragging a cell onto the beaker with a mouse), and the bench shows which of the molecules and compounds written up here are made of what is in the beaker, which one more element would finish something (with a button that adds it, and a dot on that element in the table), and lights a result's elements on the table when the reader hovers it or clicks its element tiles. Matching is by presence: an item comes out when every element it needs is in the beaker. Adding the same element again raises its chip's count (×2) but changes nothing yet; the counts are there for a later rule that checks how many of each. The include writes one `<template>` per molecule and compound, with its facts as data attributes and its formula and drawing inside, drawn at build time the same way its own page draws them, so the bench loads nothing else. Without JavaScript the section stays hidden.

Research pages are in the sitemap but not in the sidebar search or the RSS feed, which cover posts only.

## How the rest of the site is put together

- `index.html` — the list of posts. `about.md` — what the site is, the legal disclaimer and the appearance toggle (Auto, Light, Dark; Auto is dark from 8pm to 8am by the reader's clock or when their device is).
- `_layouts/default.html` — the shell: the theme script that runs before paint, the rotating globe, the logo (`static/img/logo-light.svg` and `logo-dark.svg`), the search, the Research link, the private-message link and the links to the two sister journals under a hairline. `_layouts/compress.html` minifies the HTML.
- `static/css/main.css` — the theme; its `/* Content */` block is identical across the three sites. `research.css` is only loaded on research pages. `publish_rotating_earth.css` animates the globe.
- `search.json` and `static/js/search.js` — the sidebar search over posts. `feed.xml` — RSS. `sitemap.xml`, `robots.txt`, `404.html`.
- **Private messages.** `/message/` encrypts a message in the sender's browser (`static/js/openpgp.min.mjs`, `secure-drop.js`) to the public key in `static/robert-drop.asc` and sends it to a Cloudflare Worker at `drop.douglas.lol`; `/inbox/` lists and decrypts them after the private key proves itself (`secure-inbox.js`). The Worker is `_secure-drop-worker/` (D1 database, a content-free email notice; deploy with `npx -y wrangler@3 deploy`). The sidebar's "Message me privately" dialog is `_includes/secure-drop.html`; a page sets `hide_drop: true` to leave it out.
- `new-post/` — a browser form that downloads a post's Markdown with the front matter filled in. `serve.sh` — an older start-the-server script with a hard-coded path. Both are in `_config.yml`'s `exclude` list, which replaces Jekyll's own list and so repeats its defaults.
- `static/img/_posts/` and `static/img/posts/` — post images; `social-card.png` is the link preview; `favicon.svg`, `favicon.ico` and `apple-touch-icon.png` are the beaker mark.

## Local preview

Needs Ruby 3 and Bundler. The Gemfile pins the `github-pages` gem so the preview builds with the same Jekyll GitHub uses:

```bash
bundle install
LANG=en_US.UTF-8 PAGES_DISABLE_NETWORK=1 bundle exec jekyll serve --livereload
```

Then open http://localhost:4000. `LANG` is needed by the theme's Sass; `PAGES_DISABLE_NETWORK` skips GitHub API lookups the site doesn't use, which otherwise add about fifteen seconds per build. `.claude/launch.json` holds the same command for the Claude desktop app's preview.

Thanks [agusmakmun](https://agusmakmun.github.io), [coip](https://coip.me) and [wiggles](https://github.com/wigggles/) for the theme this grew from.
