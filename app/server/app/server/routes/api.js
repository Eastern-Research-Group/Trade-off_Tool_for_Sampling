const axios = require('axios');
const express = require('express');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const logger = require('../utilities/logger');
const log = logger.logger;

function logError(error, metadataObj, isLocal) {
  if (isLocal) {
    log.error(error);
    return;
  }

  if (typeof error.toJSON === 'function') {
    log.debug(logger.formatLogMsg(metadataObj, error.toJSON()));
  }

  const errorStatus = error.response?.status;
  const errorMethod = error.response?.config?.method?.toUpperCase();
  const errorUrl = error.response?.config?.url;
  const message = `S3 Error: ${errorStatus} ${errorMethod} ${errorUrl}`;
  log.error(logger.formatLogMsg(metadataObj, message));
}

// local development: read files directly from disk
// Cloud.gov: fetch files from the public s3 bucket
async function getFile(
  s3BucketUrl,
  filename,
  isLocal,
  responseType = undefined,
) {
  return isLocal
    ? readFile(path.resolve(__dirname, '../../public', filename))
    : axios({
        method: 'get',
        url: `${s3BucketUrl}/${filename}`,
        timeout: 10000,
        responseType,
      });
}

// local development: no further processing of strings needed
// Cloud.gov: get data from responses
function parseResponse(res, isLocal) {
  if (Array.isArray(res)) {
    return isLocal ? res.map((r) => JSON.parse(r)) : res.map((r) => r.data);
  } else {
    return isLocal ? JSON.parse(res) : res.data;
  }
}

module.exports = function (app) {
  const router = express.Router();

  function getFiles(req, res, filenames, dataMapper) {
    const metadataObj = logger.populateMetdataObjFromRequest(req);

    const isLocal = app.enabled('isLocal');
    const s3BucketUrl = app.get('s3_bucket_url');

    const promise =
      filenames.length > 1
        ? Promise.all(
            filenames.map((filename) => {
              return getFile(s3BucketUrl, filename, isLocal);
            }),
          )
        : getFile(s3BucketUrl, filenames[0], isLocal);

    promise
      .then((stringsOrResponses) => {
        return parseResponse(stringsOrResponses, isLocal);
      })
      .then((data) => {
        if (dataMapper) return dataMapper(data);
        return data;
      })
      .then((data) => res.json(data))
      .catch((error) => {
        logError(error, metadataObj, isLocal);

        return res
          .status(error?.response?.status || 500)
          .json({ message: 'Error getting static content from S3 bucket' });
      });
  }

  // --- get static content from S3
  router.get('/lookupFiles', (req, res) => {
    // NOTE: static content files found in `app/server/app/public/data` directory
    getFiles(
      req,
      res,
      [
        'data/config/layerProps.json',
        'data/config/services.json',
        'data/notifications/messages.json',
        'data/sampleTypes/sampleTypes.json',
      ],
      (data) => {
        return {
          layerProps: data[0],
          services: data[1],
          notifications: data[2],
          sampleTypes: data[3],
        };
      },
    );
  });

  // --- get static content from S3
  router.get('/supportedBrowsers', (req, res) => {
    // NOTE: static content files found in `app/server/app/public/data` directory
    getFiles(req, res, ['data/config/supported-browsers.json']);
  });

  // --- get static content from S3
  router.get('/userGuide', (req, res) => {
    const metadataObj = logger.populateMetdataObjFromRequest(req);

    const isLocal = app.enabled('isLocal');
    const s3BucketUrl = app.get('s3_bucket_url');

    getFile(s3BucketUrl, 'data/documents/TOTS-Users-Guide.pdf', isLocal)
      .then((data) => {
        res.contentType('application/pdf');
        res.send(data);
      })
      .catch((error) => {
        logError(error, metadataObj, isLocal);

        return res
          .status(error?.response?.status || 500)
          .json({ message: 'Error getting static content from S3 bucket' });
      });
  });

  app.use('/api', router);
};
