const { producer } = require('./producer.js');

class farm extends producer {
  constructor(name, employees, goodsList, xCoordinate, yCoordinate) {
    super('farm', name, employees, goodsList, xCoordinate, yCoordinate);
  }
}

module.exports = farm;
