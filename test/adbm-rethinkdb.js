/* eslint-env mocha */

const { expect } = require('chai')
const Promise = require('bluebird')

const { getConnection, dbName } = require('./helpers')
const adapter = require('../index')
const helpers = require('../helpers')

const log = console.log.bind(console)
const defaultLogger = {
  debug: log,
  verbose: log,
  info: log,
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}

describe('rethinkdb adapter', function () {
  let db
  let dropDb = false
  const getIds = (items) => items.map(({ id }) => id)
  const mockInfoCollection = '_adbm_mock'

  before(async () => {
    db = await getConnection()

    const existing = await db.dbList().run()

    if (!existing.includes(dbName)) {
      await db.dbCreate(dbName).run()
      dropDb = true
    }

    try {
      await db.tableCreate(mockInfoCollection).run()
    } catch (e) { }

    await db.table(mockInfoCollection).insert([
      { id: 'first', completed: new Date() },
      { id: 'second', completed: new Date() }
    ]).run()
  })
  after(async () => {
    await db.tableDrop(mockInfoCollection).run()

    if (dropDb) {
      await db.dbDrop(dbName).run()
    }
  })

  describe('initialization', function () {
    const mockDb = `${dbName}_init_mock_`

    after(async () => {
      try {
        await db.dbDrop(mockDb).run()
      } catch (e) { }
    })

    it('initializes the database', async function () {
      expect(await db.dbList().run()).to.not.contain(mockDb)

      await adapter.init({ db, dbName: mockDb, metadata: mockInfoCollection, logger: defaultLogger })

      expect(await db.dbList().run()).to.contain(mockDb)
      expect(await db.db(mockDb).tableList().run()).to.contain(mockInfoCollection)
    })
  })

  describe('main functionality', function () {
    it('gets a list of all completed migrations', async function () {
      const ids = await adapter.getCompletedMigrationIds({ db, metadata: mockInfoCollection, logger: defaultLogger })

      expect(ids).to.be.an('array')
      expect(ids).to.have.all.members([ 'first', 'second' ])
    })

    it('registers a successful migration', async function () {
      const mockId = 'mock'
      expect(getIds(await db.table(mockInfoCollection).pluck('id').run())).to.not.contain(mockId)

      await adapter.registerMigration({ id: mockId, metadata: mockInfoCollection, db })
      expect(getIds(await db.table(mockInfoCollection).pluck('id').run())).to.contain(mockId)
    })

    it('removes an entry from the list of performed migrations', async function () {
      expect(getIds(await db.table(mockInfoCollection).pluck('id').run())).to.contain('first')

      await adapter.unregisterMigration({ id: 'first', metadata: mockInfoCollection, db })
      expect(getIds(await db.table(mockInfoCollection).pluck('id').run())).to.not.contain('first')
    })
  })

  describe('helpers', function () {
    const noop = function () { }
    const logger = defaultLogger

    describe('basic functionality', function () {
      const { createMigration } = helpers

      it('accepts only functions as parameters', function () {
        expect(() => createMigration()).to.throw()
        expect(() => createMigration('foo', 'bar')).to.throw()
        expect(() => createMigration(noop, 'bar')).to.throw()
        expect(() => createMigration(noop, noop)).to.not.throw()
      })

      it('returns an object containing up and down function properties', function () {
        const migration = createMigration(noop, noop)

        expect(migration).to.have.all.keys([ 'up', 'down' ])
        expect(migration.up).to.be.a('function')
        expect(migration.down).to.be.a('function')
      })
    })

    describe('"tables" migration', function () {
      const { createTablesMigration } = helpers
      const r = getConnection()
      const testTables = [ 'foo', 'bar' ]
      const migration = createTablesMigration(testTables)

      const dropTestTables = async () => {
        const existingTables = await r.tableList().run()

        return Promise.each(existingTables.filter((table) => testTables.includes(table)), (table) => r.tableDrop(table).run())
      }

      after(dropTestTables)

      it('requires a non-empty list of tables', function () {
        expect(() => createTablesMigration()).to.throw()
        expect(() => createTablesMigration([])).to.throw()
        expect(() => createTablesMigration([ 'foo' ])).to.not.throw()
      })

      it('creates specified tables', async function () {
        await migration.up(r, logger)

        const existingTables = await r.tableList().run()

        expect(existingTables).to.include.members(testTables)
      })

      it('removes specified tables', async function () {
        let existingTables = await r.tableList().run()

        await Promise.each(testTables.filter((table) => !existingTables.includes(table)), (table) => r.tableCreate(table).run())

        await migration.down(r, logger)

        existingTables = await r.tableList().run()

        expect(existingTables).to.not.include.members(testTables)
      })
    })

    describe('"index" migration', function () {
      const r = getConnection()
      const table = 'mocha_index_test'
      const { createIndexMigration } = helpers
      const indices = [
        { table, index: 'simple' },
        { table, index: 'compound', spec: (r) => [ r.row('firstProp'), r.row('secondProp') ] },
        { table, index: 'geo', options: { geo: true } },
        { table, index: 'multi', options: { multi: true } },
        { table, index: 'expr', spec: (r) => (doc) => r.branch(doc.hasFields('foo'), doc('foo'), doc('bar')) }
      ]
      const getExistingIndices = () => r.table(table).indexList().run()
      const indexNames = indices.map(({ index }) => index)
      const migration = createIndexMigration(indices)

      before(() => r.tableCreate(table).run())
      after(() => r.tableDrop(table).run())

      it('requires a non-empty list of indices', function () {
        expect(() => createIndexMigration()).to.throw()
        expect(() => createIndexMigration([ ])).to.throw()
        expect(() => createIndexMigration(indices.slice(0, 1))).to.not.throw()
      })

      it('requires a table and index name for each item', function () {
        expect(() => createIndexMigration([ 'foo' ])).to.throw()
        expect(() => createIndexMigration([ { table } ])).to.throw()
        expect(() => createIndexMigration([ { index: 'foo' } ])).to.throw()
        expect(() => createIndexMigration(indices.slice(0, 1).concat([ { table } ]))).to.throw()
        expect(() => createIndexMigration(indices.slice(0, 2))).to.not.throw()
      })

      it('creates specified indices', async function () {
        await migration.up(r, logger)

        expect(await getExistingIndices()).to.contain.all.members(indexNames)

        const status = await r.table(table).indexStatus().run()
        status.forEach(({ index, ready }) => expect(ready, `"ready" property for index ${index}`).to.equal(true))

        const geo = status.find(({ index }) => index === 'geo')
        expect(geo.geo, '"geo" property of geo index').to.equal(true)

        const multi = status.find(({ index }) => index === 'multi')
        expect(multi.multi, '"multi" property of multi index').to.equal(true)
      })

      it('removes specified indices', async function () {
        // Make sure all indices exist in table before running down()
        const existingIndices = await getExistingIndices()

        await Promise.each(indexNames.filter((index) => !existingIndices.includes(index)), (index) => {
          return r.table(table).indexCreate(index).run().then(() => r.table(table).indexWait(index).run())
        })

        expect(await getExistingIndices()).to.contain.all.members(indexNames)

        await migration.down(r, logger)

        expect(await getExistingIndices()).to.not.contain.members(indexNames)
      })
    })
  })
})
