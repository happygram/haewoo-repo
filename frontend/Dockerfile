FROM node:24.13-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . ./
RUN npm run build

FROM node:24.13-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.js ./server.js
COPY package.json ./package.json

# 기본 포트 3000 (로컬/컨테이너 기본값. 운영에서 80은 ALB/리버스 프록시로 매핑)
ENV PORT=3000

# docker-compose 기준 기본값: frontend 컨테이너에서 backend 컨테이너로 `/api/*` 프록시
ENV API_PROXY_TARGET=http://backend:3001

EXPOSE 3000
CMD ["node", "server.js"]
