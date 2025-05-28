const { consumer } = require('./consumer.js');

class farmStand extends consumer {
  constructor(name, employees, goodsList, xCoordinate, yCoordinate) {
    super('farm stand', name, employees, goodsList, xCoordinate, yCoordinate);
    this.employees = {
      new: employees,
      trained: 0,
      experienced: 0,
    };
  }
}

module.exports = farmStand;
