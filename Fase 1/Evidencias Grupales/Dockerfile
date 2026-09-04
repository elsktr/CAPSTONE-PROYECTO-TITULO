# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime
LABEL org.opencontainers.image.title="Cuervo Negro · Rockstar e-commerce" \
      org.opencontainers.image.description="MVP Tienda de ropa Rock & Metal - Ionic Angular (Web + Mobile via Capacitor)" \
      org.opencontainers.image.source="https://github.com/"

COPY --from=build /app/www /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
