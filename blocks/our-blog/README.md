# Our Blog Block

## Overview

Renders an "Our Blog" homepage section: a centered serif heading above a responsive
grid of author-managed blog post cards. Each card shows a featured image, title, and
publication date, and links to the blog post detail page. Implements ADO #2590396.

## Block Configuration

The block is authored as rows in da.live / Universal Editor.

| Row | Purpose | Example |
|-----|---------|---------|
| Row 1 | Section heading text (defaults to "Our Blog" if empty) | `Our Blog` |
| Row 2+ | One blog post card per row | image, title, date, link |

Each post row has four cells, in order:

| Cell | Content | Notes |
|------|---------|-------|
| 1 | Featured image | `<picture>`/`<img>`; normalized via `createOptimizedPicture` |
| 2 | Post title | Wraps to max 3 lines |
| 3 | Publication date | ISO or common date string; rendered as `DD/Mon/YYYY` (e.g. `10/May/2025`) |
| 4 | Post link | `<a href>` used to make the whole card clickable |

## Block Structure

```
| Our Blog                                                          |
| ![](/media/post-1.jpg) | First Post  | 2025-05-10 | /blog/first   |
| ![](/media/post-2.jpg) | Second Post | 2025-04-22 | /blog/second  |
| ![](/media/post-3.jpg) | Third Post  | 2025-03-15 | /blog/third   |
| ![](/media/post-4.jpg) | Fourth Post | 2025-02-01 | /blog/fourth  |
```

## Behavior Patterns

- **Date formatting** — `formatDate()` parses the authored date and outputs
  `DD/Mon/YYYY`. If parsing fails, the raw text is shown unchanged.
- **Clickable cards** — each card is an `<a>` element (keyboard focusable, accessible)
  that navigates to the authored post link.
- **Responsive grid** — mobile (<768px) 2 columns, tablet (768–1023px) 3 columns,
  desktop (≥1024px) 4 columns in a single row. Extra posts wrap to additional rows.
- **Empty state** — when no post rows are authored, the heading still renders and a
  brief "No posts available." message is shown instead of an empty/broken grid.

## Design Tokens

Custom tokens are defined in `storefront/styles/custom/variables.css`:

| Token | Purpose |
|-------|---------|
| `--color-blog-heading` | Maroon/burgundy heading color |
| `--color-blog-card-bg` | Warm beige card background |
| `--type-blog-heading-font-family` | Serif font stack for the heading |
| `--type-blog-heading-font-size` / `--type-blog-heading-line-height` | Heading sizing |

All other styling uses OOTB tokens (`--spacing-*`, `--shape-*`, `--type-*`, `--color-neutral-*`).
