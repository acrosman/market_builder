const { producer } = require('./producer.js');

class farm extends producer {
  constructor(name, employees, goodsList, xcoordinate, ycoordinate) {
    super('farm', name, employees, goodsList, xcoordinate, ycoordinate);
  }
}

module.exports = farm;
