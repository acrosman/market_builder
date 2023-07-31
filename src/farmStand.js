const { consumer } = require('./consumer.js');

class farmStand extends consumer {
  constructor(name, employees, goodsList, xcoordinate, ycoordinate) {
    super('farm stand', name, employees, goodsList, xcoordinate, ycoordinate);
    this.employees = {
      new: employees,
      trained: 0,
      experienced: 0,
    };
  }
}

module.exports = farmStand;
