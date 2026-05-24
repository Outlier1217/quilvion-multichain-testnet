require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // === SOMNIA TESTNET ===
    somniaTestnet: {
      url: "https://dream-rpc.somnia.network",
      chainId: 50312,
      accounts: [process.env.PRIVATE_KEY],   // yaha tumhara wallet ka private key
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: {
      somniaTestnet: "abc", // Somnia abhi verification support karta hai to baad mein dekh lena
    },
    customChains: [
      {
        network: "somniaTestnet",
        chainId: 50312,
        urls: {
          apiURL: "https://shannon-explorer.somnia.network/api",
          browserURL: "https://shannon-explorer.somnia.network"
        }
      }
    ]
  }
};