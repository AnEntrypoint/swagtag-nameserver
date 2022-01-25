require("dotenv").config();
const dns2 = require("dns2");

const fs = require("fs");
const path = require("path");
const { Packet } = dns2;
const lookup = require("./lookup.js");
const pending = {};

const nets = {
  fujiavax: {
    tunnelip: "129.213.57.168",
    tunnelhost: "fujiavax.ga",
    prefix: "https://domains.fujiavax.ga/",
    host: "https://api.avax-test.network/ext/bc/C/rpc",
    contract: "0xA133510258B8fdf5CcFe7d26aBFeF2D0f93497Bb",
  },
  avax: {
    tunnelip: "129.213.57.168",
    tunnelhost: "avax.ga",
    prefix: "https://domains.avax.ga/",
    host: "https://api.avax.network/ext/bc/C/rpc",
    contract: "0xc290698f5E5CdbF881d804f68ceb5b76Ada383Be",
  },
};

const overrides = {
  "www.avax.ga": [
    {
      type: 1,
      address: "185.199.110.153",
      name: "www.avax.ga",
      class: 1,
      ttl: 3600,
    },
    {
      type: 1,
      address: "185.199.111.153",
      name: "www.avax.ga",
      class: 1,
      ttl: 3600,
    },
    {
      type: 1,
      address: "185.199.109.153",
      name: "www.avax.ga",
      class: 1,
      ttl: 3600,
    },
  ],
  "avax.ga": [
    {
      type: 1,
      address: "185.199.110.153",
      name: "avax.ga",
      class: 1,
      ttl: 3600,
    },
    {
      type: 1,
      address: "185.199.111.153",
      name: "avax.ga",
      class: 1,
      ttl: 3600,
    },
    {
      type: 1,
      address: "185.199.109.153",
      name: "avax.ga",
      class: 1,
      ttl: 3600,
    },
  ],
  "www.fuji.avax.ga": [
    {
      type: 1,
      address: "129.213.57.168",
      name: "www.fuji.avax.ga",
      class: 1,
      ttl: 3600,
    },
  ],
  "www.fujiavax.ga": [
    {
      type: 1,
      address: "129.213.57.168",
      name: "www.fujiavax.ga",
      class: 1,
      ttl: 3600,
    },
  ],
  "fujiavax.ga": [
    {
      type: 1,
      address: "129.213.57.168",
      name: "fujiavax.ga",
      class: 1,
      ttl: 3600,
    },
  ],
};

const handle = async (request, send, rinfo) => {
  const response = Packet.createResponseFromRequest(request);
  const [question] = request.questions;
  let { name } = question;
  name = name.toLowerCase();
  let outname = name.split(".");
  let net = nets["avax"];

  if (!nets[outname[outname.length - 2]]) {
    return send(response);
  }
  net = nets[outname[outname.length - 2]];
  outname = outname[outname.length - 3];
  if(question.type == Packet.TYPE.AAAA) return send(response);
  if (overrides[question.name.toLowerCase()]) {
    response.answers = overrides[question.name.toLowerCase()];
  } else {
    if (!outname) {

      console.log("sending early", question);
      return send(response);
    }
    let pendingLookup = pending[name];
    if (!pendingLookup) {
      pendingLookup = lookup(outname.toLowerCase(), question, net.host, net);
      pending[name] = pendingLookup;
    }
    let lookedup = await pendingLookup;
    delete pending[name];
    if (!lookedup) {
      console.log("no lookup sending early", question);
      return send(response);
    }
    if (lookedup.answers) {
      for (let answer of lookedup.answers) {
        response.answers.push(answer);
      }
    }
    if (lookedup.authorities) {
      for (let authority of lookedup.authorities) {
        response.authorities.push(authority);
      }
    }
  }
  if (!response.authorities.length) {
    response.header.aa = 1;
  }
  console.log(JSON.stringify(response.answers, null, 2));
  send(response);
};

const server = dns2.createServer({
  udp: true,
  tcp: true,
  doh: {
    ssl: false,
  },
  handle,
});

server.on("close", () => {
  console.log("server closed");
});

server.listen({
  udp: 53,
});
