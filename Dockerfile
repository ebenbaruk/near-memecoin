FROM node:24.22.2-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json .nvmrc ./
COPY sim/package.json sim/
COPY web/package.json web/
COPY bots/package.json bots/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY web web
COPY bots bots
RUN npm run -w web build
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "bots/server.mjs"]
