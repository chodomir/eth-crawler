const Web3 = require('web3');
const web3 = new Web3('https://mainnet.infura.io/v3/3ef7aa6001544f088a8b13f12e162d56');

// NOTE
// Database would make transactions searches a LOT faster (at a cost of storage space)
// I chose no database for simplicity sakes (but searches can be really slow)

/* 
    First 32 bits of transaction input data is the method used 
    when interacting with a contract 
*/
const transferID = "0xa9059cbb";
/* 
    Simple json interface for:
    ERC20 name() function
    ERC20 balanceOf() function
*/
const simpleErc20Abi = [
    {
        'inputs': [],
        'name': 'name',
        'outputs': [{'name': '', 'type': 'string'}],
        'payable': false,
        'stateMutability': 'view', 'type': 'function', 'constant': true
    },
    {
        'inputs': [{'internalType': 'address', 'name': 'account', 'type': 'address'}],
        'name': 'balanceOf',
        'outputs': [{'internalType': 'uint256', 'name': '', 'type': 'uint256'}],
        'stateMutability': 'view', 'type': 'function', 'constant': true
    },
];

async function getFilteredTransactions(transactions, address) {
    let result = [];

    for (let i = 0; i < transactions.length; i++) {
        let tx = transactions[i];
        // skip contract creation
        if (tx.to === null) continue;

        let to = tx.to.toLowerCase();
        let from = tx.from.toLowerCase();

        if (to === address || from === address) {
            // convert from Wei to ETH
            tx.value = web3.utils.fromWei(tx.value);
            // push the result to array
            result.push(tx);
        } else {
            let tokenData = await getPossibleTokenTransfer(tx.input, address, to);
            if (tokenData) {
                // add new fields to tx object
                tx.tokenAmount = tokenData.amount;
                tx.tokenName = tokenData.name;
                tx.tokenTo = tokenData.to;

                result.push(tx);
            }
        }
    }

    return result;
}

async function getPossibleTokenTransfer(code, accountAddress, contractAddress) {
    // does the first 32 bits from the hash of the function <transfer(address, uint256)> equal the code hash
    let isTransferCall = (code.slice(0, 10) === transferID);
    // if the code is empty then it is not a contract
    let isContract = (code !== '0x');
    if (isContract && isTransferCall) {
        // get address from tx input
        let transferedTo = code.slice(10, 74);
        transferedTo = '0x' + transferedTo.slice(24);
        transferedTo = transferedTo.toLowerCase();

        if (transferedTo === accountAddress) {
            // get amount transfered from tx input
            let amount = '0x' + code.slice(74, 138);
            amount = web3.utils.hexToNumberString(amount);
            amount = web3.utils.fromWei(amount);

            // load the contract so that we can get token name
            let contract = new web3.eth.Contract(simpleErc20Abi, contractAddress);
            let name = await contract.methods.name().call();

            return { 
              "amount": amount, 
              "name": name, 
              "to": transferedTo 
            };
        }
    }

    return null;
}


// get first block with greater than or equal time to targetDate
async function getLeftmostBlock(left, right, targetDate) {
    if (left >= right) 
        return right;
        
    let m = (left + right) >> 1;
    let block = await web3.eth.getBlock(m);
    // convert to ms first
    let date = new Date(block.timestamp * 1000);
    //console.log('LEFT: ', left, ' RIGHT: ', right, ' MID: ', m, ' DATE: ', date, ' TARGET: ', targetDate);
    if (date < targetDate) {
        return getLeftmostBlock(m + 1, right, targetDate);
    } else {
        return getLeftmostBlock(left, m, targetDate);
    }
}

// this is going to be slooow
module.exports.getTxns = async function(address, bStart, bEnd) {
    let result = [];

    let total = bEnd - bStart + 1;
    for (let blockNum = bStart; blockNum <= bEnd; blockNum++) {  
        let percent = Math.floor((blockNum - bStart + 1) / total * 100);
        console.log('Processing block:', blockNum, 'Progress: ', percent + '%', 'done');
        // get block by block number
        let block = await web3.eth.getBlock(blockNum, true);
        let txns = await getFilteredTransactions(block.transactions, address);

        result = result.concat(txns);
    }

    return result;
}

// function archiveWay(address, date, tokenAddress) {
//     if (tokenAddress === null) {
//         console.log(address, blockNumber);
//         let balance = await web3.eth.getBalance(address, blockNumber);
//         return web3.utils.fromWei(balance);
//     } else {
//         let contract = new web3.eth.Contract(simpleErc20Abi, tokenAddress);
//         let balance = await contract.methods.balanceOf(address).call(blockNumber);
//         return web3.utils.fromWei(balance);
//     }
// }


module.exports.getBalanceOf = async function(address, date, tokenAddress) {
    let latest = await web3.eth.getBlockNumber();
    let begin = await getLeftmostBlock(0, latest, date);
    console.log("Got the target block: ", begin);
    
    let balance = 0;
    let tokenName = "ETH";
    if (tokenAddress) {
        contract = new web3.eth.Contract(simpleErc20Abi, tokenAddress);
        balance = await contract.methods.balanceOf(address).call();
        balance = web3.utils.fromWei(balance);
        balance = Number.parseFloat(balance);
        
        // get token name from transaction
        tokenName = await contract.methods.name().call();
    } else {
        balance = await web3.eth.getBalance(address);
        balance = web3.utils.fromWei(balance);
        balance = Number.parseFloat(balance);
    }
    
    console.log("Getting transaction list from target to latest block...");
    let txList = await this.getTxns(address, begin, latest);
    // skip the last transaction
    console.log("Reconstructing...");
    for (let i = txList.length - 2; i >= 0; i--) {
        let tx = txList[i];

        tx.gasPrice = web3.utils.fromWei(tx.gasPrice);
        tx.gasPrice = Number.parseFloat(tx.gasPrice);
        let fee = tx.gasPrice * tx.gas;

        // update values from ETH to Token value
        if (tokenAddress && tx.tokenName === tokenName) {
            tx.value = tx.tokenAmount;
        }
        
        // undo transaction
        if (tx.to === address) {
            balance -= Number.parseFloat(tx.value);
        } else {
            // undo fee payment only if 'address' is sending
            if (!tokenAddress) {
                balance += fee;
            }

            balance += Number.parseFloat(tx.value);
        }
    }
    console.log("Done!");

    return {
      "value": balance,
      "token": tokenName
    };
}