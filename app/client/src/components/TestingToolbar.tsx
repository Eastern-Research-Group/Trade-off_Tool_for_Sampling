/** @jsxImportSource @emotion/react */

import React, { Fragment, useContext } from 'react';
import { css } from '@emotion/react';
// contexts
import { DashboardContext } from 'contexts/Dashboard';
import { SketchContext } from 'contexts/Sketch';
import { useServicesContext } from 'contexts/LookupFiles';
import { appendEnvironmentObjectParam } from 'utils/arcGisRestUtils';
import { geoprocessorFetch } from 'utils/fetchUtils';

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
  const services = useServicesContext();

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
      <button
        css={buttonStyles}
        onClick={async () => {
          if (services.status !== 'success') return;

          // call gp service
          const props = {
            f: 'json',
            Feature_Set: featureSet,
            Imagery_Layer_URL:
              'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
          };
          appendEnvironmentObjectParam(props);

          const result = await geoprocessorFetch({
            url: `${services.data.shippTestGPServer}/Classify%20AOI`,
            inputParameters: props,
          });
          console.log('result: ', result);
        }}
      >
        Test GP Service Call
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

const featureSet = {
  displayFieldName: '',
  features: [
    {
      aggregateGeometries: null,
      geometry: {
        spatialReference: { latestWkid: 3857, wkid: 102100 },
        rings: [
          [
            [-13622317.888063796, 4556014.833355593],
            [-13621381.534467304, 4554935.160331066],
            [-13623163.4726892, 4554462.206218552],
            [-13623235.132403217, 4555737.7491280595],
            [-13622317.888063796, 4556014.833355593],
          ],
        ],
      },
      symbol: {
        type: 'esriSFS',
        color: [150, 150, 150, 51],
        outline: {
          type: 'esriSLS',
          color: [50, 50, 50, 255],
          width: 2,
          style: 'esriSLSSolid',
        },
        style: 'esriSFSSolid',
      },
      attributes: {
        DECISIONUNITUUID: '{1350DA43-7F66-4041-90D2-42E644D44404}',
        DECISIONUNIT: 'Sketched Decon Mask',
        DECISIONUNITSORT: 0,
        PERMANENT_IDENTIFIER: '{BB475CAA-7706-4F92-829D-CCDECB131FCB}',
        GLOBALID: '{BB475CAA-7706-4F92-829D-CCDECB131FCB}',
        OBJECTID: -1,
        TYPE: 'Sampling Mask',
        AREA: 1106740.4940424147,
      },
      popupTemplate: {
        popupElements: [
          {
            type: 'fields',
            fieldInfos: [
              {
                fieldName: 'TYPE',
                isEditable: true,
                label: 'Type',
                visible: true,
              },
            ],
          },
        ],
        title: '',
      },
    },
  ],
  fields: [
    {
      alias: 'OBJECTID',
      editable: true,
      name: 'OBJECTID',
      nullable: true,
      type: 'esriFieldTypeOID',
    },
    {
      alias: 'PERMANENT_IDENTIFIER',
      editable: true,
      name: 'PERMANENT_IDENTIFIER',
      nullable: true,
      type: 'esriFieldTypeGUID',
    },
  ],
  geometryType: 'esriGeometryPolygon',
  spatialReference: { wkid: 3857 },
};
