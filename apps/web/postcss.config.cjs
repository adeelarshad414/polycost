module.exports = {
  plugins: {
    // Tailwind 4 moved the PostCSS plugin into its own package, and folds
    // vendor prefixing in via Lightning CSS - so autoprefixer is gone rather
    // than merely unlisted.
    '@tailwindcss/postcss': {},
  },
};
