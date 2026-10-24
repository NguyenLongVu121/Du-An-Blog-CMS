FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
RUN addgroup -S -g 10001 cms && adduser -S -D -H -u 10001 -G cms cms
COPY --chown=cms:cms src ./src
COPY --chown=cms:cms views ./views
COPY --chown=cms:cms public ./public
USER 10001:10001
EXPOSE 3000
CMD ["node", "src/server.js"]
