FROM node:24-alpine

WORKDIR /app

COPY package.json /app/

RUN npm install

COPY . /app


EXPOSE 3000

CMD ["node", "index.js"]