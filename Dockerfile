FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
CMD ["node", "src/mcp-stdio.js"]
