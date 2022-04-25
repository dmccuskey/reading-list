// Libs
import axios from 'axios'
import fs from 'fs'
import { Deferred } from 'ts-deferred'
import { BookmarkRecord, Service } from '../app.interfaces'

// Constants & Interfaces
import {
  MultiRaindropRecord,
  RaindropConfig,
  RaindropRecord,
} from './raindrop-io.interfaces'

// Utils
import { AsyncRandomDelay } from '../utils/async.utils'
import { limitNumberWithinRange } from '../utils/data.utils'

// Constants

const LOG_PREFIX = '[RAINDROP]'

const ERR_NO_ITEMS = '--no-items--'
const ERR_MAX_POSTED = '--max-posted--'
const queueFileName = 'raindrop-queue.json'
const queueFileDir = 'SynologyDrive/reading-list'
const API_CREATE_RAINDROPS = 'https://api.raindrop.io/rest/v1/raindrops'
const envHome = process.env.HOME || '/'

const RaindropMultiPostRecordsMax = 100
const RaindropMultiPostRecordsMin = 1

const queueFilePath = [envHome, queueFileDir, queueFileName].join('/')

// Global vars

// config items
let gToken = ''

let gPostRecordSize = RaindropMultiPostRecordsMax
let gPostRecordsTotal: number | null = 100 // records in all multi posts

const gBookmarksQueue: BookmarkRecord[] = []
let gPostedRecordCount = 0 // count for records posted to raindrop
let gHaveNewRecords = false // flag to save json

// Raindrop API functions

function getApiHeader() {
  return {
    headers: { Authorization: `Bearer ${gToken}` },
  }
}

export const postMultipleRaindrops = function (data: MultiRaindropRecord) {
  return axios
    .post(API_CREATE_RAINDROPS, data, getApiHeader())
    .then((res) => res.data)
}

// Raindrop API support

function createRaindropRecord(record: BookmarkRecord): RaindropRecord {
  const { created, title, url } = record
  return {
    created,
    link: url,
    pleaseParse: {},
    title,
  }
}

function createMultiRaindropRecord(
  records: BookmarkRecord[]
): MultiRaindropRecord {
  if (records.length > RaindropMultiPostRecordsMax) {
    throw Error(`${LOG_PREFIX} too many items for raindrop API`)
  }

  const items = records.map((record) => createRaindropRecord(record))
  return { items }
}

// Raindrop Module

function readAndProcessQueueJson() {
  const defer = new Deferred<string>()

  // Promise-chain support

  const readFile = () => {
    return fs.promises.readFile(queueFilePath, 'utf8')
  }

  const processFile = (data: string) => {
    try {
      const queueData = JSON.parse(data) as BookmarkRecord[]
      gBookmarksQueue.push(...queueData)
      return 'OK'
    } catch (e) {
      return Promise.reject(e)
    }
  }

  // Promise chain

  readFile()
    .then(processFile)
    .then(() => defer.resolve(`${LOG_PREFIX} OK reading JSON`))
    .catch((err) => {
      if (err.code == 'ENOENT') {
        defer.resolve(`${LOG_PREFIX} OK no existing JSON`)
      } else {
        const eMsg = `${LOG_PREFIX} ERROR reading JSON`
        console.error(eMsg, err)
        defer.reject(eMsg)
      }
    })

  return defer.promise
}

function saveQueueJson() {
  const defer = new Deferred<string>()

  // Promise-chain support

  const getData = ((data) => {
    return () => Promise.resolve(data)
  })(gBookmarksQueue)

  const processData = (data: BookmarkRecord[]) => JSON.stringify(data)

  const writeFile = ((fP) => {
    return (data: string) => fs.promises.writeFile(fP, data)
  })(queueFilePath)

  // Promise chain

  getData()
    .then(processData)
    .then(writeFile)
    .then(() => defer.resolve(`${LOG_PREFIX} OK saving JSON`))
    .catch((err) => {
      const eMsg = `${LOG_PREFIX} ERROR saving JSON`
      console.error(eMsg, err)
      defer.reject(eMsg)
    })

  return defer.promise
}

