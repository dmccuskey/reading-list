// Interfaces

export interface RaindropRecord {
  created: string
  link: string
  pleaseParse: unknown
  title: string
}

export interface MultiRaindropRecord {
  items: RaindropRecord[]
}

export interface RaindropConfig {
  resetData: boolean
  token: string
  postRecordsSize: number
  postRecordsTotal: number | null
}
