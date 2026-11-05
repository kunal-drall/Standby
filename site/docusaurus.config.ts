import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Standby',
  tagline: 'Lend against restricted assets, with the buyer lined up first',
  favicon: 'img/favicon.svg',

  // TODO(kunal): final docs domain
  url: 'https://standby-docs.vercel.app',
  baseUrl: '/',

  organizationName: 'kunal-drall',
  projectName: 'Standby',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  markdown: {
    mermaid: true,
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],
  plugins: ['./src/plugins/mermaid-elk-stub.ts'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/kunal-drall/Standby/tree/main/site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Standby',
      logo: {alt: 'Standby', src: 'img/logo.svg'},
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs'},
        {to: '/contracts', label: 'Contracts', position: 'left'},
        {to: '/read-api', label: 'Read API', position: 'left'},
        {href: 'https://github.com/kunal-drall/Standby', label: 'GitHub', position: 'right'},
        // TODO(kunal): final docs domain
        {href: 'https://standby.vercel.app', label: 'App', position: 'right'},
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'How Standby works', to: '/how-it-works'},
            {label: 'Limit and settlement math', to: '/math'},
            {label: 'Contracts', to: '/contracts'},
          ],
        },
        {
          title: 'Links',
          items: [
            {label: 'GitHub', href: 'https://github.com/kunal-drall/Standby'},
            {label: 'Block explorer', href: 'https://explorer.testnet.whitechain.io'},
            {label: 'Faucet (WBT for gas)', href: 'https://faucet.testnet.whitechain.io'},
          ],
        },
      ],
      copyright: 'Standby. Built at ETHGlobal Mumbai. Testnet only, not audited.',
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['solidity', 'bash', 'json'],
    },
    mermaid: {theme: {light: 'neutral', dark: 'dark'}},
  } satisfies Preset.ThemeConfig,
};

export default config;
