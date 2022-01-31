FROM node:14
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
EXPOSE 443
EXPOSE 53
EXPOSE 53/udp
COPY . .
CMD [ "node", "server.js" ]
