/**
 * Unit tests for the `our-blog` block (ADO #2590396).
 *
 * Source: storefront/blocks/our-blog/our-blog.js
 * The block exports `async function decorate(block)`.
 */

// Mock the AEM helper the block imports. The path is resolved relative to this
// test file and points at the same module the source imports via
// `../../scripts/aem.js` (both resolve to storefront/scripts/aem.js).
jest.mock('../../../scripts/aem.js', () => ({
  // `global` is the only allowed reference inside a jest.mock factory; use it to
  // reach jsdom's document for building a real <picture> element.
  createOptimizedPicture: jest.fn((src, alt) => {
    const picture = global.document.createElement('picture');
    picture.dataset.optimized = 'true';
    const img = global.document.createElement('img');
    img.setAttribute('src', src);
    img.setAttribute('alt', alt);
    picture.append(img);
    return picture;
  }),
}));

import { createOptimizedPicture } from '../../../scripts/aem.js';
import decorate from '../our-blog.js';

/**
 * Build a cell <div> from a description.
 * @param {object} spec
 * @param {string} [spec.text] - plain text content of the cell
 * @param {{src:string, alt?:string}} [spec.img] - image to embed
 * @param {{href:string, text?:string}} [spec.link] - anchor to embed
 * @returns {HTMLDivElement}
 */
function makeCell({ text, img, link } = {}) {
  const cell = document.createElement('div');
  if (img) {
    const el = document.createElement('img');
    el.setAttribute('src', img.src);
    if (img.alt !== undefined) el.setAttribute('alt', img.alt);
    cell.append(el);
  }
  if (link) {
    const a = document.createElement('a');
    a.setAttribute('href', link.href);
    a.textContent = link.text || '';
    cell.append(a);
  }
  if (text !== undefined) {
    cell.append(document.createTextNode(text));
  }
  return cell;
}

/**
 * Build the block element from authored rows.
 * @param {Array<Array<object>>} rows - each row is an array of cell specs.
 *   The first row is the heading row.
 * @returns {HTMLDivElement}
 */
function makeBlock(rows) {
  const block = document.createElement('div');
  block.className = 'our-blog block';
  rows.forEach((cells) => {
    const row = document.createElement('div');
    cells.forEach((cellSpec) => row.append(makeCell(cellSpec)));
    block.append(row);
  });
  return block;
}

/** Convenience: a heading row with the given text. */
function headingRow(text) {
  return [{ text }];
}

