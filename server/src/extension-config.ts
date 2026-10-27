// Served at GET /v1/extension/config. LinkedIn ships DOM changes weekly; keeping selectors here
// (data, not code, so it's allowed under Manifest V3) lets us fix extraction in minutes instead of
// waiting days for a Chrome Web Store review. The extension merges this over its bundled defaults.

export const EXTENSION_CONFIG = {
  version: '2026.10.27',
  minVersion: '2.0.0',
  features: { profiles: true, jobs: true },
  selectors: {
    profile: {
      name: ['main h1', 'h1.text-heading-xlarge', '.pv-text-details__left-panel h1'],
      headline: [
        'main section .text-body-medium.break-words',
        '.pv-text-details__left-panel .text-body-medium',
        'main section div.text-body-medium',
      ],
      location: [
        'main section span.text-body-small.inline.t-black--light.break-words',
        '.pv-text-details__left-panel span.text-body-small',
        'main section span.text-body-small.inline',
      ],
      anchor: ['main section h1', 'main h1'],
      experienceSection: ['section:has(> #experience)', 'section:has(#experience)', 'section[data-section="experience"]'],
      experienceItem: ['li.artdeco-list__item', 'li.pvs-list__paged-list-item', ':scope ul > li'],
      text: ['span[aria-hidden="true"]'],
    },
    job: {
      container: ['.jobs-search__job-details--container', '.job-view-layout', '.jobs-details', '.scaffold-layout__detail', 'main'],
      title: [
        '.job-details-jobs-unified-top-card__job-title h1',
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title',
        '.top-card-layout__title',
        'h1.t-24',
        'main h1',
      ],
      company: [
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name',
        '.topcard__org-name-link',
      ],
      meta: [
        '.job-details-jobs-unified-top-card__primary-description-container',
        '.job-details-jobs-unified-top-card__tertiary-description-container',
        '.jobs-unified-top-card__primary-description',
        '.topcard__flavor--bullet',
      ],
      insights: [
        '.job-details-fit-level-preferences',
        '.job-details-preferences-and-skills',
        '.job-details-jobs-unified-top-card__job-insight',
        '.jobs-unified-top-card__job-insight',
        '.description__job-criteria-list',
        '.compensation__salary',
      ],
      anchor: ['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', '.top-card-layout__title', 'main h1'],
    },
  },
  announcement: null as null | { id: string; text: string; url?: string },
};
