// Libs
import fs from 'fs'
import util from 'util'
import { exec } from 'child_process'
import plist, { PlistObject, PlistArray } from 'plist'
import { Deferred } from 'ts-deferred'

// App config
import config from './reading-list.config'

// Constants & Interfaces
import {
  BookmarkRecord,
  ConfigFile,
  FileConfig,
  KeyIndex,
  StringLookupHash,
} from './app.interfaces'
import { RaindropConfig } from './services/raindrop-io.interfaces'

// Services
import { Connector as Raindrop } from './services/raindrop-io'

// Utils
import { DataLookupByFile } from './utils/data-lookup.utils'

// Setup
const pExecFile = util.promisify(exec)
const LOG_PREFIX = '[READING LIST]'

// Globals

const gFileData: FileConfig = {
  // file names
  configFile: 'reading-list.cfg.json',
  jsonFileName: 'reading-list.json',
  plistFileName: 'Bookmarks.plist', // IN file name
  dataFileName: 'Bookmarks.plist', // OUT file name
  // directories
  envHome: process.env.HOME || '/',
  dataPath: 'Documents', // path for working directory (default)
  safariPath: 'Library/Safari',
  appDir: 'reading-list',
  // full paths
  jsonFilePath: '',
  plistFilePathIn: '',
  plistFilePathOut: '',
  dataFilePathIn: '',
}

const gConfig: ConfigFile = {
  local: {
    dataPath: '',
  },
  input: [],
  output: [],
}

const gNewUrlRecs: BookmarkRecord[] = [] // newest first
const gUrlLookup: { [key: string]: boolean } = {}

let gDateLookup: StringLookupHash = {}
let gTitleLookup: StringLookupHash = {}
let gAllUrlRecs: BookmarkRecord[] = [] // newest first
let gHasChanged = false
let gRecordCount = 0
let gDuplicateCount = 0

// # this is an actual bookmark with URL
const process_WebBookmarkTypeLeaf = (node: PlistObject) => {
  const url = node['URLString'] as string
  const dict = node['URIDictionary'] as PlistObject
  const title = dict['title'] as string
  const list = node['ReadingList'] as PlistObject
  const created = list['DateAdded'] as string

  // process if haven't seen before
  const data: BookmarkRecord = { created, title, url }
  if (gUrlLookup[url] == true) {
    gDuplicateCount += 1
  } else {
    // save in lists – New and All
    gNewUrlRecs.unshift(data) // newest first
    gAllUrlRecs.unshift(data) // newest first
    gUrlLookup[url] = true
    gHasChanged = true
  }

  gRecordCount += 1
}

const process_WebBookmarkTypeList = (node: PlistObject) => {
  const children = (node['Children'] as Array<PlistObject>) || []

  children.reverse() // keep order
  children.forEach((child) => {
    const c = child as PlistObject

    const type = c['WebBookmarkType'] as string
    switch (type) {
      case 'WebBookMarkTypeList':
        process_WebBookmarkTypeList(child as PlistObject)
        break
      case 'WebBookmarkTypeLeaf':
        process_WebBookmarkTypeLeaf(child as PlistObject)
        break
      default:
        console.warn('process_WebBookmarkTypeList unknown type', type)
    }
  })
}

const processRoot = (node: PlistObject) => {
  const children = (node['Children'] as PlistArray) || []

  children.forEach((child) => {
    const c = child as PlistObject
    const title = c['Title'] as string
    const type = c['WebBookmarkType'] as string

    if (title == 'BookmarksBar') {
      // process bookmarks bar, WebBookMarkTypeList
    } else if (title == 'BookmarksMenu') {
      // process bookmarks bar, WebBookMarkTypeList
    } else if (title == 'com.apple.ReadingList') {
      process_WebBookmarkTypeList(child as PlistObject)
    } else if (title == 'Startup Tips') {
      // process startup tips, WebBookmarkTypeList
    } else if (type == 'WebBookMarkTypeProxy') {
      // History node, WebBookmarkTypeProxy
    } else if (type == 'WebBookMarkTypeList') {
      // process_WebBookmarkTypeList(child)
    } else if (type == 'WebBookmarkTypeLeaf') {
      // process_WebBookmarkTypeLeaf(child)
    }
  })

  return 'ok'
}

