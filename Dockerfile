FROM node:18-alpine

WORKDIR /app

# Copy backend package files
COPY backend/package.railway.json ./package.json

# Install dependencies (including pg for PostgreSQL)
RUN npm install

# Copy backend source
COPY backend/src ./src
COPY backend/.env.example ./.env

# Copy frontend build
COPY frontend/dist ./public

# Expose port (Railway sets PORT env var)
EXPOSE 3001

# Start server
CMD ["npm", "start"]
