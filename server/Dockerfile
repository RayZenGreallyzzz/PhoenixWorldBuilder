FROM node:22-alpine
WORKDIR /srv/phoenix
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY shared ./shared
COPY node ./node
RUN mkdir -p /srv/phoenix/data && chown -R node:node /srv/phoenix
USER node
EXPOSE 8787
ENV PHOENIX_HOST=0.0.0.0 PHOENIX_PORT=8787 PHOENIX_DATA_DIR=/srv/phoenix/data
CMD ["npm","start"]