const copyTo = (src: KeyIndex, key: string, dest: KeyIndex) => {
  dest[key] = src[key]
}
const createJsonFilePath = (fileData: FileConfig) => {
  const { envHome, dataPath, appDir, jsonFileName } = fileData
  const path = [envHome, dataPath, appDir, jsonFileName]
  fileData.jsonFilePath = path.join('/')
}
const createPlistFilePathIn = (fileData: FileConfig) => {
  const { envHome, safariPath, plistFileName } = fileData
  const path = [envHome, safariPath, plistFileName]
  fileData.plistFilePathIn = path.join('/')
}
const createPlistFilePathOut = (fileData: FileConfig) => {
  const { envHome, dataPath, appDir, plistFileName } = fileData
  const path = [envHome, dataPath, appDir, plistFileName]
  fileData.plistFilePathOut = path.join('/')
}
const createDataFilePathIn = (fileData: FileConfig) => {
  const { envHome, dataPath, appDir, dataFileName } = fileData
  const path = [envHome, dataPath, appDir, dataFileName]
  fileData.dataFilePathIn = path.join('/')
}

/*
  Main Promise-chain support
*/

function startProcess() {
  console.info('== Start Processing ==')
  return Promise.resolve('OK')
}

/*
  readConfigFile
*/
const readConfigFile = () => {
  const defer = new Deferred<string>()

  const processConfig = () => {
    const { local, input, output } = config

    // copy data from config file to global

    // copy strings
    copyTo(local, 'dataPath', gConfig.local)

    // copy arrays
    output.forEach((service) => gConfig.output.push(service))
    input.forEach((service) => gConfig.input.push(service))

    // process config file data

    // copy string
    copyTo(gConfig.local, 'dataPath', gFileData)

    // create full paths
    createJsonFilePath(gFileData)
    createPlistFilePathIn(gFileData)
    createPlistFilePathOut(gFileData)
    createDataFilePathIn(gFileData)

    return Promise.resolve('OK')
  }

  processConfig()
    .then(() => defer.resolve('OK'))
    .catch((err) => {
      const eMsg = `${LOG_PREFIX} ERROR`
      console.error(eMsg, err)
      defer.reject(eMsg)
    })

  return defer.promise
}

/*
  loadJsonData
*/
const loadJsonData = () => {
  console.info(`${LOG_PREFIX} loading JSON data`)
  const defer = new Deferred<string>()

  // Promise-chain support

  const readFile = () => {
    const { jsonFilePath } = gFileData
    return fs.promises.readFile(jsonFilePath, 'utf8')
  }

  const processFile = (data: string) => {
    return JSON.parse(data) as BookmarkRecord[]
  }

  // optional
  const insertDates = (records: BookmarkRecord[]) => {
    const defaultDateStr = new Date().toISOString()
    let itemsNeeded = 0
    let itemsFound = 0

    records.forEach((rec) => {
      const { created, url } = rec

      if (created == undefined) {
        itemsNeeded += 1
        const dateStr = gDateLookup[url] || defaultDateStr
        if (dateStr) {
          itemsFound += 1
          rec.created = dateStr
          gHasChanged = true
        }
      }
    })
    console.log(
      `${LOG_PREFIX} Dates: found ${itemsFound}  needed ${itemsNeeded}`
    )

    return records
  }

  const updateTitles = (records: BookmarkRecord[]) => {
    let itemsNeeded = 0
    let itemsFound = 0

    records.forEach((rec) => {
      const { title, url } = rec

      if (title.startsWith('http')) {
        itemsNeeded += 1
        const titleStr = gTitleLookup[url]
        if (titleStr) {
          itemsFound += 1
          rec.title = titleStr
          gHasChanged = true
        }
      }
    })
    console.info(
      `${LOG_PREFIX} Titles: found ${itemsFound}  needed ${itemsNeeded}`
    )

    return records
  }

  const storeData = (records: BookmarkRecord[]) => {
    gAllUrlRecs = records
    return records
  }

  const initLookup = (records: BookmarkRecord[]) => {
    records.forEach((record) => {
      const { url } = record
      gUrlLookup[url] = true
    })
    return 'OK'
  }

  // Promise chain

  readFile()
    .then(processFile)
    .then(insertDates)
    .then(updateTitles)
    .then(storeData)
    .then(initLookup)
    .then(() => defer.resolve(`${LOG_PREFIX} OK read JSON`))
    .catch((err) => {
      const eMsg = `${LOG_PREFIX} ERROR load JSON`
      console.error(eMsg, err)
      defer.reject(eMsg)
    })

  return defer.promise
}

