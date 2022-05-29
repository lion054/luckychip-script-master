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

const Dice = require('./build/contracts/Dice.json');
const diceAddress = process.env.DICE;

const intervalBlocks = 20;

const startConnection = () => {
  provider = new ethers.providers.WebSocketProvider(process.env.NODE_URL)

  let pingTimeout = null
  let keepAliveInterval = null

  provider._websocket.on('open', () => {
    keepAliveInterval = setInterval(() => {
      console.log(`Checking,${nowString()},sending a ping`)

      provider._websocket.ping()

      // Use `WebSocket#terminate()`, which immediately destroys the connection,
      // instead of `WebSocket#close()`, which waits for the close timer.
      // Delay should be equal to the interval at which your server
      // sends out pings plus a conservative assumption of the latency.
      pingTimeout = setTimeout(() => {
        provider._websocket.terminate()
      }, EXPECTED_PONG_BACK)
    }, KEEP_ALIVE_CHECK_INTERVAL)

    // TODO: handle contract listeners setup + indexing
  })

  provider._websocket.on('close', () => {
    console.log(`WsClose,${nowString()},The websocket connection was closed`)
    clearInterval(keepAliveInterval)
    clearTimeout(pingTimeout)
    startConnection()
  })

  provider._websocket.on('pong', () => {
    console.log(`Received_pong,${nowString()},clearing the timeout`)
    clearInterval(pingTimeout)
  })
}

let provider;
startConnection();

