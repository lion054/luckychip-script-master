require('dotenv').config();

const ethers = require('ethers');
const fs = require('fs')
const {Contract, Provider} = require('ethers-multicall')

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

const WBNB = require('./build/contracts/WBNB.json');
const wbnbAddress = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd';
const DiceToken = require('./build/contracts/DiceToken.json');
const diceTokenAddress = process.env.DICETOKEN;
const Dice = require('./build/contracts/Dice.json');
const diceAddress = process.env.DICE;

async function main(){

  const provider = new ethers.providers.WebSocketProvider(process.env.NODE_URL)
  const walletMnemonic = ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
  const wallet = walletMnemonic.connect(provider);
  console.log(wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log(balance.toString());

  const dice = new ethers.Contract(diceAddress, Dice.abi, wallet);
  const wbnb = new ethers.Contract(wbnbAddress, WBNB.abi, wallet);
  const diceToken = new ethers.Contract(diceTokenAddress, DiceToken.abi, wallet);

  const multicallProvider = new Provider(provider);
  await multicallProvider.init();

  const gasPrice = await wallet.getGasPrice();
  //const gasPrice = ethers.utils.parseUnits(process.env.GAS_PRICE, 'gwei');
  console.log(`gasPrice,${nowString()},${gasPrice}`);
  const gasLimit = 500000;
  const options = {gasPrice, gasLimit};

  const currentBlock = await provider.getBlockNumber();
  console.log(`currentBlock,${currentBlock}`);

  const amount = '1.0';

  //await wbnb.approve(diceAddress, ethers.utils.parseEther(amount));
  await wbnb.approve(diceAddress, ethers.constants.MaxUint256);

  const tx = await dice.deposit(ethers.utils.parseEther(amount), options);
  const receipt = await tx.wait();
  console.log(`Tx hash,${receipt.transactionHash},status,${receipt.status}`);

  const diceTokenBalance = await diceToken.balanceOf(wallet.address);
  console.log(`diceTokenBalance,${diceTokenBalance.toString()}`);

  process.exit(0);	
  
}

main()
.then(() => console.log('main'))
.catch(e => console.log(e))
