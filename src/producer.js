const { actor } = require('./actor.js');

class producer extends actor {
  constructor(type, name, employees, goodsList, xcoordinate, ycoordinate) {
    super('producer', type, name, employees, goodsList, xcoordinate, ycoordinate);
    this.employees = {
      new: employees,
      trained: 0,
      experienced: 0,
    };
  }
}

module.exports = producer;
