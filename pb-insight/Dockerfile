FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# O grafo do codebase (.data/graph.json, ~130MB) NÃO vem na imagem: é gerado
# por `npm run ingest` a partir do repo do SMART Desktop, que cada máquina
# monta como volume. Ver README — a plataforma funciona sem isso, só perde o
# grounding em código (e o card avisa quando isso acontece).
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4500
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "serve"]