/*
  copyBookmarkFile
*/
function copyBookmarkFile() {
  console.info(`${LOG_PREFIX} copying bookmark file`)
  const { plistFilePathIn, plistFilePathOut } = gFileData
  const cmd = `cp "${plistFilePathIn}" "${plistFilePathOut}"`
  return pExecFile(cmd)
}

/*
convertBookmarkFile
*/
function convertBookmarkFile() {
  console.info(`${LOG_PREFIX} converting bookmark file`)
  const { plistFilePathOut } = gFileData
  const cmd = `plutil -convert xml1 "${plistFilePathOut}"`
  return pExecFile(cmd)
}

/*
readBookmarkFile
*/
function readBookmarkFile() {
  console.info(`${LOG_PREFIX} reading bookmark file`)
  const defer = new Deferred<plist.PlistValue>()

  const readFile = () => {
    const { plistFilePathOut } = gFileData
    return fs.promises.readFile(plistFilePathOut, 'utf8')
  }

  const parseFile = (data: string) => {
    try {
      const node = plist.parse(data)
      return Promise.resolve(node)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  readFile()
    .then(parseFile)
    .then((result) => defer.resolve(result))
    .catch((err) => {
      const eMsg = `${LOG_PREFIX} ERROR readBookmarkFile`
      console.error(eMsg, err)
      defer.reject(eMsg)
    })

  return defer.promise
}

/*
  processBookmarkFile
*/
function processBookmarkFile(node: plist.PlistValue) {
  console.info(`${LOG_PREFIX} process bookmark file`)
  return processRoot(node as PlistObject)
}

/*
  saveJsonData
*/
function saveJsonData() {
  const defer = new Deferred<string>()
  const { jsonFilePath } = gFileData

  const checkChanges = () => {
    if (gHasChanged) {
      console.info(`${LOG_PREFIX} saving JSON data`)
      return Promise.resolve('to-save')
    } else {
      console.info(`${LOG_PREFIX} no change JSON data`)
      return Promise.reject('no-save')
    }
  }

  const processData = () => {
    return JSON.stringify(gAllUrlRecs)
  }

  const writeFile = ((fP) => {
    return (data: string) => fs.promises.writeFile(fP, data)
  })(jsonFilePath)

  // Promise chain

  checkChanges()
    .then(processData)
    .then(writeFile)
    .then(() => defer.resolve(`${LOG_PREFIX} OK saveJsonData`))
    .catch((err) => {
      if (err == 'no-save') {
        defer.resolve(`${LOG_PREFIX} OK saveJsonData`)
      } else {
        const eMsg = `${LOG_PREFIX} ERROR saveJsonData`
        console.error(eMsg, err)
        defer.reject(eMsg)
      }
    })

  return defer.promise
}

function configServices() {
  const { output } = gConfig

  output.forEach((connector) => {
    const { service, config } = connector

    switch (service) {
      case 'raindrop.io':
        Raindrop.config(config as RaindropConfig)
        break
      default:
        console.warn('unknown service', service)
    }
  })

  return
}

function saveToServices() {
  const doReset = false
  const recs = doReset ? gAllUrlRecs : gNewUrlRecs
  return Raindrop.data(recs, doReset)
}

function startServices() {
  return Raindrop.process()
}

function endProcess<T>(result: T) {
  console.log(
    `== Processed items: new ${gNewUrlRecs.length} dups ${gDuplicateCount} total ${gRecordCount} `
  )
  return result
}

/*
  loadBookmarkData()
*/
function loadBookmarkData() {
  const defer = new Deferred<string>()
  const { dataFilePathIn } = gFileData

  const storeData = (result: StringLookupHash[]) => {
    const [date, title] = result
    gDateLookup = date
    gTitleLookup = title
    return result
  }

  DataLookupByFile(dataFilePathIn)
    .then(storeData)
    .then(() => defer.resolve(`${LOG_PREFIX} OK loadBookmarkData`))
    .catch((err) => defer.reject(err))

  return defer.promise
}

/*
  Promise chain
*/
startProcess()
  .then(readConfigFile)
  .then(configServices)
  // first copy/convert current bookmark file
  // able to do date/title updates in JSON
  .then(copyBookmarkFile)
  .then(convertBookmarkFile)
  // load for date/title updates in JSON
  .then(loadBookmarkData)
  .then(loadJsonData)
  // read current bookmark file and process for new records
  .then(readBookmarkFile)
  .then(processBookmarkFile)
  .then(saveJsonData)
  .then(saveToServices)
  .then(startServices)
  .then(endProcess)
  .catch((err) => console.error(`${LOG_PREFIX} ERROR `, err))
