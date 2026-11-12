FROM node:22-bookworm-slim

WORKDIR /app

# Codex CLI runs in a restricted Linux sandbox inside the worker container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends bubblewrap ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @openai/codex

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Railway should mount its persistent Volume at this directory.
RUN mkdir -p /app/agency/projects

ENV NODE_ENV=production
ENV GMAIL_PRIVATE_DIR=/app/agency/projects/.worker-state/gmail/private
CMD ["npm", "start"]
