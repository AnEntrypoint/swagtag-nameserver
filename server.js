require('dotenv').config();
const dns2 = require("dns2");
const { Packet } = dns2;
const lookup = require("./lookup.js");
const pending = {};
const nets = {
  'test':{
    tunnelip:'129.213.57.168',
    tunnelhost:'test.avax.ga',
    host:"https://api.avax-test.network/ext/bc/C/rpc",
    contract:"0x30fd3f22BD652cE1339922D7701b3D35F13c4E46",
  },
  'fuji':{
    tunnelip:'129.213.57.168',
    tunnelhost:'fuji.avax.ga',
    host:"https://api.avax-test.network/ext/bc/C/rpc",
    contract:"0x30fd3f22BD652cE1339922D7701b3D35F13c4E46",
  },
  'avax':{
    tunnelip:'129.213.57.168',
    tunnelhost:'avax.ga',
    host:"https://api.avax-test.network/ext/bc/C/rpc",
    contract:"0x30fd3f22BD652cE1339922D7701b3D35F13c4E46",
  }
 }
 
const server = dns2.createServer({
  udp: true,
  handle: async (request, send, rinfo) => {
    const response = Packet.createResponseFromRequest(request);
    const [question] = request.questions;
    console.log({question});
    
    const { name } = question;
    let outname = name.split(".");
    let net = nets['avax'];

    if(outname.length > 2 && Object.keys(nets).includes(outname[outname.length-3])) {
      net = nets[outname[outname.length-3]];
      outname.pop();
    }
    if(outname.length > 1 && Object.keys(nets).includes(outname[outname.length-2])) {
      net = nets[outname[outname.length-2]];
    }
  
    outname.pop();
    outname.pop();
    let pendingLookup = pending[name];
    if (!pendingLookup) {
      pendingLookup = lookup(outname.join(".").toLowerCase(), question.name.toLowerCase(), net.host, net.contract, net.tunnelhost, net.tunnelip);
      pending[name] = pendingLookup;
    }
    let lookedup = await pendingLookup;
    delete pending[name];
    console.log(lookedup);
    if(!lookedup) return send(response);
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

