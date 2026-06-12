/**
 * E2E coverage for the homepage "Our Blog" section (ADO #2590396).
 *
 * Block under test: `storefront/blocks/our-blog/our-blog.js`
 * Markup produced by the block:
 *   .our-blog
 *     h2.our-blog__heading        -> "Our Blog"
 *     ul.our-blog__grid
 *       li.our-blog__item
 *         a.our-blog__card
 *           div.our-blog__card-image (picture/img)
 *           div.our-blog__card-body
 *             h3.our-blog__card-title (optional)
 *             time.our-blog__card-date (DD/Mon/YYYY text + datetime attr)
 *   Empty state: .our-blog--empty + p.our-blog__empty ("No posts available."), no grid.
 *
 * PRECONDITION:
 *   These tests assume the `our-blog` block has been authored on the target page
 *   (here, the homepage "/") in da.live. If the block has not yet been placed on a
 *   live page/route, author it first (or point BLOG_PAGE at the test page that
 *   contains it). Each test guards with `cy.get('.our-blog').should('exist')` so a
 *   missing block fails loudly with a clear message rather than passing silently.
 */

// Page/route that contains the authored `our-blog` section.
// Update this if the block is authored on a dedicated test page instead of "/".
const BLOG_PAGE = '/';

// Date format rendered by the block: DD/Mon/YYYY (e.g. 10/May/2025).
const DATE_RE = /^\d{2}\/[A-Za-z]{3}\/\d{4}$/;

// Allow a small pixel tolerance when comparing row alignment (sub-pixel layout).
const ROW_TOLERANCE = 2;

