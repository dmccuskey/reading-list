/*
  make changes
  remove '-template' from file name
*/

const config = {
  local: {
    // working directory for reading-list files
    // Documents, SynologyDrive, Dropbox, etc
    dataPath: 'Documents',
  },
  input: [],
  output: [
    {
      service: 'raindrop.io',
      config: {
        // resets queue: set to true, run, re-set to false
        resetData: false,
        // add your raindrop.io token here
        token: 'raindrop-io-token',
        // number of records to post each call: min 1, max 100
        postRecordsSize: 20,
        // how many records total to post: min 1, all: null
        postRecordsTotal: 100,
      },
    },
  ],
}

export default config
