export class Transaction {
  operations: any[] = [];
  constructor() {
    // EVM frontend does not build actual Move transactions.
    this.operations = [];
  }

  splitCoins() {
    return [];
  }

  object() {
    return null;
  }

  pure() {
    return null;
  }

  moveCall() {
    // Stubbed function for UI compatibility.
  }
}
