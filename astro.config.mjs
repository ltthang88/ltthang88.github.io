import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ltthang88.github.io',
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
});
