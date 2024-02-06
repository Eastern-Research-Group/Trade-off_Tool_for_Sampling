import 'react-app-polyfill/stable';
import React, { Fragment, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Global, css } from '@emotion/react';
import esriConfig from '@arcgis/core/config';
import * as urlUtils from '@arcgis/core/core/urlUtils';
import * as serviceWorker from './serviceWorker';
// components
import ErrorBoundary from 'components/ErrorBoundary';
import AlertDialog from 'components/AlertDialog';
import AlertMessage from 'components/AlertMessage';
import ErrorPage from 'routes/404';
import App from 'routes/App';
import Dashboard from 'routes/Dashboard';
// contexts
import { AuthenticationProvider } from 'contexts/Authentication';
import { CalculateProvider } from 'contexts/Calculate';
import { DialogProvider } from 'contexts/Dialog';
import { LookupFilesProvider, useServicesContext } from 'contexts/LookupFiles';
import { NavigationProvider } from 'contexts/Navigation';
import { PublishProvider } from 'contexts/Publish';
import { SketchProvider } from 'contexts/Sketch';
// utilities
import { getEnvironmentString } from 'utils/arcGisRestUtils';
import { logCallToGoogleAnalytics } from 'utils/fetchUtils';
// styles
import '@arcgis/core/assets/esri/themes/light/main.css';
import '@reach/dialog/styles.css';

declare global {
  interface Window {
    googleAnalyticsMapping: any[];
    logErrorToGa: Function;
    logToGa: Function;
  }
}

const globalStyles = css`
  html {
    /* overwrite EPA's html font-size so rem units are based on 16px */
    font-size: 100%;
  }

  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto',
      'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans',
      'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;

    /* re-apply EPA's html element font-size, just scoped to the body element */
    font-size: 106.25%;
  }

  .tots {
    /* revert back to 16px font-size on our application code itself */
    font-size: 1rem;

    input {
      &:disabled {
        color: #999;
        background-color: #f2f2f2;
        border-color: #fff;
      }
    }
  }

  .sr-only {
    position: absolute;
    left: -10000px;
    top: auto;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  .esri-popup__main-container {
    min-width: 460px !important;
  }

  .esri-popup__action-text {
    display: none;
  }

  .esri-widget,
  .esri-widget--button {
    &:focus {
      outline: none;
    }
  }
`;

function AppRoutes() {
  const services = useServicesContext();

  // setup esri interceptors for logging to google analytics
  const [interceptorsInitialized, setInterceptorsInitialized] = useState(false);
  useEffect(() => {
    if (interceptorsInitialized || !esriConfig?.request?.interceptors) return;

    var callId = 0;
    var callDurations: any = {};

    if (services.status === 'success') {
      // Have ESRI use the proxy for communicating with the TOTS GP Server
      urlUtils.addProxyRule({
        proxyUrl: services.data.proxyUrl,
        urlPrefix: 'https://ags.erg.com',
      });
      urlUtils.addProxyRule({
        proxyUrl: services.data.proxyUrl,
        urlPrefix: 'http://ags.erg.com',
      });
    }

    if (!esriConfig?.request?.interceptors) return;

    // intercept esri calls to gispub
    const urls: string[] = ['https://www.arcgis.com/sharing/rest/'];
    esriConfig.request.interceptors.push({
      urls,

      // Workaround for ESRI CORS cacheing issue, when switching between
      // environments.
      before: function (params) {
        // if this environment has a phony variable use it
        const envString = getEnvironmentString();
        if (envString) {
          params.requestOptions.query[envString] = 1;
        }

        // add the callId to the query so we can tie the response back
        params.requestOptions.query['callId'] = callId;

        // add the call's start time to the dictionary
        callDurations[callId] = performance.now();

        // increment the callId
        callId = callId + 1;
      },

      // Log esri api calls to Google Analytics
      after: function (response: any) {
        // get the execution time for the call
        const callId = response.requestOptions.query.callId;
        const startTime = callDurations[callId];

        logCallToGoogleAnalytics(response.url, 200, startTime);

        // delete the execution time from the dictionary
        delete callDurations[callId];
      },

      error: function (error) {
        // get the execution time for the call
        const details = error.details;
        const callId = details.requestOptions.query.callId;
        const startTime = callDurations[callId];

        logCallToGoogleAnalytics(
          details.url,
          details.httpStatus ? details.httpStatus : error.message,
          startTime,
        );

        // delete the execution time from the dictionary
        delete callDurations[callId];
      },
    });

    setInterceptorsInitialized(true);
  }, [interceptorsInitialized, services]);

  return (
    <Fragment>
      <AlertDialog />
      <AlertMessage />

      <Routes>
        <Route index element={<App />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </Fragment>
  );
}

function Root() {
  return (
    <BrowserRouter>
      <LookupFilesProvider>
        <DialogProvider>
          <AuthenticationProvider>
            <CalculateProvider>
              <NavigationProvider>
                <PublishProvider>
                  <SketchProvider>
                    <Global styles={globalStyles} />
                    <ErrorBoundary>
                      <AppRoutes />
                    </ErrorBoundary>
                  </SketchProvider>
                </PublishProvider>
              </NavigationProvider>
            </CalculateProvider>
          </AuthenticationProvider>
        </DialogProvider>
      </LookupFilesProvider>
    </BrowserRouter>
  );
}

const rootElement = document.getElementById('root') as HTMLElement;
createRoot(rootElement).render(<Root />);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
