import path from 'path';
import type {Plugin} from '@docusaurus/types';

export default function mermaidElkStub(): Plugin {
  return {
    name: 'mermaid-elk-stub',
    configureWebpack() {
      return {
        resolve: {
          alias: {'@mermaid-js/layout-elk': path.resolve(__dirname, 'elk-stub.js')},
        },
      };
    },
  };
}
