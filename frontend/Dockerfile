FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm install --no-audit --no-fund --workspace frontend --include-workspace-root=false
COPY frontend ./frontend
RUN npm run build --workspace frontend
ENV VITE_API_BASE_URL=http://localhost:4000/api/v1
EXPOSE 4173
CMD ["npm","run","preview","--workspace","frontend","--","--host","0.0.0.0","--port","4173"]
