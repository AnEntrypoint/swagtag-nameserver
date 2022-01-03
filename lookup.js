require('dotenv').config();
const dns2 = require("dns2");
const { Packet } = dns2;
const lookup = require("./lookup.js");
const pending = {};
const server = dns2.createServer({
  udp: true,
  handle: async (request, send, rinfo) => {
    const response = Packet.createResponseFromRequest(request);
    const [question] = request.questions;
    console.log({question});
    const { name } = question;
    let outname = name.split(".");
    outname.pop();
    outname.pop();
    const start = new Date().getTime();
    let pendingLookup = pending[name];
    if (!pendingLookup) {
      pendingLookup = lookup(outname.join(".").toLowerCase(), question.name.toLowerCase());
      pending[name] = pendingLookup;
    }
    let lookedup = await pendingLookup;
    delete pending[name];
    for(let answer of lookedup) response.answers.push(answer);
    console.log({lookedup})
    send(response);
  },
});

server.on("close", () => {
  console.log("server closed");
});

server.listen({
  udp: 53,
});

