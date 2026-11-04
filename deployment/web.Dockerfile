FROM node:22-bookworm-slim AS build
WORKDIR /src
ENV NG_CLI_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY angular.json tsconfig*.json ./
COPY src/ src/
COPY public/ public/
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime
COPY --from=build /src/dist/zureo-report-designer/browser/ /usr/share/nginx/html/
COPY deployment/nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=api-dotnet:8080
ENV NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
EXPOSE 8080
