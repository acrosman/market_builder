const { actor } = require('./actor.js');

class consumer extends actor {
  constructor(type, name, people, goodsList, xcoordinate, ycoordinate) {
    super('consumer', type, name, people, goodsList, xcoordinate, ycoordinate);
  }
}

module.exports = consumer;
