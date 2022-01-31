const Web3 = require("web3");
const nets = [];
const NodeCache = require("node-cache");
const DHT = require("@hyperswarm/dht");
const axios = require("axios");
const base32 = require("hi-base32");
const node = new DHT();
const { Packet } = require("dns2");
const ipcnode = require("hyper-ipc")(process.env.SECRET);

const init = async () => {
  const del = (input) => {
    try {
      if (!input || !input.net || !input.del) return true;
      const { net, del } = input;
      if (!net) return;
      console.log(net);
      if (!nets[net]) {
        nets[net] = [];
        const web3 = (nets[net].web3 = new Web3(net));
        nets[net].contract = new web3.eth.Contract(ABI, contract);
        nets[net].cache = new NodeCache({ stdTTL: 60 * 10, checkperiod: 120 });
        nets[net].tunnelhost = tunnelhost;
        nets[net].tunnelip = tunnelip;
      }
      nets[net].cache.del(del);
      return('done')
    } catch(e) {
      return(e)
    }
    console.log("cache cleared for", del);
  };
  try {
    await ipcnode.run("ns01", {});
  } catch (e) {
    console.error(e);
    console.log("launching ns01");
    ipcnode.serve("ns01", del);
    return;
  }
  try {
    console.error(e);
    console.log("launching ns02");
    await ipcnode.run("ns02", {});
  } catch (e) {
    ipcnode.serve("ns02", del);
    return;
  }
};
setTimeout(init, 4000);
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
  console.log({ question });

  const { contract, tunnelhost, tunnelip } = network;
  if (typeof input != "string") return [];
  if (!net) return;
  if (!nets[net]) {
    nets[net] = [];
    const web3 = (nets[net].web3 = new Web3(net));
    nets[net].contract = new web3.eth.Contract(ABI, contract);
    nets[net].cache = new NodeCache({ stdTTL: 60 * 10, checkperiod: 120 });
    nets[net].tunnelhost = tunnelhost;
    nets[net].tunnelip = tunnelip;
  }

  const tunnel = question.name.toLowerCase().replace(input + ".", "");
  //check if tunnel subdomain
  let publicKey = "";
  try {
    publicKey = Buffer.from(base32.decode.asBytes(input.toUpperCase()));
  } catch (e) {}
  if (
    publicKey.length == 32 ||
    input === "txt" ||
    input === "exists" ||
    input === "domains" ||
    input === "trades" ||
    input === "balance" ||
    input === "bumps"
  ) {
    return {
      answers: [
        {
          type: Packet.TYPE.A,
          name: question.name.toLowerCase(),
          address: nets[net].tunnelip,
          class: Packet.CLASS.IN,
          ttl: 3600,
        },
      ],
    };
  }
  if (question.name.toLowerCase().startsWith("reload")) {
    const del = input;

    try {
      console.log(await ipcnode.run("ns01", { net, del }));
    } catch (e) {
      console.error(e);
    }
    try {
      console.log(await ipcnode.run("ns02", { net, del }));
    } catch (e) {
      console.error(e);
    }
    return {};
  } else if (!question.name.toLowerCase().startsWith("_acme-challenge")) {
    const cache = nets[net].cache.get(input);
    if (cache) return cache;
  }

  //check if acme challenge
  if (question.type == 16) {
    console.log({ question });
    const tunnelhost = nets[net].tunnelhost;
    if (!question.name.toLowerCase().endsWith(tunnelhost)) return;
    const data = (await axios.get("http://txt." + tunnelhost)).data
      .trim()
      .replace(/\n/g, "");
    return {
      answers: [
        {
          type: Packet.TYPE.TXT,
          name: question.name.toLowerCase(),
          data,
          class: Packet.CLASS.IN,
          ttl: 1,
        },
      ],
    };
  }
  try {
    let config = await nets[net].contract.methods
      .getAddress(input.toLowerCase())
      .call();
    if (!config.length) return false;
    config = JSON.parse(config);
    const types = {
      cname: () => {
        if (config.mode !== "cname") return;
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
        ];
        if (ips.length) {
          out.push({
            type: Packet.TYPE.CNAME,
            name: domain,
            domain: "cname-server",
            class: Packet.CLASS.IN,
            ttl: 3600,
          });
        }

        for (let ip of ips) {
          out.push({
            type: Packet.TYPE.A,
            name: "cname-server",
            address: ip,
            class: Packet.CLASS.IN,
            ttl: 3600,
          });
        }
        return { answers: out };
      },
      tunnel: () => {
        if (config.mode !== "tunnel") return;
        const hash = config.tunnel;
        const domain = hash + "." + nets[net].tunnelhost;
        return {
          answers: [
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
          ],
        };
      },
      ddns: () => {
        if (config.mode !== "ddns") return;
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
            done({ answers: out });
          });
        });
      },
      ns: () => {
        if (config.mode !== "ns") return;
        if (config.ns.length) {
          const ret = [];
          console.log(config.ns, config.ips);
          for (let index = 0; index < config.ns.length; index++) {
            if (!config.ns[index]) continue;
            ret.push({
              type: Packet.TYPE.NS,
              ns: config.ns[index],
              name: question.name.toLowerCase(),
              class: Packet.CLASS.IN,
              ttl: 3600,
            });
          }
          console.log({ ret });
          return { authorities: ret };
        }
      },
      a: () => {
        if (config.mode !== "a") return;
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
          return { answers: ret };
        }
      },
    };

    const handled = types[config.mode]();
    if (!question.name.toLowerCase().startsWith("_acme-challenge"))
      nets[net].cache.set(input, handled);
    return handled;
  } catch (e) {
    console.trace(e);
    return [];
  }
};
