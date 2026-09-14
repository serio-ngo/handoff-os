export class Blocked extends Error {
  constructor(message, hint = '') {
    super(message);
    this.hint = hint;
  }
}