const processQueue = function (defer: Deferred<string>) {
  // Promise-chain support

  const getNextItem = () => {
    // setup
    const queueIsEmpty = gBookmarksQueue.length == 0
    const postedMaxRecords =
      gPostRecordsTotal != null && gPostedRecordCount >= gPostRecordsTotal

    if (queueIsEmpty) {
      return Promise.reject(ERR_NO_ITEMS)
    } else if (postedMaxRecords) {
      return Promise.reject(ERR_MAX_POSTED)
    } else {
      const maxRecords =
        gPostRecordsTotal == null ? gBookmarksQueue.length : gPostRecordsTotal
      const recsLeft = maxRecords - gPostedRecordCount
      const numRecs = Math.min(recsLeft, gPostRecordSize)

      console.info(`${LOG_PREFIX} posting ${numRecs} records`)

      // process most recent, start from 0 index
      gPostedRecordCount += numRecs
      const items = gBookmarksQueue.splice(0, numRecs)
      const data = createMultiRaindropRecord(items)
      return Promise.resolve(data)
    }
  }

  const processItem = (data: MultiRaindropRecord) => {
    return postMultipleRaindrops(data)
  }

  const saveJson = () => {
    return saveQueueJson()
  }

  const checkQueue = () => {
    // setup
    const queueIsEmpty = gBookmarksQueue.length == 0
    const postedMaxRecords =
      gPostRecordsTotal != null && gPostedRecordCount >= gPostRecordsTotal

    if (queueIsEmpty) {
      defer.resolve(`${LOG_PREFIX} OK empty queue`)
    } else if (postedMaxRecords) {
      defer.resolve(`${LOG_PREFIX} OK max records posted`)
    } else {
      processQueue(defer)
    }
  }

  // Promise chain

  getNextItem()
    .then(processItem)
    .then(saveJson)
    .then(AsyncRandomDelay(800, 600))
    .then(checkQueue)
    .catch((err) => {
      switch (err) {
        case ERR_NO_ITEMS:
          defer.resolve(`${LOG_PREFIX} OK empty queue`)
          break
        case ERR_MAX_POSTED:
          defer.resolve(`${LOG_PREFIX} OK max records posted`)
          break
        default:
          const eMsg = `${LOG_PREFIX} ERROR processing queue`
          console.error(eMsg, err)
          defer.reject(eMsg)
          break
      }
    })
}

/*
  handleConfig
  process incoming config structure
*/
const handleConfig = function (cfg: RaindropConfig) {
  const { token, postRecordsSize, postRecordsTotal } = cfg
  // verify token
  gToken = token

  // verify each post in range 1 <= num <= Max
  gPostRecordSize = limitNumberWithinRange(
    postRecordsSize,
    RaindropMultiPostRecordsMin,
    RaindropMultiPostRecordsMax
  )

  if (postRecordsTotal == null) {
    gPostRecordsTotal = postRecordsTotal
  } else {
    gPostRecordsTotal =
      postRecordsTotal < 1 ? RaindropMultiPostRecordsMin : postRecordsTotal
  }

  return Promise.resolve('OK')
}

const outputQueueInfo = (queue: BookmarkRecord[]) => {
  return () => console.info(`${LOG_PREFIX} queue size: ${queue.length}`)
}

/*
  handleData
  process incoming data
  save in queue until ready to process

  records : newest first
  reset: all records are coming in – should overwrite current data
*/
const handleData = function (records: BookmarkRecord[], reset = false) {
  console.log(`${LOG_PREFIX} received ${records.length} new records`)
  const defer = new Deferred<string>()

  // Setup
  gHaveNewRecords = records.length > 0

  // Promise-chain support

  const readQueueFile = () => {
    return reset ? Promise.resolve('OK') : readAndProcessQueueJson()
  }

  const addBookmarks = ((recs) => {
    return () => {
      // ensure order is kept, newest first
      for (let i = recs.length - 1; i >= 0; i--) {
        gBookmarksQueue.unshift(recs[i])
      }
      return 'OK'
    }
  })(records)

  const saveJson = () => {
    return gHaveNewRecords ? saveQueueJson() : 'OK'
  }

  const outputInfo = outputQueueInfo(gBookmarksQueue)

  // Promise chain

  readQueueFile()
    .then(addBookmarks)
    .then(saveJson)
    .then(outputInfo)
    .then(() => defer.resolve(`${LOG_PREFIX} OK saving data`))
    .catch(() => {
      const eMsg = `${LOG_PREFIX} ERROR saving bookmarks`
      console.error(eMsg)
      defer.reject(eMsg)
    })

  return defer.promise
}

/*
  handleProcess
  process data in queue
*/
const handleProcess = function () {
  const defer = new Deferred<string>()

  const startQueue = () => {
    const defer = new Deferred<string>()
    processQueue(defer)
    return defer.promise
  }

  const outputInfo = outputQueueInfo(gBookmarksQueue)

  startQueue()
    .then(outputInfo)
    .then(() => defer.resolve(`${LOG_PREFIX} OK processing bookmarks`))
    .catch(() => {
      const eMsg = `${LOG_PREFIX} ERROR processing bookmarks`
      console.error(eMsg)
      defer.reject(eMsg)
    })

  return defer.promise
}

/*
  export Service interface
*/
export const Connector: Service = {
  config: handleConfig,
  data: handleData,
  process: handleProcess,
}
