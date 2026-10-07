FROM node:24-alpine

WORKDIR /app

# npm ci honours package-lock.json exactly; --omit=dev keeps nodemon out of
# the image since the build and the server need no runtime dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# canonical / Open Graph / RSS / sitemap need the real origin, and they are
# baked in at build time.
ARG SITE_URL=https://shxin.blog
RUN SITE_URL="$SITE_URL" npm run build

ENV PORT=8002
EXPOSE 8002
USER node

CMD ["node", "site/server.mjs"]
