// Libs
import plist, { PlistArray, PlistObject } from 'plist'
import fs from 'fs'
import { Deferred } from 'ts-deferred'

// Constants & Interfaces
import { StringLookupHash } from '../app.interfaces'

const LOG_PREFIX = '[DATA LOOKUP]'

const gDateLookup: StringLookupHash = {}
const gTitleLookup: StringLookupHash = {}

// # this is an actual bookmark with URL
const process_WebBookmarkTypeLeaf = (node: PlistObject) => {
  const url = node['URLString'] as string
  const dict = node['URIDictionary'] as PlistObject
  const title = dict['title'] as string
  const list = node['ReadingList'] as PlistObject
  const created = list['DateAdded'] as string

  if (url && created) {
    gDateLookup[url] = created
  }
  if (url && title && !title.startsWith('http')) {
    gTitleLookup[url] = title
  }
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
  console.info(`${LOG_PREFIX} processing file`)
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

/*
  readBookmarkFile
*/
function readBookmarkFile(filePath: string) {
  console.info(`${LOG_PREFIX} reading file`)
  const defer = new Deferred<plist.PlistValue>()

  const readFile = () => {
    return fs.promises.readFile(filePath, 'utf8')
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
      const msg = `ERR readBookmarkFiles ${filePath}`
      console.error(msg, err)
      defer.reject(msg)
    })

  return defer.promise
}

/*
  processBookmarkFile
*/
function processBookmarkFile(node: plist.PlistValue) {
  return processRoot(node as PlistObject)
}

export const DataLookupByFile = function (bookmarkPath: string) {
  console.info(`${LOG_PREFIX} = Starting =`)
  const defer = new Deferred<StringLookupHash[]>()

  const start = function () {
    return Promise.resolve('ok')
  }

  const readFile = function () {
    return readBookmarkFile(bookmarkPath)
  }

  const complete = function <T>(result: T) {
    console.info(`${LOG_PREFIX} = Complete =`)
    return result
  }

  start()
    .then(readFile)
    .then(processBookmarkFile)
    .then(complete)
    .then(() => defer.resolve([gDateLookup, gTitleLookup]))
    .catch((err) => {
      const eMsg = `${LOG_PREFIX} ERROR`
      console.error(eMsg, err)
      defer.reject(eMsg)
    })

  return defer.promise
}
