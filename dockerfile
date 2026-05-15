FROM node:24-alpine

WORKDIR /app

COPY package.json /app/

RUN npm install

RUN npm install -g pm2

COPY . /app

EXPOSE 3000

CMD ["pm2-runtime", "ecosystem.config.js"]