async function main(){

  const walletMnemonic = ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
  const wallet = walletMnemonic.connect(provider);
  console.log(wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log(balance.toString());

  const gasPrice = await wallet.getGasPrice();
  //const gasPrice = ethers.utils.parseUnits(process.env.GAS_PRICE, 'gwei');
  console.log(`gasPrice,${nowString()},${gasPrice}`);

  const currentBlock = await provider.getBlockNumber();
  console.log(`currentBlock,${currentBlock}`);


  const dice = new ethers.Contract(diceAddress, Dice.abi, wallet);
  /*
  ethers-multicall doesn't support bsc testnet
  const multicallProvider = new Provider(provider, '97');
  await multicallProvider.init();
  const diceMulticall = new Contract(diceAddress, Dice.abi);
  const multicalls = [];
  multicalls.push(diceMulticall.paused());
  multicalls.push(diceMulticall.currentEpoch());
  multicalls.push(diceMulticall.playerEndBlock());
  multicalls.push(diceMulticall.bankerEndBlock());
  multicalls.push(diceMulticall.netValue());
  multicalls.push(diceMulticall.feeAmount());
  const results = await multicallProvider.all(multicalls);
  console.log(`multicallDone,${nowString()},${results.length}`); 
  for(var i = 0; i < results.length; i ++){
    console.log(`${results[i]}`);
  }
  */

  var randomNumbers = new Map();
  var bankHashs = new Map();
  var epochStatuses = new Map(); // 0 for open, 1 for locking, 2 for lock, 3 for sending secret, 4 for claimable, 5 for error or expired

  const gasLimit = 500000;
  const options = {gasPrice, gasLimit};
  let paused = await dice.paused();
  let diceStatus = paused ? 0 : 2; // 0 for bankerTime, 1 for endingBankerTime, 2 for playerTime, 3 for endingPlayerTime
  let lastRound = false;
  
  provider.on('block', async (blockNumber) => {
    paused = await dice.paused();
    const currentEpoch = Number(await dice.currentEpoch());
    console.log(`block,${blockNumber},${currentEpoch},${diceStatus},${nowString()}`);
    if(paused){
      console.log(`paused,bankerTime`);
      const bankerAmount = ethers.utils.formatEther(await dice.bankerAmount());
      const bankerEndBlock = await dice.bankerEndBlock();
      console.log(`bankerAmount,${bankerAmount},currentEpoch,${currentEpoch},bankerEndBlock,${bankerEndBlock}`);
      lastRound = false;
  
      if(blockNumber > bankerEndBlock && bankerAmount > 0){
        if(diceStatus == 0){
          diceStatus = 1; 
          const randomNumber = ethers.utils.hexlify(ethers.utils.randomBytes(32));
          const bankHash = ethers.utils.keccak256(randomNumber); 
          randomNumbers.set(currentEpoch + 1, randomNumber);
          bankHashs.set(currentEpoch + 1, bankHash);
          console.log(`Random,${currentEpoch + 1},${nowString()},${randomNumber},${bankHash}`);
   
          const tx = await dice.endBankerTime(currentEpoch + 1, bankHash, options);
          const receipt = await tx.wait();
          if(receipt.status === 1){
            console.log(`endBankerTime success,${receipt.transactionHash},${nowString()}`);
            diceStatus = 2; 
            epochStatuses.set(currentEpoch + 1, 0);
          }else{
            console.log(`endBankerTime fail,${receipt.status},${receipt.transactionHash},${nowString()}`);
            diceStatus = 0; 
          }
        }
      }
    }else{
      console.log(`unpaused,playerTime`);
      const playerEndBlock = await dice.playerEndBlock();
      const round = await dice.rounds(currentEpoch);
      if(blockNumber > playerEndBlock){
        const roundStatus = round[12];
        lastRound = true;
        if(roundStatus == 1){
            console.log(`currentEpoch not lock,${roundStatus}`);
            let epochStatus = epochStatuses.get(currentEpoch);
            if(typeof epochStatus === 'undefined' || epochStatus == 0){
              // 0 for open, 1 for locking, 2 for lock, 3 for sending secret, 4 for claimable, 5 for error or expired
              const lockBlock = round[2];
              if(Number(blockNumber) > Number(lockBlock) + Number(intervalBlocks)){
                if(diceStatus == 2){
                  diceStatus = 3;
                  console.log(`Exceed playerEndBlock limit. EndPlayerTimeImmediately,${roundStatus}`);
                  const tx = await dice.endPlayerTimeImmediately(currentEpoch, options);
                  const receipt = await tx.wait();
                  if(receipt.status === 1){
                    console.log(`EndPlayerTimeImmediately success,${receipt.transactionHash},${nowString()}`);
                    diceStatus = 0;
                    lastRound = false;
                  }else{
                    console.log(`EndPlayerTimeImmediately failed,${receipt.transactionHash},${nowString()}`);
                    diceStatus = 2;
                  }
                }else if(diceStatus == 3){
                  console.log(`Exceed playerEndBlock limit. EndPlayerTimeImmediately already sent,${roundStatus}`);
                }
              }else{
                epochStatuses.set(currentEpoch, 1);
                lastRound = true;
                const tx = await dice.lockRound(currentEpoch, options);
                const receipt = await tx.wait();
                if(receipt.status === 1){
                  console.log(`lockRound success,${receipt.transactionHash},${nowString()}`);
                  epochStatuses.set(currentEpoch, 2);
                }else{
                  console.log(`lockRound failed,${receipt.transactionHash},${nowString()}`);
                  epochStatuses.set(currentEpoch, 0);
                }
              }
            }else if(epochStatus == 1){
              console.log(`locking Round,${currentEpoch}`);
            }else{
              console.log(`status error0,${epochStatus}`);
            }
        }else if(roundStatus == 2){
            console.log(`currentEpoch not claimable,${roundStatus}`);
            // 0 for open, 1 for locking, 2 for lock, 3 for sending secret, 4 for claimable, 5 for error or expired
            let epochStatus = epochStatuses.get(currentEpoch);
            if(typeof epochStatus === 'undefined' || epochStatus == 2){
              epochStatuses.set(currentEpoch, 3);
              let randomNumber = randomNumbers.get(currentEpoch);
              if(typeof randomNumber === 'undefined'){
                if(diceStatus == 2){
                  diceStatus = 3;
                  const tx = await dice.endPlayerTimeImmediately(currentEpoch, options);
                  const receipt = await tx.wait();
                  if(receipt.status === 1){
                    console.log(`EndPlayerTimeImmediately success,${receipt.transactionHash},${nowString()}`);
                    epochStatuses.set(currentEpoch, 5);
                    diceStatus = 0;
                    lastRound = false;
                  }else{
                    console.log(`EndPlayerTimeImmediately failed,${receipt.transactionHash},${nowString()}`);
                    epochStatuses.set(currentEpoch, 5);
                    diceStatus = 2;
                  }
                }else if(diceStatus == 3){
                  console.log(`Exceed playerEndBlock limit. EndPlayerTimeImmediately already sent,${roundStatus}`);
                }
              }else{
                if(diceStatus == 2){
                  diceStatus = 3;
                  const tx = await dice.endPlayerTime(currentEpoch, randomNumber, options);
                  const receipt = await tx.wait();
                  if(receipt.status === 1){
                    console.log(`EndPlayerTime success,${receipt.transactionHash},${nowString()}`);
                    diceStatus = 0;
                    epochStatuses.set(currentEpoch, 4);
                    lastRound = false;
                  }else{
                    console.log(`EndPlayerTime success,${receipt.transactionHash},${nowString()}`);
                    diceStatus = 2;
                    epochStatuses.set(currentEpoch, 5);
                  }
                }else if(diceStatus == 3){
                  console.log(`Exceed playerEndBlock limit. EndPlayerTime already sent,${roundStatus}`);
                }
              }
            }else if(epochStatus == 3){
              console.log(`sending secret,${currentEpoch}`);
            }else{
              console.log(`status error1,${epochStatus}`);
            }
        }else if(roundStatus == 3){
          if(diceStatus == 2){
            diceStatus = 3;
            console.log(`CurrentEpoch claimed. EndPlayerTimeImmediately,${roundStatus}`);
            const tx = await dice.endPlayerTimeImmediately(currentEpoch, options);
            const receipt = await tx.wait();
            if(receipt.status === 1){
              console.log(`EndPlayerTimeImmediately success,${receipt.transactionHash},${nowString()}`);
              lastRound = false;
              diceStatus = 0;
            }else{
              console.log(`EndPlayerTimeImmediately failed,${receipt.transactionHash},${nowString()}`);
              diceStatus = 2;
            }
            epochStatuses.set(currentEpoch, 5);
          }else if(diceStatus == 3){
            console.log(`Exceed playerEndBlock limit. EndPlayerTime already sent,${roundStatus}`);
          }
        }else{
          console.log(`status error2,${roundStatus}`);
        }
      }else{
        const lockBlock = round[1];
        const roundStatus = round[12];
        if(Number(blockNumber) > Number(lockBlock) + Number(intervalBlocks)){
          console.log(`CurrentEpoch over time, restart a new round,${roundStatus}`);
          let epochStatus = epochStatuses.get(currentEpoch);
          if(typeof epochStatus === 'undefined'|| epochStatus != 5){
            epochStatuses.set(currentEpoch, 5);
            const randomNumber = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const bankHash = ethers.utils.keccak256(randomNumber); 
            randomNumbers.set(currentEpoch + 1, randomNumber);
            bankHashs.set(currentEpoch + 1, bankHash);
            console.log(`Random,${currentEpoch + 1},${nowString()},${randomNumber},${bankHash}`);
            const tx = await dice.manualStartRound(bankHash, options);
            const receipt = await tx.wait();
            if(receipt.status === 1){
              console.log(`manualStartRound success,${receipt.transactionHash},${nowString()}`);
            }else{
              console.log(`manualStartRound failed,${receipt.transactionHash},${nowString()}`);
            }
          }else{
            console.log(`manualStartRound already send,${epochStatus}`);
          }
        }else if(blockNumber > lockBlock){
          console.log(`try to lock currentEpoch,${roundStatus}`);
          if(roundStatus == 1){
            console.log(`currentEpoch not lock,${roundStatus}`);
            let epochStatus = epochStatuses.get(currentEpoch);
            if(typeof epochStatus === 'undefined' || epochStatus == 0){ 
              if(Number(playerEndBlock) > Number(lockBlock) + Number(intervalBlocks)){
                epochStatuses.set(currentEpoch, 1);
                console.log(`try executeRound,${roundStatus}`);
                const randomNumber = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                const bankHash = ethers.utils.keccak256(randomNumber); 
                randomNumbers.set(currentEpoch + 1, randomNumber);
                bankHashs.set(currentEpoch + 1, bankHash);
                console.log(`Random,${currentEpoch + 1},${nowString()},${randomNumber},${bankHash}`);
                lastRound = false;
  
                const tx = await dice.executeRound(currentEpoch, bankHash, options);
                const receipt = await tx.wait();
                if(receipt.status === 1){
                  console.log(`executeRound success,${receipt.transactionHash},${nowString()}`);
                  epochStatuses.set(currentEpoch, 2);
                }else{
                  console.log(`executeRound failed,${receipt.transactionHash},${nowString()}`);
                  epochStatuses.set(currentEpoch, 0);
                }
              }else{
                console.log(`no time for executeRound, lock current round,${roundStatus}`);
                epochStatuses.set(currentEpoch, 1);
                lastRound = true;
                const tx = await dice.lockRound(currentEpoch, options);
                const receipt = await tx.wait();
                if(receipt.status === 1){
                  console.log(`lockRound success,${receipt.transactionHash},${nowString()}`);
                  epochStatuses.set(currentEpoch, 2);
                }else{
                  console.log(`lockRound failed,${receipt.transactionHash},${nowString()}`);
                  epochStatuses.set(currentEpoch, 0);
                }
              }
            }else if(epochStatus == 1){
              console.log(`locking Round,${currentEpoch}`);
            }else{
              console.log(`status error3,${epochStatus}`);
            }
          }else if(roundStatus == 2){
            console.log(`currentEpoch has been lock,${roundStatus},${lockBlock}`);
            if(lastRound){
              let epochStatus = epochStatuses.get(currentEpoch);
              if(epochStatus == 2){
                epochStatuses.set(currentEpoch, 3);
                let randomNumber = randomNumbers.get(currentEpoch);
                if(typeof randomNumber === 'undefined'){
                  if(diceStatus == 2){
                    diceStatus = 3;
                    const tx = await dice.endPlayerTimeImmediately(currentEpoch, options);
                    const receipt = await tx.wait();
                    if(receipt.status === 1){
                      console.log(`EndPlayerTimeImmediately success,${receipt.transactionHash},${nowString()}`);
                      epochStatuses.set(currentEpoch, 5);
                      diceStatus = 0;
                      lastRound = false;
                    }else{
                      console.log(`EndPlayerTimeImmediately failed,${receipt.transactionHash},${nowString()}`);
                      epochStatuses.set(currentEpoch, 5);
                      diceStatus = 2;
                    }
                  }else if(diceStatus == 3){
                    console.log(`Exceed playerEndBlock limit. EndPlayerTimeImmediately already sent,${roundStatus}`);
                  }
                }else{
                  if(diceStatus == 2){
                    diceStatus = 3;
                    const tx = await dice.endPlayerTime(currentEpoch, randomNumber, options);
                    const receipt = await tx.wait();
                    if(receipt.status === 1){
                      console.log(`EndPlayerTime success,${receipt.transactionHash},${nowString()}`);
                      diceStatus = 0;
                      epochStatuses.set(currentEpoch, 4);
                      lastRound = false;
                    }else{
                      console.log(`EndPlayerTime success,${receipt.transactionHash},${nowString()}`);
                      diceStatus = 2;
                      epochStatuses.set(currentEpoch, 5);
                    }
                  }else if(diceStatus == 3){
                    console.log(`Exceed playerEndBlock limit. EndPlayerTime already sent,${roundStatus}`);
                  }
                }
              }else if(epochStatus == 3){
                console.log(`sending secret,${currentEpoch}`);
              }else{
                console.log(`status error4,${epochStatus}`);
              }
            }
          }else{
            console.log(`status error5,${roundStatus},${lockBlock}`);
          }
        }else{
          // check whether pre epoch is claimed
          console.log(`try to claim preEpoch,${currentEpoch},${roundStatus}`);
          let epochStatus = epochStatuses.get(currentEpoch - 1);
          if(epochStatus == 2){
            epochStatuses.set(currentEpoch-1, 3);
            let randomNumber = randomNumbers.get(currentEpoch-1);
            if(typeof randomNumber === 'undefined'){
              console.log(`sendSecret not found,${nowString()}`); 
              epochStatuses.set(currentEpoch-1, 2);
            }else{
              const tx = await dice.sendSecret(currentEpoch-1, randomNumber, options);
              const receipt = await tx.wait();
              if(receipt.status === 1){
                console.log(`sendSecret success,${receipt.transactionHash},${nowString()}`);
                epochStatuses.set(currentEpoch-1, 4);
              }else{
                console.log(`sendSecret failed,${receipt.transactionHash},${nowString()}`);
                epochStatuses.set(currentEpoch-1, 5);
              }
            } 
          }else{
            console.log(`no need to sendSecret,${epochStatus},${nowString()}`);
          }
        }
      }
    }
  });
}

main()
.then(() => console.log('main'))
.catch(e => console.log(e))
