FROM node:20-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /srv/dist ./dist

EXPOSE 5000

CMD ["node", "dist/server.js"]
