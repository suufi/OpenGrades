FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
    if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
    else echo "Lockfile not found." && exit 1; \
    fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN \
    --mount=type=secret,id=MONGODB_CONNECTION_URI \
    --mount=type=secret,id=MIT_OIDC_WELLKNOWN \
    --mount=type=secret,id=MIT_OIDC_CLIENT_ID \
    --mount=type=secret,id=MIT_OIDC_CLIENT_SECRET \
    --mount=type=secret,id=MIT_OIDC_AUTHORIZATION_ENDPOINT \
    --mount=type=secret,id=MIT_OIDC_ISSUER \
    --mount=type=secret,id=MIT_API_CLIENT_ID \
    --mount=type=secret,id=MIT_API_CLIENT_SECRET \
    --mount=type=secret,id=NEXTAUTH_SECRET \
    --mount=type=secret,id=NEXTAUTH_URL \
    --mount=type=secret,id=AUTH_TRUST_HOST \
    --mount=type=secret,id=ELASTIC_SEARCH_URI \
    --mount=type=secret,id=ELASTICSEARCH_EMBEDDINGS_INDEX \
    --mount=type=secret,id=MINIO_ENDPOINT \
    --mount=type=secret,id=MINIO_ACCESS_KEY_ID \
    --mount=type=secret,id=MINIO_SECRET_ACCESS_KEY \
    --mount=type=secret,id=MINIO_BUCKET_NAME \
    --mount=type=secret,id=MINIO_REGION \
    --mount=type=secret,id=OLLAMA_BASE_URL \
    --mount=type=secret,id=OLLAMA_EMBEDDING_MODEL \
    --mount=type=secret,id=OLLAMA_CHAT_MODEL \
    --mount=type=secret,id=OLLAMA_API_KEY \
    export MONGODB_CONNECTION_URI=$(cat /run/secrets/MONGODB_CONNECTION_URI) && \
    export MIT_OIDC_WELLKNOWN=$(cat /run/secrets/MIT_OIDC_WELLKNOWN) && \
    export MIT_OIDC_CLIENT_ID=$(cat /run/secrets/MIT_OIDC_CLIENT_ID) && \
    export MIT_OIDC_CLIENT_SECRET=$(cat /run/secrets/MIT_OIDC_CLIENT_SECRET) && \
    export MIT_OIDC_AUTHORIZATION_ENDPOINT=$(cat /run/secrets/MIT_OIDC_AUTHORIZATION_ENDPOINT) && \
    export MIT_OIDC_ISSUER=$(cat /run/secrets/MIT_OIDC_ISSUER) && \
    export MIT_API_CLIENT_ID=$(cat /run/secrets/MIT_API_CLIENT_ID) && \
    export MIT_API_CLIENT_SECRET=$(cat /run/secrets/MIT_API_CLIENT_SECRET) && \
    export NEXTAUTH_SECRET=$(cat /run/secrets/NEXTAUTH_SECRET) && \
    export NEXTAUTH_URL=$(cat /run/secrets/NEXTAUTH_URL) && \
    export AUTH_TRUST_HOST=$(cat /run/secrets/AUTH_TRUST_HOST) && \
    export ELASTIC_SEARCH_URI=$(cat /run/secrets/ELASTIC_SEARCH_URI) && \
    export ELASTICSEARCH_EMBEDDINGS_INDEX=$(cat /run/secrets/ELASTICSEARCH_EMBEDDINGS_INDEX) && \
    export MINIO_ENDPOINT=$(cat /run/secrets/MINIO_ENDPOINT) && \
    export MINIO_ACCESS_KEY_ID=$(cat /run/secrets/MINIO_ACCESS_KEY_ID) && \
    export MINIO_SECRET_ACCESS_KEY=$(cat /run/secrets/MINIO_SECRET_ACCESS_KEY) && \
    export MINIO_BUCKET_NAME=$(cat /run/secrets/MINIO_BUCKET_NAME) && \
    export MINIO_REGION=$(cat /run/secrets/MINIO_REGION) && \
    export OLLAMA_BASE_URL=$(cat /run/secrets/OLLAMA_BASE_URL) && \
    export OLLAMA_EMBEDDING_MODEL=$(cat /run/secrets/OLLAMA_EMBEDDING_MODEL) && \
    export OLLAMA_CHAT_MODEL=$(cat /run/secrets/OLLAMA_CHAT_MODEL) && \
    export OLLAMA_API_KEY=$(cat /run/secrets/OLLAMA_API_KEY) && \

    yarn run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
EXPOSE 443

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]