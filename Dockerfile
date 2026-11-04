# Production image for the checkout server (app.js) and the built checkout (dist/).
#
# The Node version is pinned here on purpose. Nixpacks only selects the Node
# major version from package.json "engines", so it installed an old 22.x patch
# release (22.14.0) and ignored .nvmrc. Keep this version equal to .nvmrc.
FROM node:22.23.4-bookworm-slim

# The build reads the git history (conventional-recommended-bump) to compute
# the app version in the file names, so git must be installed and .git must be
# in the build context.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# The same environment as the Nixpacks build and runtime:
# - NODE_ENV=production: Express hides stack traces in error pages.
# - puppeteer is a dependency, but no code uses it. Do not download Chrome.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NX_DAEMON=false \
    NX_NO_CLOUD=true

WORKDIR /app
RUN chown node:node /app

# Build and run as the non-root "node" user of the official image.
USER node
COPY --chown=node:node . .

# The webpack build needs the devDependencies, so include them even though
# NODE_ENV=production.
RUN npm ci --include=dev && npm run build

EXPOSE 3000
CMD ["node", "server.js"]
