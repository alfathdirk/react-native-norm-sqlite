# react-native-norm-sqlite

## Pre-Install
Please Install react-native-sqlite-storage correctly, because this module depends on it

## Install
```bash
npm i react-native-norm-sqlite node-norm --save
```

## Use
```javascript
import { Manager } from 'node-norm';
import SQLite from 'react-native-norm-sqlite';

const manager = new Manager({
  connections: [
    {
      name: 'name', // name of database
      appName: 'App React Native DB', // app name or description
      adapter: SQLite, // adapter
    },
  ],
})

manager.runSession(async (session) => {
  let data = await session.factory('foo', { bar: 'foobar' }).single();
  //similiar with syntax: SELECT * FROM foo where bar = 'foobar' LIMIT 1 ;
  let data = await session.factory('foo', { bar: 'foobar' }).all();
  let data = await session.factory('foo').find({ bar: 'foobar' }).all();
  //similiar with syntax: SELECT * FROM foo where bar = 'foobar' ;
  let data = await session.factory('foo').all();
  //similiar with syntax: SELECT * FROM foo;
  let data = await session.factory('foo').find({ UserId: 1, 'UserName!like': 'foo' }).all();
  // on example UserName separate by !, you can use 'or', 'lt', 'gt' , etc visit https://github.com/reekoheek/node-norm for more information
  //similiar with syntax: SELECT * FROM foo where UserId = 1 and UserName LIKE %foo%;
  let { inserted, rows } = await session.factory('foo').insert({ field1: 'bar', field2: 'baz' }).save();
                           await session.factory('foo').insert({ field1: 'bar', field2: 'baz' }).insert({ field1: 'bar1' }).save();
  // insert data to table foo
  let { affected } = await session.factory('foo',{ barId = 2 }).set({ baz: 'bar' }).save();
  // edit record on field barId = 2
  
  let data = await session.factory('foo').delete();
  //delete data;
  console.log(data);
});
```
visit  [Node-Norm](https://github.com/reekoheek/node-norm) for more information