/** Convenience: a card row with [image, title, date, link] cells. */
function cardRow({
  imgSrc = 'https://example.com/post.jpg',
  imgAlt = 'Post image',
  title = 'A great post',
  titleHref,
  date = '2025-05-10',
  linkHref = 'https://example.com/blog/post',
  linkText = 'Read more',
} = {}) {
  return [
    { img: { src: imgSrc, alt: imgAlt } },
    titleHref
      ? { link: { href: titleHref, text: title } }
      : { text: title },
    { text: date },
    linkHref ? { link: { href: linkHref, text: linkText } } : { text: '' },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('our-blog block', () => {
  describe('heading (AC1)', () => {
    it('uses custom heading text from the first row', async () => {
      const block = makeBlock([headingRow('Latest Stories'), cardRow()]);
      await decorate(block);

      const heading = block.querySelector('h2.our-blog__heading');
      expect(heading).not.toBeNull();
      expect(heading.textContent).toBe('Latest Stories');
    });

    it('defaults to "Our Blog" when the first row is empty', async () => {
      const block = makeBlock([headingRow(''), cardRow()]);
      await decorate(block);

      const heading = block.querySelector('h2.our-blog__heading');
      expect(heading).not.toBeNull();
      expect(heading.textContent).toBe('Our Blog');
    });
  });

  describe('card rendering', () => {
    it('renders one <li.our-blog__item> per authored card row', async () => {
      const block = makeBlock([
        headingRow('Blog'),
        cardRow({ title: 'Post 1' }),
        cardRow({ title: 'Post 2' }),
        cardRow({ title: 'Post 3' }),
      ]);
      await decorate(block);

      const items = block.querySelectorAll('li.our-blog__item');
      expect(items).toHaveLength(3);
      const cards = block.querySelectorAll('a.our-blog__card');
      expect(cards).toHaveLength(3);
    });

    it('renders the card as an anchor with the resolved href from the link cell', async () => {
      const block = makeBlock([
        headingRow('Blog'),
        cardRow({ linkHref: 'https://example.com/blog/special' }),
      ]);
      await decorate(block);

      const card = block.querySelector('a.our-blog__card');
      expect(card).not.toBeNull();
      expect(card.tagName).toBe('A');
      expect(card.getAttribute('href')).toBe('https://example.com/blog/special');
    });

    it('falls back to the title-cell href when no link cell href exists', async () => {
      const block = makeBlock([
        headingRow('Blog'),
        cardRow({
          title: 'Linked title',
          titleHref: 'https://example.com/blog/from-title',
          linkHref: null,
        }),
      ]);
      await decorate(block);

      const card = block.querySelector('a.our-blog__card');
      expect(card.getAttribute('href')).toBe('https://example.com/blog/from-title');
    });
  });

  describe('date formatting (AC: dates)', () => {
    it('formats an ISO date to DD/Mon/YYYY', async () => {
      const block = makeBlock([headingRow('Blog'), cardRow({ date: '2025-05-10' })]);
      await decorate(block);

      const time = block.querySelector('time.our-blog__card-date');
      expect(time).not.toBeNull();
      expect(time.textContent).toBe('10/May/2025');
    });

    it('sets the datetime attribute in UTC with no off-by-one shift', async () => {
      const block = makeBlock([headingRow('Blog'), cardRow({ date: '2025-05-10' })]);
      await decorate(block);

      const time = block.querySelector('time.our-blog__card-date');
      expect(time.getAttribute('datetime')).toBe('2025-05-10');
    });

    it('passes through unparseable date text unchanged', async () => {
      const block = makeBlock([headingRow('Blog'), cardRow({ date: 'Coming soon' })]);
      await decorate(block);

      const time = block.querySelector('time.our-blog__card-date');
      expect(time).not.toBeNull();
      expect(time.textContent).toBe('Coming soon');
      expect(time.hasAttribute('datetime')).toBe(false);
    });
  });

  describe('card skipping (WCAG guard)', () => {
    it('skips a card when href is "#" and there is no title', async () => {
      const block = makeBlock([
        headingRow('Blog'),
        // No link cell href, no title text, no anchors anywhere → href '#', no title.
        [
          { img: { src: 'https://example.com/x.jpg', alt: 'x' } },
          { text: '' },
          { text: '2025-05-10' },
          { text: '' },
        ],
        cardRow({ title: 'Valid post' }),
      ]);
      await decorate(block);

      const cards = block.querySelectorAll('a.our-blog__card');
      expect(cards).toHaveLength(1);
      expect(cards[0].querySelector('.our-blog__card-title').textContent).toBe('Valid post');
    });
  });

  describe('empty state (AC10)', () => {
    it('renders heading, empty class and message with no grid when there are no card rows', async () => {
      const block = makeBlock([headingRow('My Blog')]);
      await decorate(block);

      expect(block.querySelector('h2.our-blog__heading').textContent).toBe('My Blog');
      expect(block.classList.contains('our-blog--empty')).toBe(true);

      const empty = block.querySelector('p.our-blog__empty');
      expect(empty).not.toBeNull();
      expect(empty.textContent).toBe('No posts available.');

      expect(block.querySelector('ul.our-blog__grid')).toBeNull();
    });
  });

  describe('image (AC6)', () => {
    it('calls createOptimizedPicture with the image alt passed through', async () => {
      const block = makeBlock([
        headingRow('Blog'),
        cardRow({ imgSrc: 'https://example.com/hero.jpg', imgAlt: 'Hero alt text' }),
      ]);
      await decorate(block);

      expect(createOptimizedPicture).toHaveBeenCalledTimes(1);
      expect(createOptimizedPicture).toHaveBeenCalledWith(
        'https://example.com/hero.jpg',
        'Hero alt text',
        false,
        [{ width: '750' }],
      );

      const figure = block.querySelector('.our-blog__card-image');
      expect(figure.querySelector('picture')).not.toBeNull();
    });
  });

  describe('list semantics (AC: structure)', () => {
    it('wraps cards in <li.our-blog__item> inside a <ul.our-blog__grid>', async () => {
      const block = makeBlock([headingRow('Blog'), cardRow(), cardRow()]);
      await decorate(block);

      const grid = block.querySelector('ul.our-blog__grid');
      expect(grid).not.toBeNull();
      expect(grid.tagName).toBe('UL');

      const items = grid.querySelectorAll(':scope > li.our-blog__item');
      expect(items).toHaveLength(2);
      items.forEach((item) => {
        expect(item.querySelector(':scope > a.our-blog__card')).not.toBeNull();
      });
    });
  });
});
