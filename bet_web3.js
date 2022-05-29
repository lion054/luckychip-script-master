require('dotenv').config();
const Web3 = require('web3');

const HDWalletProvider = require('@truffle/hdwallet-provider');

function dateFormatFn(date,format='YYYY-MM-DD HH:mm:ss.ff'){
  let config = {
    YYYY:date.getFullYear(),
    MM:date.getMonth()+1>9?date.getMonth()+1:'0'+(date.getMonth()+1),
    DD:date.getDate()+1>9?date.getDate()+1:'0'+(date.getDate()+1),
    HH:date.getHours()>9?date.getHours():'0'+(date.getHours()),
    mm:date.getMinutes()>9?date.getMinutes():'0'+date.getMinutes(),
    ss:date.getSeconds()>9?date.getSeconds():'0'+date.getSeconds(),
    ff:date.getMilliseconds()
  };
  for(const key in config){
    format = format.replace(key,config[key]);
  }
  return format;
}

function nowString(){
  return dateFormatFn(new Date());
}

const EXPECTED_PONG_BACK = 15000
const KEEP_ALIVE_CHECK_INTERVAL = 60000

const Dice = require('./build/contracts/Dice.json');
const diceAddress = '0x170037EF2C730BC829aA791EA91447dC59677b68';
const DiceToken = require('./build/contracts/DiceToken.json');
const diceTokenAddress = '0x32760ff5b663E38125F3DE3595c3C1C4d99DFB42';
const WBNB = require('./build/contracts/WBNB.json');
const wbnbAddress = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd';

async function main(){

  const provider = new HDWalletProvider(process.env.MNEMONIC, process.env.NODE_URL);
  const admin = provider.addresses[0];
  console.log(admin);
  const web3 = new Web3(provider);

  const dice = new web3.eth.Contract(Dice.abi, diceAddress);
  const wbnb = new web3.eth.Contract(WBNB.abi, wbnbAddress);
  const diceToken = new web3.eth.Contract(DiceToken.abi, diceTokenAddress);

  const gasPriceBnb = await web3.eth.getGasPrice();
  const gasLimitBnb = 500000;

  await dice.methods.betNumber(
    [false,false,false,false,false,true],
    web3.utils.toWei('0.001').toString()
  ).send({
    from: admin,
    value: web3.utils.toWei('0.001').toString(),
    gas: gasLimitBnb,
    gasPriceBnb
  }).on('receipt', function(receipt){
    console.log(`Tx hash,${receipt.transactionHash},status,${receipt.status}`);
    });

  process.exit(0);	
  
}

main()
.then(() => console.log('main'))
.catch(e => console.log(e))
