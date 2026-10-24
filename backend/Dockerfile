FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm install --no-audit --no-fund --workspace backend --include-workspace-root=false
COPY backend ./backend
RUN npm run build --workspace backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm","run","start","--workspace","backend"]
