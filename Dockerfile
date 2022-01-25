FROM node:14
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 443
EXPOSE 53
EXPOSE 53/udp
CMD [ "node", "server.js" ]
