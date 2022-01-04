const Web3 = require("web3");
const nets = [];
const NodeCache = require("node-cache");
const DHT = require("@hyperswarm/dht");
const axios = require("axios");
const base32 = require("hi-base32");
const node = new DHT();
const { Packet } = require('dns2');

const ABI = [
      {
      "inputs": [
        {
          "internalType": "string",
          "name": "_name",
          "type": "string"
        }
      ],
      "name": "getAddress",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    }
];

module.exports = async (input, question, net, contract, tunnelhost, tunnelip) => {
  console.log({net, contract})
  if(!input.length) return [];
  if(!net) return;
  if(!nets[net]) {
    nets[net] = [];
    const web3 = nets[net].web3 = new Web3(net);
    nets[net].contract = new web3.eth.Contract(ABI,contract);
    nets[net].cache = new NodeCache({ stdTTL: 60 * 60 * 10, checkperiod: 120 });
    nets[net].tunnelhost = tunnelhost;
    nets[net].tunnelip = tunnelip;
  }
  const cache = nets[net].cache.get(question);
  if(cache) return cache;
    
  const tunnel = question.replace(input+'.', '');
  console.log({input});
  //check if tunnel subdomain
  let publicKey = '';
  try {publicKey = Buffer.from(base32.decode.asBytes(input.toUpperCase()))} catch(e) {}
  if(publicKey.length == 32 || input == 'txt' || input == "exists") {
    return [
      {
        type: Packet.TYPE.A,
        name: question,
        address:nets[net].tunnelip,
        class: Packet.CLASS.IN,
        ttl: 3600
      }
    ];
  }
  //check if acme challenge
  if(input.startsWith('_acme-challenge')) {
      const data = (await axios.get('http://txt.'+tunnel)).data.trim().replace(/\n/g,'');
      console.log({data});
      return [
        {
          type: Packet.TYPE.TXT,
          name: question,
          data,
          class: Packet.CLASS.IN,
          ttl: 3600
        }
      ]
  }
  try {
    let config = await nets[net].contract.methods.getAddress(input).call();
    console.log({config})
    const types = [
      function cname() {
        if (config.startsWith("cname:")) {
          let addressout = config.split(':');
          addressout.shift();
          const domain = addressout.shift();
          const ips = addressout.shift();
          const out = [{
            type:Packet.TYPE.CNAME,
            name:question,
            domain,
            class: Packet.CLASS.IN,
            ttl: 3600
          },{
            type:Packet.TYPE.CNAME,
            name:domain,
            domain:'cname-server',
            class: Packet.CLASS.IN,
            ttl: 3600
          }];
          
          for(let ip of ips.split(',')) {
            out.push({
              type:Packet.TYPE.A,
              name:'cname-server',
              address:ip,
              class: Packet.CLASS.IN,
              ttl: 3600
            })
          }
          console.log({out})
          return out;
        }
      },
      function tunnel() {
        if (config.startsWith("tun:")) {
          let addressout = config.split(':');
          const hash = addressout.pop();
          const domain = hash+'.'+nets[net].tunnelhost;
          return [
            {
              type:Packet.TYPE.CNAME,
              name:question,
              domain,
              class: Packet.CLASS.IN,
              ttl: 3600
            },
            {
              type:Packet.TYPE.A,
              name:domain,
              address:nets[net].tunnelip,
              class: Packet.CLASS.IN,
              ttl: 3600
            }
          ];
        }
      },
      function ddns() {
        if (config.startsWith("ddns:")) {
          const hash = config.replace("ddns:", "");
          const publicKey = Buffer.from(base32.decode.asBytes(hash.toUpperCase()));
          const noiseSocket = node.connect(publicKey);
          noiseSocket.on("close", function () {
            console.log("Client closed...");
          });
          return new mise((done) => {
            noiseSocket.on("data", function (data) {
              const res = JSON.parse(data);
              console.log('ddns found host', res.host);
              noiseSocket.end();
              const out = [
                {
                  type:Packet.TYPE.A,
                  name:question,
                  address:res.host,
                  class: Packet.CLASS.IN,
                  ttl: 3600
                }
              ];
              done(out);
            });
          }); 
        }      
      },
      function a() {
        if(config.length) return [
          {
            type:Packet.TYPE.A,
            address:config,
            name:question,
            class: Packet.CLASS.IN,
            ttl: 3600
          }
        ]
      }
    ]
    const out = [];
    for(let handler of types) {
      const handled = handler();
      console.log({handled});
      if(handled) {
        nets[net].cache.set(input, handled);
        return(handled);
      }
    }
  } catch(e) {
    console.trace(e);
    return [];
  }

};