describe('Homepage "Our Blog" section (ADO #2590396)', () => {
  beforeEach(() => {
    cy.visit(BLOG_PAGE);
    // Fail fast and clearly if the block has not been authored on this page yet.
    cy.get('.our-blog').should('exist').scrollIntoView();
  });

  // AC1: heading "Our Blog" is visible and centered.
  it('AC1: renders a visible, centered "Our Blog" heading', () => {
    cy.get('.our-blog .our-blog__heading')
      .should('be.visible')
      .and('contain.text', 'Our Blog')
      .and('have.css', 'text-align', 'center');
  });

  // AC2: desktop (>=1024) shows 4 cards laid out in a single top row.
  it('AC2: desktop viewport shows 4 cards in the first row', () => {
    cy.viewport(1280, 800);
    cy.visit(BLOG_PAGE);
    cy.get('.our-blog').should('exist').scrollIntoView();

    cy.get('.our-blog .our-blog__card').should('have.length.at.least', 4);

    // Assert the first 4 cards share the same top edge (one row).
    cy.get('.our-blog .our-blog__card').then(($cards) => {
      const tops = $cards
        .toArray()
        .slice(0, 4)
        .map((el) => Math.round(el.getBoundingClientRect().top));
      const firstTop = tops[0];
      tops.forEach((top) => {
        expect(Math.abs(top - firstTop)).to.be.at.most(ROW_TOLERANCE);
      });
    });

    // Sanity-check the grid is a 4-column track on desktop when supported.
    cy.get('.our-blog .our-blog__grid').then(($grid) => {
      const template = getComputedStyle($grid[0]).gridTemplateColumns;
      // jsdom-less browsers report the resolved track sizes; expect 4 tracks.
      if (template && template !== 'none') {
        expect(template.trim().split(/\s+/).length).to.eq(4);
      }
    });
  });

  // AC3: mobile (<768) uses a 2-column layout.
  it('AC3: mobile viewport uses a 2-column layout', () => {
    cy.viewport(375, 812);
    cy.visit(BLOG_PAGE);
    cy.get('.our-blog').should('exist').scrollIntoView();

    cy.get('.our-blog .our-blog__card').should('have.length.at.least', 2);

    // The first two cards should sit on the same top row...
    cy.get('.our-blog .our-blog__card').then(($cards) => {
      const first = $cards[0].getBoundingClientRect();
      const second = $cards[1].getBoundingClientRect();
      expect(Math.abs(Math.round(first.top) - Math.round(second.top)))
        .to.be.at.most(ROW_TOLERANCE);
      // ...and be side by side (second card starts to the right of the first).
      expect(Math.round(second.left)).to.be.greaterThan(Math.round(first.left));
    });

    // Confirm exactly 2 column tracks at mobile width when reported.
    cy.get('.our-blog .our-blog__grid').then(($grid) => {
      const template = getComputedStyle($grid[0]).gridTemplateColumns;
      if (template && template !== 'none') {
        expect(template.trim().split(/\s+/).length).to.eq(2);
      }
    });
  });

  // AC4: each card has an image, a title and a correctly formatted date.
  it('AC4: each card has an image, title and DD/Mon/YYYY date', () => {
    cy.get('.our-blog .our-blog__card').each(($card) => {
      cy.wrap($card)
        .find('.our-blog__card-image img')
        .should('exist')
        .and(($img) => {
          // Image has resolved to an actual source.
          expect(($img[0].getAttribute('src') || '').length).to.be.greaterThan(0);
        });

      cy.wrap($card)
        .find('.our-blog__card-title')
        .should('exist')
        .invoke('text')
        .should((text) => {
          expect(text.trim().length).to.be.greaterThan(0);
        });

      cy.wrap($card)
        .find('.our-blog__card-date')
        .should('exist')
        .invoke('text')
        .should((text) => {
          expect(text.trim()).to.match(DATE_RE);
        });
    });
  });

  // AC8: clicking a card navigates to the blog post URL.
  it('AC8: clicking a card navigates to the blog post URL', () => {
    // The card anchor must carry a real, non-placeholder href.
    cy.get('.our-blog .our-blog__card')
      .first()
      .should('have.attr', 'href')
      .and((href) => {
        expect(href, 'card href').to.be.a('string');
        expect(href.trim()).to.not.eq('');
        expect(href.trim()).to.not.eq('#');
      });

    cy.get('.our-blog .our-blog__card')
      .first()
      .invoke('attr', 'href')
      .then((href) => {
        cy.get('.our-blog .our-blog__card').first().click();
        // URL should change to the post target (compare against the resolved path).
        cy.location('pathname').should((pathname) => {
          const target = href.startsWith('http')
            ? new URL(href).pathname
            : href.split('?')[0].split('#')[0];
          expect(pathname).to.eq(target);
        });
      });
  });

  // AC6: card image uses object-fit cover and fills the card width.
  it('AC6: card image covers and fills the card width', () => {
    cy.get('.our-blog .our-blog__card')
      .first()
      .within(() => {
        cy.get('.our-blog__card-image img')
          .should('have.css', 'object-fit', 'cover');
      });

    // Image width should match the card-image container width (fills it).
    cy.get('.our-blog .our-blog__card')
      .first()
      .then(($card) => {
        const container = $card.find('.our-blog__card-image')[0];
        const img = $card.find('.our-blog__card-image img')[0];
        const containerWidth = container.getBoundingClientRect().width;
        const imgWidth = img.getBoundingClientRect().width;
        expect(Math.abs(containerWidth - imgWidth)).to.be.at.most(ROW_TOLERANCE);
      });
  });

  /**
   * AC10 (best-effort): empty state.
   *
   * When the section is authored with a heading but no post rows, the block adds
   * `.our-blog--empty`, renders `p.our-blog__empty` ("No posts available."), and
   * does NOT render `.our-blog__grid`.
   *
   * This is skipped by default because it requires a dedicated page/route where
   * the `our-blog` section is authored with zero posts. To enable it, author such
   * a page in da.live (or add a Cypress fixture/stub), set EMPTY_BLOG_PAGE below
   * to that route, and change `it.skip` to `it`.
   */
  const EMPTY_BLOG_PAGE = '/drafts/our-blog-empty';
  it.skip('AC10: renders empty state with no grid when there are no posts', () => {
    cy.visit(EMPTY_BLOG_PAGE);
    cy.get('.our-blog').should('exist');
    cy.get('.our-blog').should('have.class', 'our-blog--empty');
    cy.get('.our-blog .our-blog__empty')
      .should('be.visible')
      .and('contain.text', 'No posts available.');
    cy.get('.our-blog .our-blog__grid').should('not.exist');
  });
});
