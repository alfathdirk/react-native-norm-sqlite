const Connection = require('node-norm/connection');
const SQLite = require('react-native-sqlite-storage');
SQLite.enablePromise(true);

const OPERATORS = {
  'eq': '=',
  'gt': '>',
  'lt': '<',
  'gte': '>=',
  'lte': '<=',
  'like' : 'like',
};
let index = 0;

class Sqlite extends Connection{
  constructor (options) {
    super(options)
    this.options = options;
    this.index = index++;
    this.openDB = SQLite.openDatabase(`${options.name}.db`, '1.0', options.appName, 200000, () => console.log('success open db'), (error) => console.log('db open error',error));
  }
  
  async all (query, params = []) {
    let results = [];
    let db = await this.openDB;
    await db.transaction(async (tx) => {
      let [ txs, r ] = await tx.executeSql(query, params);
      for (let i = 0; i < r.rows.length; i++) {
        results.push(r.rows.item(i));
      }
    });
    return results;
  }

  run (query, params = []) {
    return this.all(query, params);
  }

  async insert (query, callback = () => {}) {
    let fieldNames = query.schema.fields.map(field => field.name);
    if (!fieldNames.length) {
      fieldNames = query.rows.reduce((fieldNames, row) => {
        for (let f in row) {
          if (fieldNames.indexOf(f) === -1) {
            fieldNames.push(f);
          }
        }
        return fieldNames;
      }, []);
    }

    let placeholder = fieldNames.map(f => '?').join(', ');
    let sql = `INSERT INTO ${this.escape(query.schema.name)}` +
      ` (${fieldNames.map(f => this.escape(f)).join(', ')})` +
      ` VALUES (${placeholder})`;

    let changes = 0;
    await Promise.all(query.rows.map(async row => {
      let rowData = fieldNames.map(f => {
        let value = this.serialize(row[f]);
        return value;
      });

      let { result } = await this.rawQuery(sql, rowData);
      row.id = result.lastInsertRowid;
      changes += result.changes;

      callback(row);
    }));

    return changes;
  }

  async load (query, callback = () => {}) {
    let sqlArr = [ `SELECT * FROM ${this.escape(query.schema.name)}` ];
    let [ wheres, data ] = this.getWhere(query);
    if (wheres) {
      sqlArr.push(wheres);
    }

    let orderBys = this.getOrderBy(query);
    if (orderBys) {
      sqlArr.push(orderBys);
    }

    if (query.length >= 0) {
      sqlArr.push(`LIMIT ${query.length}`);

      if (query.offset > 0) {
        sqlArr.push(`OFFSET ${query.offset}`);
      }
    }

    let sql = sqlArr.join(' ');

    let { result } = await this.rawQuery(sql, data);

    return result.map(row => {
      callback(row);
      return row;
    });
  }

  async count (query, useSkipAndLimit = false) {
    let sqlArr = [ `SELECT count(*) as ${this.escape('count')} FROM ${this.escape(query.schema.name)}` ];
    let [ wheres, data ] = this.getWhere(query);
    if (wheres) {
      sqlArr.push(wheres);
    }

    if (useSkipAndLimit) {
      if (query.length >= 0) {
        sqlArr.push(`LIMIT ${query.length}`);

        if (query.offset > 0) {
          sqlArr.push(`OFFSET ${query.offset}`);
        }
      }
    }

    let sql = sqlArr.join(' ');

    let { result: [ row ] } = await this.rawQuery(sql, data);
    return row.count;
  }

  async delete (query, callback) {
    let [ wheres, data ] = this.getWhere(query);
    let sqlArr = [`DELETE FROM ${query.schema.name}`];
    if (wheres) {
      sqlArr.push(wheres);
    }

    let sql = sqlArr.join(' ');

    await this.rawQuery(sql, data);
  }

  getOrderBy (query) {
    let orderBys = [];
    for (let key in query.sorts) {
      let val = query.sorts[key];

      orderBys.push(`${this.escape(key)} ${val > 0 ? 'ASC' : 'DESC'}`);
    }

    if (!orderBys.length) {
      return;
    }

    return `ORDER BY ${orderBys.join(', ')}`;
  }

  async update (query) {
    let keys = Object.keys(query.sets);

    let params = keys.map(k => this.serialize(query.sets[k]));
    let placeholder = keys.map(k => `${this.escape(k)} = ?`);

    let [ wheres, data ] = this.getWhere(query);
    let sql = `UPDATE ${query.schema.name} SET ${placeholder.join(', ')} ${wheres}`;
    let { result } = await this.rawQuery(sql, params.concat(data));

    return result.changes;
  }

  static async nativeQuery(options, query, params = []) {
    let sql = await new Sqlite(options).all(query, params);
    return sql;
  }

  getWhere (query) {
    let wheres = [];
    let data = [];
    for (let key in query.criteria) {
      let value = query.criteria[key];

      if (key === '!or') {
        let or = this.getOr(value);
        wheres.push(or.where);
        data = data.concat(or.data);
        continue;
      }

      let [ field, operator = 'eq' ] = key.split('!');

      // add by januar: for chek if operator like value change to %
      if (operator === 'like') {
        value = `%${value}%`;
      }

      data.push(value);
      wheres.push(`${this.escape(field)} ${OPERATORS[operator]} ?`);
    }

    if (!wheres.length) {
      return [];
    }

    return [ `WHERE ${wheres.join(' AND ')}`, data ];
  }

  getOr (query) {
    let wheres = [];
    let data = [];
    for (let i = 0; i < query.length; i++) {
      let key = Object.keys(query[i])[0];
      let value = Object.values(query[i])[0];
      let [ field, operator = 'eq' ] = key.split('!');
      if (operator === 'like') {
        value = '%' + value + '%';
      }
      data.push(value);
      wheres.push(`${this.escape(field)} ${OPERATORS[operator]} ?`);
    }
    return { where: `(${wheres.join(' OR ')})`, data };
  }

  async rawQuery (sql, params = []) {
    // let conn = await this.getRaw();
    let result = await this.all(sql, params);
    return { result };
  }

  escape (field) {
    return '`' + field + '`';
  }

  async _begin () {
    await this.rawQuery('BEGIN');
  }

  async _commit () {
    if (!this.openDB) {
      return;
    }
    await this.rawQuery('COMMIT');
  }

  async _rollback () {
    if (!this.openDB) {
      return;
    }
    await this.rawQuery('ROLLBACK');
  }

  serialize (value) {
    if (value === null) {
      return value;
    }

    if (value instanceof Date) {
      // return value.toISOString();
      // return value.toISOString().slice(0, 19).replace('T', ' ');
      return value.getTime();
    }

    let valueType = typeof value;
    if (valueType === 'object') {
      if (typeof value.toJSON === 'function') {
        return value.toJSON();
      } else {
        return JSON.stringify(value);
      }
    }

    if (valueType === 'boolean') {
      return value ? 1 : 0;
    }

    return value;
  }

  end () {
    if (!this.openDB) {
      return;
    }

    this.openDB.close();
  }

  // async getRaw () {
  //   if (!this.openDB) {
  //     this.openDB = SQLite.openDatabase(`${this.options.name}.db`, '1.0', this.options.appName, 200000, () => console.log('success open db'), (error) => console.log('db open error',error));
  //   }
  //   return this.openDB;
  // }
}

module.exports = Sqlite;
