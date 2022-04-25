// Constants & Interfaces
import { RaindropConfig } from './services/raindrop-io.interfaces'

export interface BookmarkRecord {
  created: string // date
  title: string
  url: string
}

export interface StringLookupHash {
  [key: string]: string
}

export type ServiceConfigs = RaindropConfig

export type ConfigFunc = (config: ServiceConfigs) => void
export type DataFunc = (
  records: BookmarkRecord[],
  reset: boolean
) => Promise<string>
export type ProcessFunc = () => Promise<string>

export interface Service {
  config: ConfigFunc
  data: DataFunc
  process: ProcessFunc
}

export interface KeyIndex {
  [key: string]: string | number
}

export interface FileConfig extends KeyIndex {
  // file names
  configFile: string
  jsonFileName: string
  plistFileName: string
  dataFileName: string
  // directories
  envHome: string
  dataPath: string
  safariPath: string
  appDir: string
  // full paths
  jsonFilePath: string
  plistFilePathIn: string
  plistFilePathOut: string
  dataFilePathIn: string
}

export interface LocalConfig extends KeyIndex {
  dataPath: string
}

export interface OutputServiceConfig {
  service: string
  config: unknown
}

export interface ConfigFile {
  local: LocalConfig
  input: string[]
  output: OutputServiceConfig[]
}
