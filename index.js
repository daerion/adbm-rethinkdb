async function init ({ db: r, dbName, metadata, logger }) {
  const databases = await r.dbList().run()

  if (!databases.includes(dbName)) {
    logger.info('Creating database %s.', dbName)

    await r.dbCreate(dbName).run()
  } else {
    logger.debug('Database %s already exists.', dbName)
  }

  const tables = await r.db(dbName).tableList().run()

  if (!tables.includes(metadata)) {
    logger.info('Creating metadata table %s.', metadata)

    await r.db(dbName).tableCreate(metadata).run()
  } else {
    logger.debug('Metadata table %s already exists.', metadata)
  }
}

async function getCompletedMigrationIds ({ db: r, metadata, logger }) {
  const completed = []

  logger.debug('○ Found %s completed migrations in metadata table "%s".', completed.length, metadata)

  return completed.map(({ id }) => id)
}

async function registerMigration ({ id, db: r, metadata }) {
}

async function unregisterMigration ({ id, db: r, metadata }) {
}

module.exports = {
  init,
  getCompletedMigrationIds,
  registerMigration,
  unregisterMigration
}
