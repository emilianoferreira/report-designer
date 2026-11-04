FROM node:22-bookworm-slim
WORKDIR /src
ENV NG_CLI_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
RUN npx playwright install --with-deps chromium
COPY angular.json tsconfig*.json ./
COPY src/ src/
COPY public/ public/
COPY e2e/stage8/karma.cjs e2e/stage8/angular-unit.mjs ./e2e/stage8/
CMD ["node", "e2e/stage8/angular-unit.mjs"]
