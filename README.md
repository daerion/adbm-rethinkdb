# adbm-rethinkdb
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

RethinkDB adapter for [adbm](https://github.com/daerion/adbm) database migration tool.

## Installation
```
npm install adbm-mongodb
```

## Helpers
This adapter contains a series of helper functions meant to simplify a few common migration tasks. These helper functions have been taken from the now deprecated [reconsider](https://github.com/daerion/reconsider) module, as has their documentation. Each of these functions will return a database migration object, i.e. an object exposing `up` and `down` methods, which can then be exported by the migration file.  
                                                                                                                                                                                                                                                          
### createTablesMigration
This function will return a migration that will create tables when migrating up and drop these tables when migrating down. `createTablesMigration` expects an array of table names.

```js
// In file migrations/xx-create-tables.js
const helpers = require('adbm-rethinkdb/helpers')

module.exports = helpers.createTablesMigration([ 'first_table', 'second_table' ])
````

### createIndexMigration
This function will return a migration that will create indices when migrating up and drop these indices when migrating down. `createIndexMigration` expects an array of index specifications. Each index specification is an object containing a `table` and an `index` property, and optionally an `options` object and/or a `spec` function.
An `options` object can be anything that `r.indexCreate()` accepts, while the `spec` property must be a function that returns an index definition (which, again, can be anything that `r.indexCreate()` accepts). `spec` will be passed the rethinkdbdash instance when it is executed.

```js
// In file migrations/xx-create-indices.js
const helpers = require('adbm-rethinkdb/helpers')
const table = 'first_table'

module.exports = helpers.createIndexMigration([
  { table, index: 'someProp' }, // Simple index
  { table, index: 'compoundIndex', spec: (r) => [ r.row('firstProp'), r.row('secondProp') ] }, // Compound index
  { table, index: 'geoProp', options: { geo: true } }, // Geo index
  { table, index: 'multiIndex', options: { multi: true } }, // Multi index
  { table, index: 'arbitraryExpr', spec: (r) => (doc) => r.branch(doc.hasFields('foo'), doc('foo'), doc('bar')) } // Index based on an arbitrary expression
])
```
