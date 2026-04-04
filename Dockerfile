FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/vouch-sdk/package.json packages/vouch-sdk/package.json

RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .

RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV SERVE_DASHBOARD=true
ENV VOUCH_DATA_DIR=/data

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/dashboard ./apps/dashboard
COPY --from=build /app/packages/vouch-sdk ./packages/vouch-sdk
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/.vouch.yml ./.vouch.yml

RUN npm prune --omit=dev && mkdir -p /data

EXPOSE 3001

CMD ["node", "apps/api/src/index.js"]
