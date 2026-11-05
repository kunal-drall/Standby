import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'how-it-works',
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/issuer',
        'guides/lender',
        'guides/buyer',
        'guides/borrower',
        'guides/keeper',
      ],
    },
    'math',
    'architecture',
    'contracts',
    'read-api',
    'security',
    'deployments',
    'faq',
    'glossary',
  ],
};

export default sidebars;
