const dns2 = require("dns2");
const { Packet } = dns2;
const lookup = require("./lookup.js");
const pending = {};
const server = dns2.createServer({
  udp: true,
  handle: async (request, send, rinfo) => {
    const response = Packet.createResponseFromRequest(request);
    const [question] = request.questions;
    //console.log({question});
    const { name } = question;
    let outname = name.split(".");
    outname.pop();
    outname.pop();
    const start = new Date().getTime();
    let pendingLookup = pending[name];
    if (!pendingLookup) {
      pendingLookup = lookup(outname.join("."));
      pending[name] = pendingLookup;
    }
    let lookedup = await pendingLookup;
    const { type } = lookedup;
    delete pending[name];
    const spent = start - new Date().getTime();
    const answer = {
      name,
      type,
      class: Packet.CLASS.IN,
      ttl: 3600,
    };
    if(lookedup.address) answer.address=lookedup.address;
    if(lookedup.domain) answer.domain=lookedup.domain;
    response.answers.push(answer);

    console.log(response, start);
    send(response);
  },
});

server.on("request", (request, response, rinfo) => {
  //console.log(request.header.id, request.questions[0]);
});

server.on("listening", () => {
  //console.log(server.address());
});

server.on("close", () => {
  console.log("server closed");
});

server.listen({
  udp: 53,
});

// eventually
//server.close();
