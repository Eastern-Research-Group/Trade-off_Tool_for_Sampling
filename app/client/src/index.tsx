import 'react-app-polyfill/stable';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Global, css } from '@emotion/react';
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
import { LookupFilesProvider } from 'contexts/LookupFiles';
import { NavigationProvider } from 'contexts/Navigation';
import { PublishProvider } from 'contexts/Publish';
import { SketchProvider } from 'contexts/Sketch';
// styles
import '@arcgis/core/assets/esri/themes/light/main.css';

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
                      <AlertDialog />
                      <AlertMessage />

                      <Routes>
                        <Route index element={<App />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="*" element={<ErrorPage />} />
                      </Routes>
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
