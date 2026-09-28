import { defineConfig } from 'vite';

// Cloudflare Web Analytics beacon — injected into every HTML page of the
// production build only (not in local dev or preview).
const cfBeacon = `<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "519b97ca534c48e6aff6d6298a48187f", "spa": true}'></script><!-- End Cloudflare Web Analytics -->`;

export default defineConfig(({ mode }) => ({
  base: '/Kerb/',
  plugins: [
    {
      name: 'inject-cf-beacon',
      transformIndexHtml(html) {
        if (mode === 'production') {
          return html.replace('<!--CF_BEACON-->', cfBeacon);
        }
        return html.replace('<!--CF_BEACON-->', '');
      },
    },
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
}));
