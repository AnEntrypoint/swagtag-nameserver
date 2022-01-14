const Web3 = require("web3");
const nets = [];
const NodeCache = require("node-cache");
const DHT = require("@hyperswarm/dht");
const axios = require("axios");
const base32 = require("hi-base32");
const node = new DHT();
const { Packet } = require("dns2");

const ABI = [
  {
    inputs: [
      {
        internalType: "string",
        name: "_name",
        type: "string",
      },
    ],
    name: "getAddress",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
    constant: true,
  },
];

module.exports = async (input, question, net, network) => {
  const { contract, tunnelhost, tunnelip } = network;
  console.log("LOOKING UP")
  console.log({ net });
  if (typeof input != 'string') return [];
  if (!net) return;
  if (!nets[net]) {
    nets[net] = [];
    const web3 = (nets[net].web3 = new Web3(net));
    nets[net].contract = new web3.eth.Contract(ABI, contract);
    nets[net].cache = new NodeCache({ stdTTL: 60 * 60 * 10, checkperiod: 120 });
    nets[net].tunnelhost = tunnelhost;
    nets[net].tunnelip = tunnelip;
  }
  const cache = nets[net].cache.get(question.name.toLowerCase());
  console.log({ cache });
  if (cache) return cache;

  const tunnel = question.name.toLowerCase().replace(input + ".", "");
  console.log({ input });
  //check if tunnel subdomain
  let publicKey = "";
  try {
    publicKey = Buffer.from(base32.decode.asBytes(input.toUpperCase()));
  } catch (e) { }
  if (
    publicKey.length == 32 ||
    input == "txt" ||
    input == "exists" ||
    input == "domains"
  ) {
    return [
      {
        type: Packet.TYPE.A,
        name: question.name.toLowerCase(),
        address: nets[net].tunnelip,
        class: Packet.CLASS.IN,
        ttl: 3600,
      },
    ];
  }
  //check if acme challenge
  console.log('is', question);
  if (input.startsWith("_acme-challenge") || question.type == 16) {
    console.log("TXT", tunnel);
    const tunnelhost = nets[net].tunnelhost;


    const data = (await axios.get("http://txt." + tunnelhost)).data
      .trim()
      .replace(/\n/g, "");
    console.log({ data });
    return [
      {
        type: Packet.TYPE.TXT,
        name: question.name.toLowerCase(),
        data,
        class: Packet.CLASS.IN,
        ttl: 3600,
      },
    ];
  }
  try {
    let config = await nets[net].contract.methods
      .getAddress(network.prefix + input)
      .call();
    if (!config) config = await nets[net].contract.methods.getAddress(network.prefix + '#' + input.toLowerCase()).call();
    config = JSON.parse(config);
    console.log({ config });
    const types = [
      function cname() {
        if (!config.cname) return;
        const domain = config.cname;
        const ips = config.ips;
        const out = [
          {
            type: Packet.TYPE.CNAME,
            name: question.name.toLowerCase(),
            domain,
            class: Packet.CLASS.IN,
            ttl: 3600,
          },
          {
            type: Packet.TYPE.CNAME,
            name: domain,
            domain: "cname-server",
            class: Packet.CLASS.IN,
            ttl: 3600,
          },
        ];

        for (let ip of ips) {
          out.push({
            type: Packet.TYPE.A,
            name: "cname-server",
            address: ip,
            class: Packet.CLASS.IN,
            ttl: 3600,
          });
        }
        return out;
      },
      function tunnel() {
        if (!config.tunnel) return;
        const hash = config.tunnel;
        const domain = hash + "." + nets[net].tunnelhost;
        return [
          {
            type: Packet.TYPE.CNAME,
            name: question.name.toLowerCase(),
            domain,
            class: Packet.CLASS.IN,
            ttl: 3600,
          },
          {
            type: Packet.TYPE.A,
            name: domain,
            address: nets[net].tunnelip,
            class: Packet.CLASS.IN,
            ttl: 3600,
          },
        ];
      },
      function ddns() {
        if (!config.ddns) return;
        const hash = config.ddns;
        const publicKey = Buffer.from(
          base32.decode.asBytes(hash.toUpperCase())
        );
        const noiseSocket = node.connect(publicKey);
        noiseSocket.on("close", function () {
          console.log("Client closed...");
        });
        return new Promise((done) => {
          noiseSocket.on("data", function (data) {
            const res = JSON.parse(data);
            console.log("ddns found host", res.host);
            noiseSocket.end();
            const out = [
              {
                type: Packet.TYPE.A,
                name: question.name.toLowerCase(),
                address: res.host,
                class: Packet.CLASS.IN,
                ttl: 3600,
              },
            ];
            done(out);
          });
        });
      },
      function a() {
        if (config.ips.length) {
          const ret = [];
          config.ips.forEach((address) =>
            ret.push({
              type: Packet.TYPE.A,
              address,
              name: question.name.toLowerCase(),
              class: Packet.CLASS.IN,
              ttl: 3600,
            })
          );
          return ret;
        }
      },
    ];
    const out = [];
    for (let handler of types) {
      const handled = handler();
      if (handled) {
        console.log({ handled });
        nets[net].cache.set(input, handled);
        return handled;
      }
    }
  } catch (e) {
    console.trace(e);
    return [];
  }
};
