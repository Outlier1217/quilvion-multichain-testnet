# 🚀 Quilvion Sui Smart Contract

A decentralized commerce escrow system built on the Sui blockchain using Move.

This project is a part of a multi-chain architecture where the same core logic is implemented across different blockchains (EVM + Sui).

---

## 🔥 Features

- ✅ Order Creation (Escrow-based)
- ✅ Daily Spending Limit Control
- ✅ Modular Architecture (Config, Roles, Escrow, Payment)
- ✅ Shared Object Contract (Sui Native Pattern)
- ✅ Multi-chain Ready Design

---

## 🧠 Tech Stack

- Sui Blockchain
- Move Language
- Sui CLI
- PowerShell / Terminal

---

## 📦 Project Structure
sources/
├── commerce.move # Main contract
├── config.move # Config logic
├── escrow.move # Spending limit logic
├── payment.move # Payment logic
├── roles.move # Role management

---

## 🚀 Deployment (Devnet)

```bash
sui client test-publish --gas-budget 100000000 --build-env devnet

📍 Important IDs
Package ID:
0x8dc65e67d2da56ace19a8e2e69e5cde85d440665b67a0ae4783404d3ef6d8d50
Shared Object (Commerce):
0xcf906fb3e15ff96b73f0195c83c8abaa12db7d2ad9c0a04a9b2760b5e1389832

🧪 Example: Create Order
sui client call --package <PACKAGE_ID> \
--module commerce \
--function create_order \
--args <OBJECT_ID> <SELLER_ADDRESS> <AMOUNT> \
--gas-budget 100000000

⚠️ Important Notes
Sui uses object-based architecture
Data is stored in BCS (binary format)
Use getter functions or events for readable output
🔥 Future Improvements
Refund system
Admin approval logic
Event emission
Frontend integration (React + Sui SDK)
Multi-chain sync
👨‍💻 Author

Built by Mustak Aalam 🚀

⭐ Support

If you like this project, give it a ⭐ on GitHub!

















[package]
name = "quilvion"
version = "1.0.0"
edition = "2024.beta"

[dependencies]
Sui = { override = true, git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "testnet-v1.40.1" }
MoveStdlib = { override = true, git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/move-stdlib", rev = "testnet-v1.40.1" }
usdc = { git = "https://github.com/circlefin/stablecoin-sui.git", subdir = "packages/usdc", rev = "master" }

[addresses]
quilvion = "0x0"

[dev-addresses]
quilvion = "0x0"
