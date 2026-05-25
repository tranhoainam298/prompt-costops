FROM node:18-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN apt-get update && apt-get install -y openssl
RUN npm install
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:18-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install --only=production

COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
