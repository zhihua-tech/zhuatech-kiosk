FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY agent ./agent
COPY web ./web
RUN mkdir -p data && adduser -D -u 10001 app && chown -R app /app
USER app
EXPOSE 18085
CMD ["node", "src/server.js"]
