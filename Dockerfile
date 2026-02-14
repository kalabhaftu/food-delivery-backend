FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Expose port 3000
EXPOSE 3000

# Start command
CMD ["node", "local_server.js"]
