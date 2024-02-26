/** @jsxImportSource @emotion/react */

import React, { Fragment, useContext } from 'react';
import { css } from '@emotion/react';
// contexts
import { DashboardContext } from 'contexts/Dashboard';
import { SketchContext } from 'contexts/Sketch';

const toolbarStyles = css`
  padding: 8px;
  background-color: lightgray;
  button {
    margin-bottom: 5px;
  }
`;
const buttonStyles = css`
  margin-top: 0.25rem;
  margin-right: 0.75rem;
`;

function TestingToolbar() {
  const { mapDashboard, mapViewDashboard, sceneViewDashboard } =
    useContext(DashboardContext);
  const { layers, map, mapView, sceneView, sketchVM } =
    useContext(SketchContext);

  return (
    <div css={toolbarStyles}>
      <button
        css={buttonStyles}
        onClick={() => {
          if (window.location.pathname === '/dashboard') {
            console.log('map: ', mapDashboard);
          } else {
            console.log('map: ', map);
          }
        }}
      >
        Log Map
      </button>
      <button
        css={buttonStyles}
        onClick={() => {
          if (window.location.pathname === '/dashboard') {
            console.log('mapView: ', mapViewDashboard);
            console.log('sceneView: ', sceneViewDashboard);
          } else {
            console.log('mapView: ', mapView);
            console.log('sceneView: ', sceneView);
          }
        }}
      >
        Log Views
      </button>
      {window.location.pathname !== '/dashboard' && (
        <Fragment>
          <button
            css={buttonStyles}
            onClick={() => console.log('layers: ', layers)}
          >
            Log Layers
          </button>
          <button
            css={buttonStyles}
            onClick={() => console.log('sketchVM: ', sketchVM)}
          >
            Log SketchVM
          </button>
        </Fragment>
      )}
      <button
        css={buttonStyles}
        onClick={() => {
          sessionStorage.clear();
        }}
      >
        Clear Session Data
      </button>
    </div>
  );
}
export default TestingToolbar;
