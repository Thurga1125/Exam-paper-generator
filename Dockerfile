# Production image with LibreOffice (needed for PDF export)
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Public Supabase values are inlined at build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation fonts-noto-core fonts-noto-extra && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production SOFFICE_PATH=/usr/bin/soffice
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
