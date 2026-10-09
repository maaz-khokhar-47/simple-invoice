FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev


FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./

USER node
EXPOSE 3000
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
