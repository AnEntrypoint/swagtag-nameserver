const Web3 = require("web3");
const web3 = new Web3("https://api.avax-test.network/ext/bc/C/rpc");
const NodeCache = require("node-cache");
const myCache = new NodeCache({ stdTTL: 60 * 60 * 10, checkperiod: 120 });
const DHT = require("@hyperswarm/dht");
var base32 = require("hi-base32");
const node = new DHT();
const { Packet } = require('dns2');

const ABI = [
  {
    constant: true,
    inputs: [
      {
        internalType: "string",
        name: "_name",
        type: "string",
      },
    ],
    name: "viewNamesIPAddress",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
];

const ips = {};
const contract = new web3.eth.Contract(
  ABI,
  "0xA237c2A675009a9B3eca8728c8925AF6F4002F29"
);
module.exports = async (outname) => {
  const cache = myCache.get(outname);

  const update = async () => {
    let address = await contract.methods
    .viewNamesIPAddress(outname.toLowerCase())
    .call();
    if (address.startsWith("tun:")) {
      let addressout = address.split(':');
      const hash = addressout.pop();
      addressout.shift();
      return {type:Packet.TYPE.CNAME, domain:hash+"."+'entrypoint.ga'};
    } 
    if (address.startsWith("ddns:")) {
      const hash = address.replace("ddns:", "");
      const publicKey = Buffer.from(base32.decode.asBytes(hash.toUpperCase()));
      console.log(publicKey.toString("hex"));
      const noiseSocket = node.connect(publicKey);

      noiseSocket.on("close", function () {
        console.log("Client closed...");
      });
      return await new Promise((done) => {
        noiseSocket.on("data", function (data) {
          const res = JSON.parse(data);
          console.log('ddns found host', res.host);
          noiseSocket.end();
          const out = {type:Packet.TYPE.A, address:res.host};
          myCache.set(outname, out);
          done(out);
        });
      }); 
    } else {
      myCache.set(outname, address);
    }
    console.log('normal return', address)
    return {type:Packet.TYPE.A, address};
  };
  if (cache) return cache;
  return update();
};
