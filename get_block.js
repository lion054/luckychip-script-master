require('dotenv').config();

const ethers = require('ethers');
const fs = require('fs')

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

async function main(){

  const provider = new ethers.providers.WebSocketProvider(process.env.NODE_URL)
  const walletMnemonic = ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
  const wallet = walletMnemonic.connect(provider);
  console.log(wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log(balance.toString());
  const currentBlock = await provider.getBlockNumber();
  console.log(`currentBlock,${currentBlock}`);
  process.exit(0);	
  
}

main()
.then(() => console.log('main'))
.catch(e => console.log(e))
