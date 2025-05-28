const { actor } = require('./actor.js');

class consumer extends actor {
  constructor(type, name, people, goodsList, xCoordinate, yCoordinate) {
    super('consumer', type, name, people, goodsList, xCoordinate, yCoordinate);
  }
}

module.exports = consumer;
