// esbuild plugin to exclude vite.config.ts and vite-related packages from bundling
export const excludeVitePlugin = {
  name: 'exclude-vite',
  setup(build) {
    // Mark vite.config.ts as external
    build.onResolve({ filter: /vite\.config\.ts$/ }, () => {
      return { path: '../vite.config.ts', external: true };
    });
    // Mark vite.config.js as external (in case)
    build.onResolve({ filter: /vite\.config\.js$/ }, () => {
      return { path: '../vite.config.js', external: true };
    });
    // Mark vite as external
    build.onResolve({ filter: /^vite$/ }, () => {
      return { path: 'vite', external: true };
    });
    // Mark @vitejs packages as external
    build.onResolve({ filter: /^@vitejs\/.*$/ }, (args) => {
      return { path: args.path, external: true };
    });
    // Mark @replit/vite-plugin packages as external
    build.onResolve({ filter: /^@replit\/vite-plugin-.*$/ }, (args) => {
      return { path: args.path, external: true };
    });
  },
};

