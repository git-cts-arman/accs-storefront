import { createOptimizedPicture } from '../../scripts/aem.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a date string into DD/Mon/YYYY (e.g. 10/May/2025).
 * Falls back to the raw text if the value cannot be parsed.
 * @param {string} raw - authored date text (ISO or common date string)
 * @returns {string}
 */
function formatDate(raw) {
  const text = (raw || '').trim();
  if (!text) return '';

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  // Use UTC getters so date-only ISO strings (e.g. 2025-05-10, parsed as UTC
  // midnight) are not shifted a day in timezones behind UTC, and so the
  // displayed value matches the ISO `datetime` attribute set on the <time>.
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Extract the first anchor href found within an element, if any.
 * @param {Element} el
 * @returns {string}
 */
function findHref(el) {
  const anchor = el?.querySelector('a[href]');
  return anchor ? anchor.getAttribute('href') : '';
}

/**
 * Build a single blog card as an anchor element.
 * @param {Element} row - authored card row
 * @returns {HTMLElement|null}
 */
function buildCard(row) {
  const cells = [...row.children];
  if (cells.length === 0) return null;

  const imageCell = cells[0];
  const titleCell = cells[1];
  const dateCell = cells[2];
  const linkCell = cells[3];

  // Resolve navigation target: explicit link cell, or any anchor in the row.
  const href = findHref(linkCell) || findHref(titleCell) || findHref(row) || '#';
  const titleText = (titleCell?.textContent || '').trim();

  // Don't emit a non-functional, unnamed link (WCAG 2.4.4 / 4.1.2).
  if (href === '#' && !titleText) return null;

  const card = document.createElement('a');
  card.className = 'our-blog__card';
  card.setAttribute('href', href);

  // --- Image (AC6) ---
  const figure = document.createElement('div');
  figure.className = 'our-blog__card-image';
  const picture = imageCell?.querySelector('picture');
  const img = imageCell?.querySelector('img');
  if (picture) {
    // Reuse the authored <picture> as-is (EDS already produced optimized markup).
    figure.append(picture);
  } else if (img?.getAttribute('src')) {
    // Fallback: build an optimized <picture> from a raw <img> with a real src.
    figure.append(
      createOptimizedPicture(
        img.getAttribute('src'),
        img.getAttribute('alt') || '',
        false,
        [{ width: '750' }],
      ),
    );
  }
  card.append(figure);

  // --- Body (title + date) ---
  const body = document.createElement('div');
  body.className = 'our-blog__card-body';

  if (titleText) {
    const title = document.createElement('h3');
    title.className = 'our-blog__card-title';
    title.textContent = titleText;
    body.append(title);
  }

  const dateText = formatDate(dateCell?.textContent);
  if (dateText) {
    const time = document.createElement('time');
    time.className = 'our-blog__card-date';
    const isoCandidate = new Date((dateCell?.textContent || '').trim());
    if (!Number.isNaN(isoCandidate.getTime())) {
      time.setAttribute('datetime', isoCandidate.toISOString().slice(0, 10));
    }
    time.textContent = dateText;
    body.append(time);
  }

  card.append(body);
  return card;
}

export default async function decorate(block) {
  const rows = [...block.children];

  // First row = section heading text (AC1). Default to "Our Blog" when empty.
  const headingText = (rows.shift()?.textContent || '').trim() || 'Our Blog';

  const heading = document.createElement('h2');
  heading.className = 'our-blog__heading';
  heading.textContent = headingText;

  // Build cards from the remaining rows.
  const cards = rows
    .map((row) => buildCard(row))
    .filter(Boolean);

  block.textContent = '';
  block.append(heading);

  // Empty/loading state (AC10): keep heading, do not render an empty grid.
  if (cards.length === 0) {
    block.classList.add('our-blog--empty');
    const empty = document.createElement('p');
    empty.className = 'our-blog__empty';
    empty.textContent = 'No posts available.';
    block.append(empty);
    return;
  }

  const grid = document.createElement('ul');
  grid.className = 'our-blog__grid';
  cards.forEach((card) => {
    const item = document.createElement('li');
    item.className = 'our-blog__item';
    item.append(card);
    grid.append(item);
  });
  block.append(grid);
}
