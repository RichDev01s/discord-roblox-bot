FROM node:22-slim

RUN npm install -g pnpm@10

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./
COPY tsconfig.json* ./

COPY lib/ ./lib/
COPY artifacts/discord-bot/ ./artifacts/discord-bot/

RUN pnpm install --filter @workspace/discord-bot... --no-frozen-lockfile

CMD ["pnpm", "--filter", "@workspace/discord-bot", "run", "dev"]
