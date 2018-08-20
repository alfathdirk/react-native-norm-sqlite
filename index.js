// const Connection = require('node-norm/connection');
// const sqlite = require('react-native-sqlite-storage');

const OPERATORS = {
  'eq': '=',
  'gt': '>',
  'lt': '<',
  'gte': '>=',
  'lte': '<=',
  'like' : 'like',
};

class Sqlite  {
  constructor (options) {
    super(options);

    // this._db = options.db;
    // this.file = options.file || ':memory:';
  }

  async insert (query, callback = () => {}) {
    let fieldNames = query.schema.fields.map(field => field.name);
    if (!fieldNames.length) {
      fieldNames = query._inserts.reduce((fieldNames, row) => {
        for (let f in row) {
          if (fieldNames.indexOf(f) === -1) {
            fieldNames.push(f);
          }
        }
        return fieldNames;
      }, []);
    }

    let placeholder = fieldNames.map(f => '?');
    let sql = `INSERT INTO ${query.schema.name} (${fieldNames.join(',')}) VALUES (${placeholder})`;

    let db = await this.getDb();

    let changes = 0;
    await Promise.all(query._inserts.map(async row => {
      let rowData = fieldNames.map(f => row[f]);
      let result = await db.run(sql, rowData);
      row.id = result.lastID;
      callback(row);
      changes += result.changes;
    }));

    return changes;
  }

  async load (query, callback = () => {}) {
    let sqlArr = [ `SELECT * FROM ${query.schema.name}` ];
    let [ wheres, data ] = this.getWhere(query);
    if (wheres) {
      sqlArr.push(wheres);
    }

    let orderBys = this.getOrderBy(query);
    if (orderBys) {
      sqlArr.push(orderBys);
    }

    if (query._limit >= 0) {
      sqlArr.push(`LIMIT ${query._limit}`);

      if (query._skip > 0) {
        sqlArr.push(`OFFSET ${query._skip}`);
      }
    }

    let sql = sqlArr.join(' ');

    let db = await this.getDb();

    let results = await db.all(sql, data);

    return results.map(row => {
      callback(row);
      return row;
    });
  }

  async count (query, callback = () => {}) {
    let sqlArr = [ `SELECT count(*) as count FROM ${query.schema.name}` ];
    let [ wheres, data ] = this.getWhere(query);
    if (wheres) {
      sqlArr.push(wheres);
    }

    let sql = sqlArr.join(' ');

    let db = await this.getDb();

    let results = await db.all(sql, data);

    return results.map(row => {
      callback(row);
      return row;
    });
  }

  async delete (query, callback) {
    let [ wheres, data ] = this.getWhere(query);
    let sqlArr = [`DELETE FROM ${query.schema.name}`];
    if (wheres) {
      sqlArr.push(wheres);
    }

    let sql = sqlArr.join(' ');

    let db = await this.getDb();
    await db.run(sql, data);
  }

  getOrderBy (query) {
    let orderBys = [];
    for (let key in query._sorts) {
      let val = query._sorts[key];

      orderBys.push(`${key} ${val ? 'ASC' : 'DESC'}`);
    }

    if (!orderBys.length) {
      return;
    }

    return `ORDER BY ${orderBys.join(', ')}`;
  }

  async update (query) {
    let keys = Object.keys(query._sets);

    let db = await this.getDb();
    // let db = await sqlite.open(this.file);

    let params = keys.map(k => query._sets[k]);
    let placeholder = keys.map(k => `${k} = ?`);

    let [ wheres, data ] = this.getWhere(query);
    let sql = `UPDATE ${query.schema.name} SET ${placeholder.join(', ')} ${wheres}`;
    let result = await db.run(sql, params.concat(data));

    return result.changes;
  }

  getWhere (query) {
    let wheres = [];
    let data = [];
    for (let key in query._criteria) {
      let value = query._criteria[key];
      if(key === '!or'){
        let or = this.getOr(value);
        wheres.push(or.where);
        data = data.concat(or.data);
        continue;
      }
      let [ field, operator = 'eq' ] = key.split('!');

      // add by januar: for chek if operator like value change to %
      if(operator == 'like'){
        value ='%'+value +'%';
      }

      data.push(value);

      wheres.push(`${field} ${OPERATORS[operator]} ?`);
    }

    if (!wheres.length) {
      return [];
    }

    return [ `WHERE ${wheres.join(' AND ')}`, data ];
  }

  getOr(query){
    let wheres = [];
    let data = [];
    for (let i = 0; i < query.length; i++) {
        let key = Object.keys(query[i])[0];
        let value = Object.values(query[i])[0];
        let [ field, operator = 'eq' ] = key.split('!');
        if(operator == 'like'){
          value ='%'+value +'%';
        }
        data.push(value);
        wheres.push(`${field} ${OPERATORS[operator]} ?`);
    }
    return {where : `(${wheres.join(' OR ')})`,data:data };
  }

  async getDb () {
    if (!this._db) {
      this._db = await sqlite.openDatabase(this.file);
    }
    return this._db;
  }
}

module.exports = Sqlite;
