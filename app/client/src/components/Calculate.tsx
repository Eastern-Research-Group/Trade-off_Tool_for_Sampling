/** @jsxImportSource @emotion/react */

import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { css } from '@emotion/react';
import ExcelJS from 'exceljs';
import saveAs from 'file-saver';
import { DialogContent, DialogOverlay } from '@reach/dialog';
import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import PopupTemplate from '@arcgis/core/PopupTemplate';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import LoadingSpinner from 'components/LoadingSpinner';
import NavigationButton from 'components/NavigationButton';
import { ReactTableEditable } from 'components/ReactTable';
import Select from 'components/Select';
import ShowLessMore from 'components/ShowLessMore';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerDeconEditsType } from 'types/Edits';
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
import { AppType } from 'types/Navigation';
// config
import {
  base64FailureMessage,
  contaminationHitsSuccessMessage,
  downloadSuccessMessage,
  excelFailureMessage,
  generalError,
  noContaminationGraphicsMessage,
  noContaminationMapMessage,
  noFeaturesMessage,
  noSampleLayerMessage,
  noSamplesMessage,
  screenshotFailureMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
// utils
import { appendEnvironmentObjectParam } from 'utils/arcGisRestUtils';
import { geoprocessorFetch } from 'utils/fetchUtils';
import { useDynamicPopup } from 'utils/hooks';
import {
  generateUUID,
  getGraphicsArray,
  removeZValues,
  updateLayerEdits,
} from 'utils/sketchUtils';
import { formatNumber, parseSmallFloat } from 'utils/utils';
// styles
import { colors, reactSelectStyles } from 'styles';

type ContaminationResultsType = {
  status:
    | 'none'
    | 'no-layer'
    | 'no-map'
    | 'no-contamination-graphics'
    | 'no-graphics'
    | 'fetching'
    | 'success'
    | 'failure';
  error?: ErrorType;
  data: any[] | null;
};

type Cell = { value: any; font?: any; alignment?: any; numFmt?: any };
type Row = Cell[];

// Gets all of the graphics of a group layer associated with the provided layerId
function getGraphics(map: __esri.Map, layerId: string) {
  const graphics: __esri.Graphic[] = [];
  let groupLayer: __esri.GroupLayer | null = null;

  // find the group layer
  const tempGroupLayer = map.layers.find((layer) => layer.id === layerId);

  // get the graphics
  if (tempGroupLayer) {
    groupLayer = tempGroupLayer as __esri.GroupLayer;
    groupLayer.layers.forEach((layer) => {
      if (
        layer.type !== 'graphics' ||
        layer.id.includes('-points') ||
        layer.id.includes('-hybrid')
      )
        return;

      const graphicsLayer = layer as __esri.GraphicsLayer;

      const fullGraphics = graphicsLayer.graphics.clone();
      fullGraphics.forEach((graphic) => removeZValues(graphic));
      graphics.push(...fullGraphics.toArray());
    });
  }

  return { groupLayer, graphics };
}

// --- styles (Calculate) ---
const inputStyles = css`
  width: 100%;
  height: 36px;
  margin: 0 0 10px 0;
  padding-left: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const submitButtonContainerStyles = css`
  margin-top: 10px;
`;

const submitButtonStyles = css`
  margin: 10px 0;
  width: 100%;
`;

const panelContainer = css`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
  padding: 20px 0;
`;

const sectionContainer = css`
  margin-bottom: 10px;
  padding: 0 20px;
`;

const layerInfo = css`
  padding-bottom: 0.5em;
`;

const inlineMenuStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const addButtonStyles = css`
  margin: 0;
  height: 38px; /* same height as ReactSelect */
`;

const fullWidthSelectStyles = css`
  width: 100%;
  margin-right: 10px;
`;

// --- components (Calculate) ---
type Props = {
  appType: AppType;
};

function Calculate({ appType }: Props) {
  const { setGoTo, setGoToOptions, trainingMode } =
    useContext(NavigationContext);
  const {
    edits,
    setEdits,
    layers,
    setLayers,
    map,
    resultsOpen,
    setResultsOpen,
    sketchLayer,
    selectedScenario,
  } = useContext(SketchContext);
  const {
    calculateResults,
    calculateResultsDecon,
    contaminationMap,
    inputNumLabHours,
    inputNumLabs,
    inputNumSamplingHours,
    inputNumSamplingPersonnel,
    inputNumSamplingShifts,
    inputNumSamplingTeams,
    inputSamplingLaborCost,
    inputSurfaceArea,
    resetCalculateContext,
    setCalculateResults,
    setCalculateResultsDecon,
    setContaminationMap,
    setInputNumLabHours,
    setInputNumLabs,
    setInputNumSamplingHours,
    setInputNumSamplingPersonnel,
    setInputNumSamplingShifts,
    setInputNumSamplingTeams,
    setInputSamplingLaborCost,
    setInputSurfaceArea,
    setUpdateContextValues,
  } = useContext(CalculateContext);

  const getPopupTemplate = useDynamicPopup(appType);

  // sync the inputs with settings pulled from AGO
  const [pageInitialized, setPageInitialized] = useState(false);
  useEffect(() => {
    if (selectedScenario?.type !== 'scenario' || pageInitialized) return;
    setPageInitialized(true);

    const {
      NUM_LAB_HOURS: numLabHours,
      NUM_LABS: numLabs,
      NUM_SAMPLING_HOURS: numSamplingHours,
      NUM_SAMPLING_PERSONNEL: numSamplingPersonnel,
      NUM_SAMPLING_SHIFTS: numSamplingShifts,
      NUM_SAMPLING_TEAMS: numSamplingTeams,
      SAMPLING_LABOR_COST: samplingLaborCost,
      SURFACE_AREA: surfaceArea,
    } = selectedScenario.calculateSettings.current;

    setInputNumLabHours(numLabHours);
    setInputNumLabs(numLabs);
    setInputNumSamplingHours(numSamplingHours);
    setInputNumSamplingPersonnel(numSamplingPersonnel);
    setInputNumSamplingShifts(numSamplingShifts);
    setInputNumSamplingTeams(numSamplingTeams);
    setInputSamplingLaborCost(samplingLaborCost);
    setInputSurfaceArea(surfaceArea);
  }, [
    edits,
    pageInitialized,
    resetCalculateContext,
    selectedScenario,
    setInputNumLabHours,
    setInputNumLabs,
    setInputNumSamplingHours,
    setInputNumSamplingPersonnel,
    setInputNumSamplingShifts,
    setInputNumSamplingTeams,
    setInputSamplingLaborCost,
    setInputSurfaceArea,
  ]);

  // callback for closing the results panel when leaving this tab
  const closePanel = useCallback(() => {
    if (appType === 'decon') {
      setCalculateResultsDecon((calculateResultsDecon) => {
        return {
          ...calculateResultsDecon,
          panelOpen: false,
        };
      });
    }
    if (appType === 'sampling') {
      setCalculateResults((calculateResults) => {
        return {
          ...calculateResults,
          panelOpen: false,
        };
      });
    }
  }, [appType, setCalculateResults, setCalculateResultsDecon]);

  // Cleanup useEffect for closing the results panel when leaving
  // this tab
  useEffect(() => {
    return function cleanup() {
      closePanel();
    };
  }, [closePanel]);

  // Initialize the contamination map to the first available one
  const [contamMapInitialized, setContamMapInitialized] = useState(false);
  useEffect(() => {
    if (contamMapInitialized) return;

    setContamMapInitialized(true);

    // exit early since there is no need to set the contamination map
    if (contaminationMap) return;

    // set the contamination map to the first available one
    const newContamMap = layers.find(
      (layer) => layer.layerType === 'Contamination Map',
    );
    if (!newContamMap) return;
    setContaminationMap(newContamMap);
  }, [contaminationMap, setContaminationMap, contamMapInitialized, layers]);

  // updates context to run the calculations
  function runCalculation() {
    if (!map) return;

    const results =
      appType === 'decon' ? calculateResultsDecon : calculateResults;
    const setter =
      appType === 'decon' ? setCalculateResultsDecon : setCalculateResults;

    // set no scenario status
    if (!selectedScenario || selectedScenario.type !== 'scenario') {
      setter({
        status: 'no-scenario',
        panelOpen: true,
        data: null,
      });
      return;
    }

    // set the no layer status
    if (selectedScenario.layers.length === 0) {
      setter({ status: 'no-layer', panelOpen: true, data: null });
      return;
    }

    const { graphics } = getGraphics(map, selectedScenario.layerId);

    // set the no graphics status
    if (graphics.length === 0) {
      setter({
        status: 'no-graphics',
        panelOpen: true,
        data: null,
      });
      return;
    }

    const {
      NUM_LABS: numLabs,
      NUM_LAB_HOURS: numLabHours,
      NUM_SAMPLING_HOURS: numSamplingHours,
      NUM_SAMPLING_PERSONNEL: numSamplingPersonnel,
      NUM_SAMPLING_SHIFTS: numSamplingShifts,
      NUM_SAMPLING_TEAMS: numSamplingTeams,
      SAMPLING_LABOR_COST: samplingLaborCost,
      SURFACE_AREA: surfaceArea,
    } = selectedScenario.calculateSettings.current;

    // if the inputs are the same as context
    // fake a loading spinner and open the panel
    if (
      results.status === 'success' &&
      numLabs === inputNumLabs &&
      numLabHours === inputNumLabHours &&
      numSamplingHours === inputNumSamplingHours &&
      numSamplingShifts === inputNumSamplingShifts &&
      numSamplingPersonnel === inputNumSamplingPersonnel &&
      numSamplingTeams === inputNumSamplingTeams &&
      samplingLaborCost === inputSamplingLaborCost &&
      surfaceArea === inputSurfaceArea
    ) {
      // display the loading spinner for 1 second
      if (appType === 'decon') {
        setCalculateResultsDecon({
          status: 'fetching',
          panelOpen: true,
          data: calculateResultsDecon.data,
        });
        setTimeout(() => {
          setCalculateResultsDecon({
            status: 'success',
            panelOpen: true,
            data: calculateResultsDecon.data,
          });
        }, 1000);
      }
      if (appType === 'sampling') {
        setCalculateResults({
          status: 'fetching',
          panelOpen: true,
          data: calculateResults.data,
        });
        setTimeout(() => {
          setCalculateResults({
            status: 'success',
            panelOpen: true,
            data: calculateResults.data,
          });
        }, 1000);
      }

      return;
    }

    // open the panel and update context to run calculations
    setter({ status: 'fetching', panelOpen: true, data: null });
    setUpdateContextValues(true);
  }

  const [
    contaminationResults,
    setContaminationResults, //
  ] = useState<ContaminationResultsType>({ status: 'none', data: null });

  // Call the GP Server to run calculations against the contamination
  // map.
  async function runContaminationCalculation() {
    if (!map || !sketchLayer?.sketchLayer) return;

    const setter =
      appType === 'decon' ? setCalculateResultsDecon : setCalculateResults;

    // set no scenario status
    if (!selectedScenario || selectedScenario.type !== 'scenario') {
      setter({
        status: 'no-scenario',
        panelOpen: true,
        data: null,
      });
      return;
    }

    // set the no layer status
    if (selectedScenario.layers.length === 0) {
      setter({ status: 'no-layer', panelOpen: true, data: null });
      return;
    }

    // set the no contamination map status
    if (!contaminationMap) {
      setContaminationResults({ status: 'no-map', data: null });
      return;
    }

    let graphics: __esri.Graphic[] = [];
    if (contaminationMap?.sketchLayer?.type === 'graphics') {
      const fullGraphics = contaminationMap.sketchLayer.graphics.clone();
      fullGraphics.forEach((graphic) => removeZValues(graphic));

      graphics = fullGraphics.toArray();
    }
    if (graphics.length === 0) {
      // display the no graphics on contamination map warning
      setContaminationResults({
        status: 'no-contamination-graphics',
        data: null,
      });
      return;
    }

    const { groupLayer, graphics: sketchedGraphicsTmp } = getGraphics(
      map,
      selectedScenario.layerId,
    );
    if (sketchedGraphicsTmp.length === 0 || !groupLayer) {
      // display the no-graphics warning
      setContaminationResults({
        status: 'no-graphics',
        data: null,
      });
      return;
    }

    function addBraces(str: string) {
      if (!str.includes('{') && !str.includes('}')) return `{${str}}`;
      else if (!str.includes('{') && str.includes('}')) return `{${str}`;
      else if (str.includes('{') && !str.includes('}')) return `${str}}`;
      else return str;
    }

    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    const sketchedGraphics = [...sketchedGraphicsTmp];
    sketchedGraphics.forEach((g) => {
      g.attributes.GLOBALID = addBraces(g.attributes.GLOBALID);
      g.attributes.PERMANENT_IDENTIFIER = addBraces(
        g.attributes.PERMANENT_IDENTIFIER,
      );
    });

    // display the loading spinner
    setContaminationResults({
      status: 'fetching',
      data: null,
    });

    await delay(100);

    const resFeatures: any[] = [];
    // loop through contamination map
    graphics.forEach((contamGraphic) => {
      sketchedGraphics.forEach((sampleGraphic) => {
        const resFeature = resFeatures.find(
          (feature: any) =>
            sampleGraphic.attributes.PERMANENT_IDENTIFIER.toLowerCase()
              .replace('{', '')
              .replace('}', '') ===
            feature.attributes.PERMANENT_IDENTIFIER.toLowerCase()
              .replace('{', '')
              .replace('}', ''),
        );

        if (
          !contamGraphic.geometry ||
          !sampleGraphic.geometry ||
          !geometryEngine.intersects(
            sampleGraphic.geometry,
            contamGraphic.geometry,
          )
        ) {
          return;
        }

        if (!resFeature) {
          resFeatures.push({
            attributes: {
              CONTAMTYPE: contamGraphic.attributes.CONTAMTYPE,
              CONTAMUNIT: contamGraphic.attributes.CONTAMUNIT,
              CONTAMVAL: contamGraphic.attributes.CONTAMVAL,
              PERMANENT_IDENTIFIER:
                sampleGraphic.attributes.PERMANENT_IDENTIFIER,
            },
          });
        } else if (
          resFeature &&
          resFeature.attributes.CONTAMVAL < contamGraphic.attributes.CONTAMVAL
        ) {
          resFeature.attributes.CONTAMTYPE =
            contamGraphic.attributes.CONTAMTYPE;
          resFeature.attributes.CONTAMUNIT =
            contamGraphic.attributes.CONTAMUNIT;
          resFeature.attributes.CONTAMVAL = contamGraphic.attributes.CONTAMVAL;
        }
      });
    });

    // perform calculations to update talley in nav bar
    setUpdateContextValues(true);

    let editsCopy = { ...edits };

    // make the contamination map visible in the legend
    if (window.location.search.includes('devMode=true')) {
      contaminationMap.listMode = 'show';
      if (contaminationMap.sketchLayer)
        contaminationMap.sketchLayer.listMode = 'show';
      setContaminationMap((layer) => {
        return {
          ...layer,
          listMode: 'show',
        } as LayerType;
      });

      // find the layer being edited
      const index = layers.findIndex(
        (layer) => layer.layerId === contaminationMap.layerId,
      );

      // update the layers context
      if (index > -1) {
        setLayers((layers) => {
          return [
            ...layers.slice(0, index),
            {
              ...contaminationMap,
              listMode: 'show',
            },
            ...layers.slice(index + 1),
          ];
        });
      }

      // make a copy of the edits context variable
      updateLayerEdits({
        appType,
        edits,
        layer: contaminationMap,
        type: 'properties',
      });
    }

    // save the data to state, use an empty array if there is no data
    if (resFeatures.length > 0) {
      const popupTemplate = new PopupTemplate(
        getPopupTemplate(sketchLayer.layerType, true),
      );

      // loop through the layers and update the contam values
      groupLayer.layers.forEach((graphicsLayer) => {
        if (graphicsLayer.type !== 'graphics') return;

        const tempLayer = graphicsLayer as __esri.GraphicsLayer;
        // update the contam value attribute of the graphics
        tempLayer.graphics.forEach((graphic) => {
          const resFeature = resFeatures.find(
            (feature: any) =>
              graphic.attributes.PERMANENT_IDENTIFIER.toLowerCase()
                .replace('{', '')
                .replace('}', '') ===
              feature.attributes.PERMANENT_IDENTIFIER.toLowerCase()
                .replace('{', '')
                .replace('}', ''),
          );

          // if the graphic was not found in the response, set contam value to null,
          // otherwise use the contam value value found in the response.
          let contamValue = null;
          let contamType = graphic.attributes.CONTAMTYPE;
          let contamUnit = graphic.attributes.CONTAMUNIT;
          if (resFeature) {
            contamValue = resFeature.attributes.CONTAMVAL;
            contamType = resFeature.attributes.CONTAMTYPE;
            contamUnit = resFeature.attributes.CONTAMUNIT;
          }
          graphic.attributes.CONTAMVAL = contamValue;
          graphic.attributes.CONTAMTYPE = contamType;
          graphic.attributes.CONTAMUNIT = contamUnit;
          graphic.popupTemplate = popupTemplate;
        });

        // find the layer
        const layer = layers.find(
          (layer) => layer.layerId === graphicsLayer.id,
        );
        if (!layer) return;

        // update the graphics of the sketch layer
        editsCopy = updateLayerEdits({
          appType,
          edits: editsCopy,
          layer: layer,
          type: 'update',
          changes: tempLayer.graphics,
          hasContaminationRan: true,
        });
      });

      setContaminationResults({
        status: 'success',
        data: resFeatures,
      });
    } else {
      // loop through the layers and update the contam values
      groupLayer.layers.forEach((graphicsLayer) => {
        if (graphicsLayer.type !== 'graphics') return;

        const tempLayer = graphicsLayer as __esri.GraphicsLayer;
        // update the contam value attribute of the graphics
        tempLayer.graphics.forEach((graphic) => {
          graphic.attributes.CONTAMVAL = null;
          graphic.attributes.CONTAMTYPE = null;
          graphic.attributes.CONTAMUNIT = null;
        });

        // find the layer
        const layer = layers.find(
          (layer) => layer.layerId === graphicsLayer.id,
        );
        if (!layer) return;

        // update the graphics of the sketch layer
        editsCopy = updateLayerEdits({
          appType,
          edits: editsCopy,
          layer: layer,
          type: 'update',
          changes: tempLayer.graphics,
          hasContaminationRan: true,
        });
      });

      setContaminationResults({
        status: 'success',
        data: [],
      });
    }

    setEdits(editsCopy);
  }

  // Run calculations when the user exits this tab, by updating
  // the context values.
  useEffect(() => {
    return function cleanup() {
      setUpdateContextValues(true);
    };
  }, [setUpdateContextValues]);

  return (
    <div css={panelContainer}>
      <div>
        <div css={sectionContainer}>
          <h2>Calculate Resources</h2>
          {appType === 'sampling' && (
            <p>
              Default resource constraints are provided to estimate the cost and
              time required to implement the designed plan. You can change the
              default parameters to reflect scenario-specific constraints and to
              support conducting "what-if" scenarios. Click{' '}
              <strong>View Detailed Results</strong> to display a detailed
              summary of the results.{' '}
              {trainingMode && (
                <Fragment>
                  If you have a contamination map layer, click{' '}
                  <strong>View Contamination Hits</strong> to see if any of your
                  samples would have resulted in contamination hits.{' '}
                </Fragment>
              )}
              Click <strong>Next</strong> to configure your output.
            </p>
          )}
          {appType === 'decon' && (
            <p>
              Default resource constraints are provided to estimate the cost and
              time required to implement the designed plan. Click{' '}
              <strong>View Detailed Results</strong> to display a detailed
              summary of the results.
            </p>
          )}
          <p css={layerInfo}>
            <strong>Plan Name: </strong>
            {selectedScenario?.scenarioName}
          </p>
          <p css={layerInfo}>
            <strong>Plan Description: </strong>
            <ShowLessMore
              text={selectedScenario?.scenarioDescription}
              charLimit={20}
            />
          </p>
        </div>

        {appType === 'sampling' && (
          <div css={sectionContainer}>
            <label htmlFor="number-teams-input">
              Number of Available Teams for Sampling
            </label>
            <input
              id="number-teams-input"
              type="text"
              pattern="[0-9]*"
              css={inputStyles}
              value={inputNumSamplingTeams}
              onChange={(ev) => {
                if (ev.target.validity.valid) {
                  setInputNumSamplingTeams(Number(ev.target.value));
                }
              }}
            />

            <label htmlFor="personnel-per-team-input">
              Personnel per Sampling Team
            </label>
            <input
              id="personnel-per-team-input"
              type="text"
              pattern="[0-9]*"
              css={inputStyles}
              value={inputNumSamplingPersonnel}
              onChange={(ev) => {
                if (ev.target.validity.valid) {
                  setInputNumSamplingPersonnel(Number(ev.target.value));
                }
              }}
            />

            <label htmlFor="sampling-hours-input">
              Sampling Team Hours per Shift
            </label>
            <input
              id="sampling-hours-input"
              type="text"
              pattern="[0-9]*"
              css={inputStyles}
              value={inputNumSamplingHours}
              onChange={(ev) => {
                if (ev.target.validity.valid) {
                  setInputNumSamplingHours(Number(ev.target.value));
                }
              }}
            />

            <label htmlFor="shifts-per-input">
              Sampling Team Shifts per Day
            </label>
            <input
              id="shifts-per-input"
              type="text"
              pattern="[0-9]*"
              css={inputStyles}
              value={inputNumSamplingShifts}
              onChange={(ev) => {
                if (ev.target.validity.valid) {
                  setInputNumSamplingShifts(Number(ev.target.value));
                }
              }}
            />

            <label htmlFor="labor-cost-input">
              Sampling Team Labor Cost ($)
            </label>
            <input
              id="labor-cost-input"
              type="text"
              pattern="[0-9]*"
              css={inputStyles}
              value={inputSamplingLaborCost}
              onChange={(ev) => {
                if (ev.target.validity.valid) {
                  setInputSamplingLaborCost(Number(ev.target.value));
                }
              }}
            />

            <label htmlFor="number-of-labs-input">
              Number of Available Labs for Analysis
            </label>
            <input
              id="number-of-labs-input"
              type="text"
              pattern="[0-9]*"
              css={inputStyles}
              value={inputNumLabs}
              onChange={(ev) => {
                if (ev.target.validity.valid) {
                  setInputNumLabs(Number(ev.target.value));
                }
              }}
            />

            <label htmlFor="lab-hours-input">Analysis Lab Hours per Day</label>
            <input
              id="lab-hours-input"
              type="text"
              pattern="[0-9]*"
              css={inputStyles}
              value={inputNumLabHours}
              onChange={(ev) => {
                if (ev.target.validity.valid) {
                  setInputNumLabHours(Number(ev.target.value));
                }
              }}
            />

            <label htmlFor="surface-area-input">
              Area of Interest Surface Area (ft<sup>2</sup>) (optional)
            </label>
            <input
              id="surface-area-input"
              type="text"
              pattern="[0-9]*"
              css={inputStyles}
              value={inputSurfaceArea}
              onChange={(ev) => {
                if (ev.target.validity.valid) {
                  setInputSurfaceArea(Number(ev.target.value));
                }
              }}
            />
          </div>
        )}

        <div css={sectionContainer}>
          <div css={submitButtonContainerStyles}>
            <button
              css={submitButtonStyles}
              onClick={() => {
                if (appType === 'sampling') runCalculation();
                if (appType === 'decon') setResultsOpen(true);
              }}
            >
              View Detailed Results
            </button>
          </div>
          <CalculateResultsPopup
            isOpen={resultsOpen}
            onClose={() => setResultsOpen(false)}
          />
        </div>

        {appType === 'sampling' && trainingMode && (
          <Fragment>
            <div css={sectionContainer}>
              <p>
                <strong>TRAINING MODE</strong>: If you have a contamination
                layer, you can add here and check if your sampling plan captured
                the contamination zone.
              </p>
            </div>
            <AccordionList>
              <AccordionItem title={'Include Contamination Map (Optional)'}>
                <div css={sectionContainer}>
                  <label htmlFor="contamination-map-select-input">
                    Contamination map
                  </label>
                  <div css={inlineMenuStyles}>
                    <Select
                      id="contamination-map-select"
                      inputId="contamination-map-select-input"
                      css={fullWidthSelectStyles}
                      styles={reactSelectStyles as any}
                      value={contaminationMap}
                      onChange={(ev) => setContaminationMap(ev as LayerType)}
                      options={layers.filter(
                        (layer: any) => layer.layerType === 'Contamination Map',
                      )}
                    />
                    <button
                      css={addButtonStyles}
                      onClick={(_ev) => {
                        setGoTo('addData');
                        setGoToOptions({
                          from: 'file',
                          layerType: 'Contamination Map',
                        });
                      }}
                    >
                      Add
                    </button>
                  </div>

                  {contaminationResults.status === 'fetching' && (
                    <LoadingSpinner />
                  )}
                  {contaminationResults.status === 'failure' &&
                    webServiceErrorMessage(contaminationResults.error)}
                  {contaminationResults.status === 'no-map' &&
                    noContaminationMapMessage}
                  {contaminationResults.status === 'no-layer' &&
                    noSampleLayerMessage}
                  {contaminationResults.status === 'no-graphics' &&
                    noSamplesMessage}
                  {contaminationResults.status ===
                    'no-contamination-graphics' &&
                    noContaminationGraphicsMessage}
                  {contaminationResults.status === 'success' &&
                    contaminationResults?.data &&
                    contaminationResults.data.length > -1 &&
                    contaminationHitsSuccessMessage(
                      contaminationResults.data.length,
                    )}

                  <button
                    css={submitButtonStyles}
                    onClick={runContaminationCalculation}
                  >
                    View Contamination Hits
                  </button>
                </div>
              </AccordionItem>
            </AccordionList>
          </Fragment>
        )}
      </div>
      <div css={sectionContainer}>
        <NavigationButton currentPanel="calculate" />
      </div>
    </div>
  );
}

const overlayStyles = css`
  &[data-reach-dialog-overlay] {
    z-index: 100;
    background-color: ${colors.black(0.75)};
  }
`;

const dialogStyles = css`
  color: ${colors.black()};
  background-color: ${colors.white()};
  max-height: 80vh;
  overflow: auto;

  &[data-reach-dialog-content] {
    position: relative;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    padding: 1.5rem;
    width: auto;
    max-width: 90%;
  }

  .ReactTable {
    border: none;
  }

  p,
  li {
    font-size: 0.875rem;
    line-height: 1.375;
  }

  h1 {
    font-size: 117.6471%;
    text-align: center;
  }
  h2 {
    font-size: 100%;
  }
`;

const saveAttributesButtonStyles = css`
  background-color: #0071bc;
  border: 0;
  color: #fff;
  font-weight: bold;
  line-height: 1;
  margin: 0 0.5em 1.5em 0;
  padding: 0.5882em 1.1765em;
  font-size: 16px;
`;

const buttonContainerStyles = css`
  display: flex;
  justify-content: center;
  margin-top: 1rem;
`;

const baseWidth = 97;

type DownloadStatus =
  | 'none'
  | 'fetching'
  | 'success'
  | 'screenshot-failure'
  | 'base64-failure'
  | 'excel-failure'
  | 'no-features';

type CalculateResultsPopupProps = {
  isOpen: boolean;
  onClose: () => void;
};

function CalculateResultsPopup({
  isOpen,
  onClose,
}: CalculateResultsPopupProps) {
  const { calculateResultsDecon, contaminationMap } =
    useContext(CalculateContext);
  const { trainingMode } = useContext(NavigationContext);
  const {
    aoiSketchLayer,
    displayDimensions,
    edits,
    jsonDownload,
    layers,
    map,
    mapView,
    sceneView,
    selectedScenario,
  } = useContext(SketchContext);

  const [tableId] = useState(
    `tots-decon-results-selectionstable-${generateUUID()}`,
  );
  const devMode = window.location.search.includes('devMode=true');

  const [
    downloadStatus,
    setDownloadStatus, //
  ] = useState<DownloadStatus>('none');

  // take the screenshot
  const [
    screenshotInitialized,
    setScreenshotInitialized, //
  ] = useState(false);
  const [
    screenshot,
    setScreenshot, //
  ] = useState<__esri.Screenshot | null>(null);
  useEffect(() => {
    if (screenshotInitialized) return;
    if (!map || !mapView || !sceneView || downloadStatus !== 'fetching') return;
    if (!selectedScenario || selectedScenario.type !== 'scenario-decon') return;

    const view = displayDimensions === '3d' ? sceneView : mapView;

    // save the current extent
    const initialExtent = view.extent;

    const originalVisiblity: { [key: string]: boolean } = {};
    // store current visiblity settings
    map.layers.forEach((layer) => {
      originalVisiblity[layer.id] = layer.visible;
    });

    // adjust the visiblity
    layers.forEach((layer) => {
      if (layer.parentLayer) {
        layer.parentLayer.visible = true;
        return;
      }

      if (
        layer.layerType === 'Contamination Map' &&
        contaminationMap &&
        layer.layerId === contaminationMap.layerId
      ) {
        // This layer matches the selected contamination map.
        // Do nothing, so the visibility is whatever the user has selected
        return;
      }

      if (layer.sketchLayer) layer.sketchLayer.visible = false;
    });

    const linkedAoiCharacterizationIds: string[] = [];
    selectedScenario.linkedLayerIds.forEach((deconId) => {
      const linkedDecon = edits.edits.find(
        (e) => e.type === 'layer-decon' && e.layerId === deconId,
      ) as LayerDeconEditsType | undefined;
      const linkedAoi = edits.edits.find(
        (e) =>
          e.type === 'layer-aoi-analysis' &&
          e.layerId === linkedDecon?.analysisLayerId,
      );
      if (!linkedAoi) return;

      linkedAoiCharacterizationIds.push(linkedAoi.layerId);
    });

    // get the sample layers for the selected scenario
    const aoiLayers = layers.filter(
      (layer) =>
        layer.parentLayer &&
        linkedAoiCharacterizationIds.includes(layer.parentLayer?.id),
    );

    // zoom to the graphics for the active layers
    const zoomGraphics = getGraphicsArray([
      ...aoiLayers,
      contaminationMap?.visible ? contaminationMap : null,
    ]);
    if (zoomGraphics.length > 0) {
      view.goTo(zoomGraphics, { animate: false }).then(() => {
        // allow some time for the layers to load in prior to taking the screenshot
        setTimeout(() => {
          view
            .takeScreenshot()
            .then((data) => {
              setScreenshot(data);

              // zoom back to the initial extent
              view.goTo(initialExtent, { animate: false });

              // set the visiblity back
              map.layers.forEach((layer) => {
                layer.visible = originalVisiblity[layer.id];
              });
            })
            .catch((err) => {
              console.error(err);
              setDownloadStatus('screenshot-failure');

              // zoom back to the initial extent
              view.goTo(initialExtent, { animate: false });

              // set the visiblity back
              map.layers.forEach((layer) => {
                layer.visible = originalVisiblity[layer.id];
              });

              window.logErrorToGa(err);
            });
        }, 3000);
      });
    }

    setScreenshotInitialized(true);
  }, [
    aoiSketchLayer,
    contaminationMap,
    displayDimensions,
    downloadStatus,
    edits,
    layers,
    map,
    mapView,
    sceneView,
    screenshotInitialized,
    selectedScenario,
  ]);

  // convert the screenshot to base64
  const [base64Initialized, setBase64Initialized] = useState(false);
  const [base64Screenshot, setBase64Screenshot] = useState({
    image: '',
    height: 0,
    width: 0,
  });
  useEffect(() => {
    if (base64Initialized) return;
    if (downloadStatus !== 'fetching' || !screenshot) return;

    let canvas: any = document.createElement('CANVAS');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onerror = function () {
      setDownloadStatus('base64-failure');
    };
    img.oninvalid = function () {
      setDownloadStatus('base64-failure');
    };
    img.onload = function () {
      // draw the img on a canvas
      canvas.height = img.height;
      canvas.width = img.width;
      ctx.drawImage(img, 0, 0);

      // get the data url
      const url = canvas.toDataURL('image/jpeg');
      if (url) {
        setBase64Screenshot({
          image: url,
          height: img.height,
          width: img.width,
        });
      } else {
        setDownloadStatus('base64-failure');
      }

      // Clean up
      canvas = null;
    };
    img.src = screenshot.dataUrl;

    setBase64Initialized(true);
  }, [screenshot, downloadStatus, base64Initialized]);

  // export the excel doc
  useEffect(() => {
    if (
      downloadStatus !== 'fetching' ||
      !base64Screenshot.image ||
      calculateResultsDecon.status !== 'success' ||
      !calculateResultsDecon.data ||
      !selectedScenario ||
      selectedScenario.type !== 'scenario-decon'
    ) {
      return;
    }

    const workbook = new ExcelJS.Workbook();

    // create the styles
    const defaultFont = { name: 'Calibri', size: 12 };
    const sheetTitleFont = { name: 'Calibri', bold: true, size: 18 };
    const columnTitleAlignment: any = { horizontal: 'center' };
    const rightAlignment: any = { horizontal: 'right' };
    const labelFont = { name: 'Calibri', bold: true, size: 12 };
    const underlinedLabelFont = {
      name: 'Calibri',
      bold: true,
      underline: true,
      size: 12,
    };
    const currencyNumberFormat = '$#,##0.00; ($#,##.00); -';

    // create the sheets
    addSummarySheet();
    addLayerSummarySheet();
    addSampleSheet();

    // download the file
    workbook.xlsx
      .writeBuffer()
      .then((buffer: any) => {
        saveAs(
          new Blob([buffer]),
          `tods_${selectedScenario.scenarioName}.xlsx`,
        );
        setDownloadStatus('success');
      })
      .catch((err: any) => {
        console.error(err);
        setDownloadStatus('excel-failure');

        window.logErrorToGa(err);
      });

    // --- functions for creating the content for each sheet ---

    function addSummarySheet() {
      // only here to satisfy typescript
      if (!selectedScenario) return;
      if (!calculateResultsDecon.data) return;

      // add the sheet
      const summarySheet = workbook.addWorksheet('Summary');

      // setup column widths
      summarySheet.columns = [
        { width: 30 },
        { width: 40 },
        { width: 39 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 51 },
        { width: 59 },
      ];

      // add the header
      summarySheet.getCell(1, 1).font = sheetTitleFont;
      summarySheet.getCell(1, 1).value =
        'Trade-off Tool for Decontamination Strategies (TODS) Summary';
      summarySheet.getCell(2, 1).font = defaultFont;
      summarySheet.getCell(2, 1).value = 'Version: 0.2.0 - pre-alpha';
      summarySheet.getCell(4, 1).font = underlinedLabelFont;
      summarySheet.getCell(4, 1).value = 'Plan Name';
      summarySheet.getCell(4, 2).font = defaultFont;
      summarySheet.getCell(4, 2).value = selectedScenario.scenarioName;
      summarySheet.getCell(5, 1).font = underlinedLabelFont;
      summarySheet.getCell(5, 1).value = 'Plan Description';
      summarySheet.getCell(5, 2).font = defaultFont;
      summarySheet.getCell(5, 2).value = selectedScenario.scenarioDescription;

      summarySheet.mergeCells(7, 1, 7, 2);
      summarySheet.getCell(7, 1).alignment = columnTitleAlignment;
      summarySheet.getCell(7, 1).font = underlinedLabelFont;
      summarySheet.getCell(7, 1).value = 'Cost / Time / Waste';
      summarySheet.getCell(8, 1).font = labelFont;
      summarySheet.getCell(8, 1).value = 'Total Cost';
      summarySheet.getCell(8, 2).font = defaultFont;
      summarySheet.getCell(8, 2).alignment = rightAlignment;
      summarySheet.getCell(8, 2).numFmt = currencyNumberFormat;
      summarySheet.getCell(8, 2).value =
        calculateResultsDecon.data['TOTAL_COST'];
      summarySheet.getCell(9, 1).font = labelFont;
      summarySheet.getCell(9, 1).value = 'Max Time day(s)';
      summarySheet.getCell(9, 2).font = defaultFont;
      summarySheet.getCell(9, 2).alignment = rightAlignment;
      summarySheet.getCell(9, 2).value =
        calculateResultsDecon.data['TOTAL_TIME'].toLocaleString();
      summarySheet.getCell(10, 1).font = labelFont;
      summarySheet.getCell(10, 1).value = 'Total Waste Volume (m³)';
      summarySheet.getCell(10, 2).font = defaultFont;
      summarySheet.getCell(10, 2).alignment = rightAlignment;
      summarySheet.getCell(10, 2).value = Math.round(
        calculateResultsDecon.data['WASTE_VOLUME_SOLID'],
      ).toLocaleString();
      summarySheet.getCell(11, 1).font = labelFont;
      summarySheet.getCell(11, 1).value = 'Total Waste Mass (kg)';
      summarySheet.getCell(11, 2).font = defaultFont;
      summarySheet.getCell(11, 2).alignment = rightAlignment;
      summarySheet.getCell(11, 2).value = Math.round(
        calculateResultsDecon.data['WASTE_WEIGHT_SOLID'],
      ).toLocaleString();

      summarySheet.mergeCells(14, 3, 14, 4);
      summarySheet.getCell(14, 3).alignment = columnTitleAlignment;
      summarySheet.getCell(14, 3).font = labelFont;
      summarySheet.getCell(14, 3).value = 'Decontamination Waste Generation';

      const cols = [
        { label: 'Contamination Scenario', fieldName: 'contaminationScenario' },
        {
          label: 'Selected Decontamination Technology',
          fieldName: 'decontaminationTechnology',
        },
        {
          label: 'Solid Waste (m³)',
          fieldName: 'solidWasteVolumeM3',
          format: 'number',
        },
        {
          label: 'Liquid Waste (m³)',
          fieldName: 'liquidWasteVolumeM3',
          format: 'number',
        },
        {
          label: 'Decontamination Cost ($) [Setup and Operational]',
          fieldName: 'decontaminationCost',
          format: 'currency',
        },
        {
          label: 'Decontamination Time (days) [Application and Residence]',
          fieldName: 'decontaminationTimeDays',
          format: 'number',
        },
      ];

      if (devMode && trainingMode) {
        cols.push({
          label: 'Average Initial Contamination (CFUs/m²)',
          fieldName: 'averageInitialContamination',
          format: 'number',
        });
        cols.push({
          label: 'Average Final Contamination (CFUs/m²)',
          fieldName: 'averageFinalContamination',
          format: 'number',
        });
        cols.push({
          label: 'Above/Below Detection Limit',
          fieldName: 'aboveDetectionLimit',
        });
      }

      let curRow = 15;
      curRow = fillOutCells({
        sheet: summarySheet,
        startRow: curRow,
        rows: [
          [
            ...cols.map((col) => {
              return {
                value: col.label,
                font: labelFont,
              };
            }),
          ],
        ],
      });

      const rows: Row[] = [];
      jsonDownload.forEach((item) => {
        rows.push(
          cols.map((col) => {
            const fieldValue = (item as any)[col.fieldName];
            const value =
              col.fieldName === 'aboveDetectionLimit'
                ? fieldValue
                  ? 'Above'
                  : 'Below'
                : fieldValue;
            return {
              value:
                col.format && ['currency', 'number'].includes(col.format)
                  ? (parseSmallFloat(value, 2) ?? '').toLocaleString()
                  : value,
              numFmt:
                col.format === 'currency' ? currencyNumberFormat : undefined,
            };
          }),
        );
      });

      curRow = fillOutCells({
        sheet: summarySheet,
        rows,
        startRow: curRow,
      });

      // add the map screenshot
      const screenshotImageId = workbook.addImage({
        base64: base64Screenshot.image,
        extension: 'jpeg',
      });
      summarySheet.addImage(screenshotImageId, {
        tl: { col: 1, row: curRow + 1 },
        ext: { width: base64Screenshot.width, height: base64Screenshot.height },
      });
    }

    function addLayerSummarySheet() {
      // only here to satisfy typescript
      if (
        !calculateResultsDecon.data ||
        !selectedScenario ||
        selectedScenario.type !== 'scenario-decon'
      )
        return;

      // add the sheet
      const summarySheet = workbook.addWorksheet('Layer Summaries');

      // add the header
      summarySheet.getCell(1, 1).font = sheetTitleFont;
      summarySheet.getCell(1, 1).value = 'Layer Summaries';

      // setup column widths
      summarySheet.columns = [
        { width: 30 },
        { width: 40 },
        { width: 39 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 51 },
        { width: 59 },
      ];

      const cols = [
        { label: 'Contamination Scenario', fieldName: 'contaminationScenario' },
        {
          label: 'Selected Decontamination Technology',
          fieldName: 'decontaminationTechnology',
        },
        {
          label: 'Solid Waste (m³)',
          fieldName: 'solidWasteVolumeM3',
          format: 'number',
        },
        {
          label: 'Liquid Waste (m³)',
          fieldName: 'liquidWasteVolumeM3',
          format: 'number',
        },
        {
          label: 'Decontamination Cost ($) [Setup and Operational]',
          fieldName: 'decontaminationCost',
          format: 'currency',
        },
        {
          label: 'Decontamination Time (days) [Application and Residence]',
          fieldName: 'decontaminationTimeDays',
          format: 'number',
        },
      ];

      if (devMode && trainingMode) {
        cols.push({
          label: 'Average Initial Contamination (CFUs/m²)',
          fieldName: 'averageInitialContamination',
          format: 'number',
        });
        cols.push({
          label: 'Average Final Contamination (CFUs/m²)',
          fieldName: 'averageFinalContamination',
          format: 'number',
        });
        cols.push({
          label: 'Above/Below Detection Limit',
          fieldName: 'aboveDetectionLimit',
        });
      }

      let curRow = 3;
      selectedScenario.linkedLayerIds.forEach((deconOpId) => {
        const deconOp = edits.edits.find(
          (e) => e.type === 'layer-decon' && e.layerId === deconOpId,
        );
        if (!deconOp || deconOp.type !== 'layer-decon') return;

        summarySheet.getCell(curRow, 1).value = {
          richText: [
            { text: 'Decon Operation:', font: underlinedLabelFont },
            { text: ` ${deconOp.label}`, font: defaultFont },
          ],
        };
        curRow += 1;

        curRow = fillOutCells({
          sheet: summarySheet,
          startRow: curRow,
          rows: [
            [
              ...cols.map((col) => {
                return {
                  value: col.label,
                  font: labelFont,
                };
              }),
            ],
          ],
        });

        const rows: Row[] = [];
        deconOp.deconLayerResults?.resultsTable.forEach((item) => {
          rows.push(
            cols.map((col) => {
              const fieldValue = (item as any)[col.fieldName];
              const value =
                col.fieldName === 'aboveDetectionLimit'
                  ? fieldValue
                    ? 'Above'
                    : 'Below'
                  : fieldValue;
              return {
                value:
                  col.format && ['currency', 'number'].includes(col.format)
                    ? (parseSmallFloat(value, 2) ?? '').toLocaleString()
                    : value,
                numFmt:
                  col.format === 'currency' ? currencyNumberFormat : undefined,
              };
            }),
          );
        });

        curRow = fillOutCells({
          sheet: summarySheet,
          rows,
          startRow: curRow,
        });

        curRow += 2;
      });
    }

    function addSampleSheet() {
      if (!selectedScenario || selectedScenario.type !== 'scenario-decon')
        return;

      // add the sheet
      const summarySheet = workbook.addWorksheet('Building Data');

      // add the header
      summarySheet.getCell(1, 1).font = sheetTitleFont;
      summarySheet.getCell(1, 1).value = 'Building Data';

      const cols = [
        { label: 'Layer', fieldName: 'layerName' },
        { label: 'Building ID', fieldName: 'BUILD_ID' },
        { label: 'Building Occupancy Classification', fieldName: 'OCC_CLS' },
        { label: 'Primary Occupancy', fieldName: 'PRIM_OCC' },
        { label: 'Secondary Occupancy', fieldName: 'SEC_OCC' },
        { label: 'Object ID', fieldName: 'OBJECTID' },
        { label: 'UUID', fieldName: 'UUID' },
        { label: 'Address', fieldName: 'PROP_ADDR' },
        { label: 'City', fieldName: 'PROP_CITY' },
        { label: 'State', fieldName: 'PROP_ST' },
        { label: 'ZIP Code', fieldName: 'PROP_ZIP' },
        { label: 'Outbuilding or Non-Primary Structure', fieldName: 'OUTBLDG' },
        { label: 'Height (meters)', fieldName: 'HEIGHT', format: 'number' },
        { label: 'Square Meters', fieldName: 'SQMETERS', format: 'number' },
        { label: 'Square Feet', fieldName: 'SQFEET', format: 'number' },
        {
          label: 'Highest Ground Elevation (meters)',
          fieldName: 'H_ADJ_ELEV',
          format: 'number',
        },
        {
          label: 'Lowest Ground Elevation (meters)',
          fieldName: 'L_ADJ_ELEV',
          format: 'number',
        },
        { label: 'County FIPS', fieldName: 'FIPS' },
        { label: 'Census Tract Identifier', fieldName: 'CENSUSCODE' },
        { label: 'Production Date', fieldName: 'PROD_DATE' },
        { label: 'SOURCE', fieldName: 'Source' },
        { label: 'USNG Coordinates', fieldName: 'USNG' },
        { label: 'Longitude', fieldName: 'LONGITUDE' },
        { label: 'Latitude', fieldName: 'LATITUDE' },
        { label: 'Image Name', fieldName: 'IMAGE_NAME' },
        { label: 'Image Date', fieldName: 'IMAGE_DATE' },
        {
          label: 'Building Outline Validation Methodology',
          fieldName: 'VAL_METHOD',
        },
        { label: 'Remarks', fieldName: 'REMARKS' },
        { label: 'State FIPS', fieldName: 'STATE_FIPS' },
        {
          label: 'Footprint Area (square meters)',
          fieldName: 'footprintSqM',
          format: 'number',
        },
        {
          label: 'Floors Area (square meters)',
          fieldName: 'floorsSqM',
          format: 'number',
        },
        {
          label: 'Total Area (square meters)',
          fieldName: 'totalSqM',
          format: 'number',
        },
        {
          label: 'Ext Walls Area (square meters)',
          fieldName: 'extWallsSqM',
          format: 'number',
        },
        {
          label: 'Int Walls Area (square meters)',
          fieldName: 'intWallsSqM',
          format: 'number',
        },
        {
          label: 'Roof Area (square meters)',
          fieldName: 'roofSqM',
          format: 'number',
        },
        {
          label: 'Footprint Area (square feet)',
          fieldName: 'footprintSqFt',
          format: 'number',
        },
        {
          label: 'Floors Area (square feet)',
          fieldName: 'floorsSqFt',
          format: 'number',
        },
        {
          label: 'Total Area (square feet)',
          fieldName: 'totalSqFt',
          format: 'number',
        },
        {
          label: 'Ext Walls Area (square feet)',
          fieldName: 'extWallsSqFt',
          format: 'number',
        },
        {
          label: 'Int Walls Area (square feet)',
          fieldName: 'intWallsSqFt',
          format: 'number',
        },
        {
          label: 'Roof Area (square feet)',
          fieldName: 'roofSqFt',
          format: 'number',
        },
      ];

      if (devMode && trainingMode) {
        cols.push({ label: 'Contamination Type', fieldName: 'CONTAMTYPE' });
        cols.push({
          label: 'Activity (Initial)',
          fieldName: 'CONTAMVALINITIAL',
        });
        cols.push({ label: 'Activity (Final)', fieldName: 'CONTAMVAL' });
        cols.push({ label: 'Unit of Measure', fieldName: 'CONTAMUNIT' });
      }

      let curRow = 3;
      curRow = fillOutCells({
        sheet: summarySheet,
        startRow: curRow,
        rows: [
          [
            ...cols.map((col) => {
              return {
                value: col.label,
                font: labelFont,
              };
            }),
          ],
        ],
      });

      const graphics: __esri.Graphic[] = [];
      selectedScenario.linkedLayerIds.forEach((deconOpId) => {
        const deconOp = edits.edits.find(
          (e) => e.type === 'layer-decon' && e.layerId === deconOpId,
        ) as LayerDeconEditsType | undefined;
        const layer = edits.edits.find(
          (e) =>
            e.type === 'layer-aoi-analysis' &&
            e.layerId === deconOp?.analysisLayerId,
        );
        if (!layer || layer.type !== 'layer-aoi-analysis') return;

        const aoiAssessed = layer.layers.find(
          (l) => l.layerType === 'AOI Assessed',
        );
        const aoiAssessedLayer = layers.find(
          (l) =>
            l.layerType === 'AOI Assessed' &&
            l.layerId === aoiAssessed?.layerId,
        );
        if (!aoiAssessedLayer) return;

        (aoiAssessedLayer.sketchLayer as __esri.GraphicsLayer).graphics.forEach(
          (graphic) => {
            graphic.attributes.layerName =
              aoiAssessedLayer.parentLayer?.title ?? aoiAssessedLayer.label;
            graphics.push(graphic);
          },
        );
      });

      if (graphics.length === 0) return;

      const rows: Row[] = [];
      graphics.forEach((graphic) => {
        rows.push(
          cols.map((col) => {
            const fieldValue = graphic.attributes[col.fieldName];
            return {
              value:
                col.format && ['currency', 'number'].includes(col.format)
                  ? (parseSmallFloat(fieldValue, 2) ?? '').toLocaleString()
                  : fieldValue,
              numFmt:
                col.format === 'currency' ? currencyNumberFormat : undefined,
            };
          }),
        );
      });

      fillOutCells({
        sheet: summarySheet,
        rows,
        startRow: curRow,
      });
    }

    function fillOutCells({
      sheet,
      rows,
      startRow = 1,
    }: {
      sheet: ExcelJS.Worksheet;
      rows: Row[];
      startRow?: number;
    }) {
      let rowIdx = startRow;
      rows.forEach((rowData, index) => {
        if (index !== 0) rowIdx += 1;
        rowData.forEach((cellData, cellIdx) => {
          const cell = sheet.getCell(rowIdx, cellIdx + 1);
          cell.value = cellData.value;
          cell.font = cellData.font ?? defaultFont;
          if (cellData.alignment) cell.alignment = cellData.alignment;
          if (cellData.numFmt) cell.numFmt = cellData.numFmt;
        });
      });

      return rowIdx + 1;
    }
  }, [
    base64Screenshot,
    calculateResultsDecon,
    devMode,
    downloadStatus,
    edits,
    jsonDownload,
    layers,
    map,
    selectedScenario,
    trainingMode,
  ]);

  let totalSolidWasteVolume = 0;
  let totalLiquidWasteVolume = 0;
  let totalDeconCost = 0;
  let totalDeconTime = 0;
  let totalInitialContamination = 0;
  let totalFinalContamination = 0;
  const tableData =
    jsonDownload?.map((d) => {
      totalSolidWasteVolume += parseSmallFloat(d.solidWasteVolumeM3, 0);
      totalLiquidWasteVolume += parseSmallFloat(d.liquidWasteVolumeM3, 0);
      totalDeconCost += parseSmallFloat(d.decontaminationCost, 2);
      totalDeconTime += parseSmallFloat(d.decontaminationTimeDays, 1);
      totalInitialContamination += parseSmallFloat(
        d.averageInitialContamination,
        0,
      );
      totalFinalContamination += parseSmallFloat(
        d.averageFinalContamination,
        2,
      );
      return {
        ...d,
        solidWasteVolumeM3: formatNumber(d.solidWasteVolumeM3),
        liquidWasteVolumeM3: formatNumber(d.liquidWasteVolumeM3),
        decontaminationCost: formatNumber(d.decontaminationCost, 2),
        decontaminationTimeDays: formatNumber(d.decontaminationTimeDays, 1),
        averageInitialContamination: formatNumber(
          d.averageInitialContamination,
        ),
        averageFinalContamination: formatNumber(d.averageFinalContamination, 2),
        aboveDetectionLimit: d.aboveDetectionLimit ? 'Above' : 'Below',
      };
    }) ?? [];
  tableData.push({
    contaminationScenario: 'TOTALS',
    decontaminationTechnology: '',
    solidWasteVolumeM3: formatNumber(totalSolidWasteVolume, -1),
    liquidWasteVolumeM3: formatNumber(totalLiquidWasteVolume, -1),
    decontaminationCost: formatNumber(totalDeconCost, -1),
    decontaminationTimeDays: formatNumber(totalDeconTime, -1),
    averageInitialContamination: formatNumber(totalInitialContamination, -1),
    averageFinalContamination: formatNumber(totalFinalContamination, -1),
    aboveDetectionLimit: '',
  });

  const contamMapUpdated = map?.layers.find(
    (l) => l.id === 'contaminationMapUpdated',
  );

  let linkedDeconOps: LayerDeconEditsType[] = [];
  if (selectedScenario?.type === 'scenario-decon') {
    linkedDeconOps = edits.edits.filter(
      (e) =>
        e.type === 'layer-decon' &&
        selectedScenario.linkedLayerIds.includes(e.layerId),
    ) as LayerDeconEditsType[];
  }

  return (
    <DialogOverlay
      css={overlayStyles}
      isOpen={isOpen}
      data-testid="tots-getting-started"
    >
      <DialogContent css={dialogStyles} aria-label="Edit Attribute">
        <h1>Decon Resource Demand Summary</h1>

        {calculateResultsDecon.status === 'failure' && generalError}
        {calculateResultsDecon.status === 'success' &&
          calculateResultsDecon.data && (
            <div css={resourceTallyContainerStyles}>
              <div>
                <div>
                  <strong>Total Cost:</strong> $
                  {Math.round(
                    calculateResultsDecon.data['TOTAL_COST'],
                  ).toLocaleString()}
                </div>
                <div>
                  <strong>Max Time day(s):</strong>{' '}
                  {calculateResultsDecon.data['TOTAL_TIME'].toLocaleString()}
                </div>
                <div>
                  <strong>
                    Total Waste Volume (m<sup>3</sup>):
                  </strong>{' '}
                  {Math.round(
                    calculateResultsDecon.data['WASTE_VOLUME_SOLID'],
                  ).toLocaleString()}
                </div>
                <div>
                  <strong>Total Waste Mass (kg):</strong>{' '}
                  {Math.round(
                    calculateResultsDecon.data['WASTE_WEIGHT_SOLID'],
                  ).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        <br />

        <h2>{selectedScenario?.scenarioName} Overall Summary</h2>
        <ReactTableEditable
          id={tableId}
          data={tableData}
          idColumn={'contaminationScenario'}
          striped={true}
          height={-1}
          getColumns={(_tableWidth: any) => {
            return [
              {
                Header: 'Contamination Scenario',
                accessor: 'contaminationScenario',
                width: 190,
              },
              {
                Header: 'Selected Decontamination Technology',
                accessor: 'decontaminationTechnology',
                width: 190,
              },
              {
                Header: 'Solid Waste (m³)',
                accessor: 'solidWasteVolumeM3',
                width: baseWidth,
              },
              {
                Header: 'Liquid Waste (m³)',
                accessor: 'liquidWasteVolumeM3',
                width: baseWidth,
              },
              {
                Header: 'Decontamination Cost ($) [Setup and Operational]',
                accessor: 'decontaminationCost',
                width: 175,
              },
              {
                Header:
                  'Decontamination Time (days) [Application and Residence]',
                accessor: 'decontaminationTimeDays',
                width: 170,
              },
              {
                Header: 'Average Initial Contamination (CFUs/m²)',
                accessor: 'averageInitialContamination',
                width: 110,
                show: devMode && trainingMode,
              },
              {
                Header: 'Average Final Contamination (CFUs/m²)',
                accessor: 'averageFinalContamination',
                width: 110,
                show: devMode && trainingMode,
              },
              {
                Header: 'Above/Below Detection Limit',
                accessor: 'aboveDetectionLimit',
                width: 110,
                show: devMode && trainingMode,
              },
            ];
          }}
        />

        {linkedDeconOps.map((layer, index) => {
          let totalSolidWasteVolume = 0;
          let totalLiquidWasteVolume = 0;
          let totalDeconCost = 0;
          let totalDeconTime = 0;
          let totalInitialContamination = 0;
          let totalFinalContamination = 0;

          const tableData =
            layer.deconLayerResults?.resultsTable.map((d) => {
              totalSolidWasteVolume += parseSmallFloat(d.solidWasteVolumeM3, 0);
              totalLiquidWasteVolume += parseSmallFloat(
                d.liquidWasteVolumeM3,
                0,
              );
              totalDeconCost += parseSmallFloat(d.decontaminationCost, 2);
              totalDeconTime += parseSmallFloat(d.decontaminationTimeDays, 1);
              totalInitialContamination += parseSmallFloat(
                d.averageInitialContamination,
                0,
              );
              totalFinalContamination += parseSmallFloat(
                d.averageFinalContamination,
                2,
              );
              return {
                ...d,
                solidWasteVolumeM3: formatNumber(d.solidWasteVolumeM3),
                liquidWasteVolumeM3: formatNumber(d.liquidWasteVolumeM3),
                decontaminationCost: formatNumber(d.decontaminationCost, 2),
                decontaminationTimeDays: formatNumber(
                  d.decontaminationTimeDays,
                  1,
                ),
                averageInitialContamination: formatNumber(
                  d.averageInitialContamination,
                ),
                averageFinalContamination: formatNumber(
                  d.averageFinalContamination,
                  2,
                ),
                aboveDetectionLimit: d.aboveDetectionLimit ? 'Above' : 'Below',
              };
            }) ?? [];
          tableData.push({
            contaminationScenario: 'TOTALS',
            decontaminationTechnology: '',
            solidWasteVolumeM3: formatNumber(totalSolidWasteVolume, -1),
            liquidWasteVolumeM3: formatNumber(totalLiquidWasteVolume, -1),
            decontaminationCost: formatNumber(totalDeconCost, -1),
            decontaminationTimeDays: formatNumber(totalDeconTime, -1),
            averageInitialContamination: formatNumber(
              totalInitialContamination,
              -1,
            ),
            averageFinalContamination: formatNumber(
              totalFinalContamination,
              -1,
            ),
            aboveDetectionLimit: '',
          });

          return (
            <Fragment key={index}>
              <h2>{layer.label} Summary</h2>

              <ReactTableEditable
                id={tableId + index}
                data={tableData}
                idColumn={'contaminationScenario'}
                striped={true}
                height={-1}
                getColumns={(_tableWidth: any) => {
                  return [
                    {
                      Header: 'Contamination Scenario',
                      accessor: 'contaminationScenario',
                      width: 190,
                    },
                    {
                      Header: 'Selected Decontamination Technology',
                      accessor: 'decontaminationTechnology',
                      width: 190,
                    },
                    {
                      Header: 'Solid Waste (m³)',
                      accessor: 'solidWasteVolumeM3',
                      width: baseWidth,
                    },
                    {
                      Header: 'Liquid Waste (m³)',
                      accessor: 'liquidWasteVolumeM3',
                      width: baseWidth,
                    },
                    {
                      Header:
                        'Decontamination Cost ($) [Setup and Operational]',
                      accessor: 'decontaminationCost',
                      width: 175,
                    },
                    {
                      Header:
                        'Decontamination Time (days) [Application and Residence]',
                      accessor: 'decontaminationTimeDays',
                      width: 170,
                    },
                    {
                      Header: 'Average Initial Contamination (CFUs/m²)',
                      accessor: 'averageInitialContamination',
                      width: 110,
                      show: devMode && trainingMode,
                    },
                    {
                      Header: 'Average Final Contamination (CFUs/m²)',
                      accessor: 'averageFinalContamination',
                      width: 110,
                      show: devMode && trainingMode,
                    },
                    {
                      Header: 'Above/Below Detection Limit',
                      accessor: 'aboveDetectionLimit',
                      width: 110,
                      show: devMode && trainingMode,
                    },
                  ];
                }}
              />
            </Fragment>
          );
        })}

        {downloadStatus === 'fetching' && <LoadingSpinner />}
        {downloadStatus === 'screenshot-failure' && screenshotFailureMessage}
        {downloadStatus === 'base64-failure' && base64FailureMessage}
        {downloadStatus === 'excel-failure' && excelFailureMessage}
        {downloadStatus === 'no-features' && noFeaturesMessage}
        {downloadStatus === 'success' && downloadSuccessMessage}

        <div css={buttonContainerStyles}>
          <button
            css={saveAttributesButtonStyles}
            onClick={() => {
              // reset everything so the download happens
              setDownloadStatus('fetching');
              setScreenshotInitialized(false);
              setScreenshot(null);
              setBase64Initialized(false);
              setBase64Screenshot({
                image: '',
                height: 0,
                width: 0,
              });
            }}
          >
            Download Summary Data
          </button>
          <DownloadIWasteData />
          {trainingMode && contamMapUpdated && (
            <button
              css={saveAttributesButtonStyles}
              onClick={async () => {
                setDownloadStatus('fetching');
                const contaminationLayer =
                  contamMapUpdated as __esri.GraphicsLayer;

                const graphics = contaminationLayer.graphics
                  .map((g) => {
                    removeZValues(g);
                    return g;
                  })
                  .toArray();

                if (graphics.length === 0) {
                  setDownloadStatus('no-features');
                  return;
                }

                const contamMapSet = new FeatureSet({
                  displayFieldName: '',
                  geometryType: 'polygon',
                  features: graphics,
                  spatialReference: {
                    wkid: 3857,
                  },
                  fields: [
                    {
                      name: 'OBJECTID',
                      type: 'oid',
                      alias: 'OBJECTID',
                    },
                    {
                      name: 'GLOBALID',
                      type: 'guid',
                      alias: 'GlobalID',
                    },
                    {
                      name: 'PERMANENT_IDENTIFIER',
                      type: 'guid',
                      alias: 'Permanent Identifier',
                    },
                    {
                      name: 'CONTAMTYPE',
                      type: 'string',
                      alias: 'Contamination Type',
                    },
                    {
                      name: 'CONTAMVAL',
                      type: 'double',
                      alias: 'Contamination Value',
                    },
                    {
                      name: 'EXTWALLS',
                      type: 'double',
                      alias: 'Contamination Value Exterior Walls',
                    },
                    {
                      name: 'INTWALLS',
                      type: 'double',
                      alias: 'Contamination Value Interior Walls',
                    },
                    {
                      name: 'FLOORS',
                      type: 'double',
                      alias: 'Contamination Value Floors',
                    },
                    {
                      name: 'ROOFS',
                      type: 'double',
                      alias: 'Contamination Value Roofs',
                    },
                    {
                      name: 'CONTAMUNIT',
                      type: 'string',
                      alias: 'Contamination Unit',
                    },
                    {
                      name: 'Notes',
                      type: 'string',
                      alias: 'Notes',
                    },
                  ],
                });

                // call the GP Server
                const params = {
                  f: 'json',
                  Feature_Set: contamMapSet,
                };
                appendEnvironmentObjectParam(params);

                const response = await geoprocessorFetch({
                  url: `https://ags.erg.com/arcgis/rest/services/ORD/ExportShape/GPServer/ExportShape`,
                  inputParameters: params,
                });

                saveAs(
                  response.results[0].value.url,
                  `tods_${selectedScenario?.scenarioName}_updated_contamination.zip`,
                );

                setDownloadStatus('success');
              }}
            >
              Download Contamination Map
            </button>
          )}
          <button
            css={saveAttributesButtonStyles}
            onClick={() => {
              onClose();
            }}
          >
            Close
          </button>
        </div>
      </DialogContent>
    </DialogOverlay>
  );
}

type DownloadIWasteProps = {
  isSubmitStyle?: boolean;
};

function DownloadIWasteData({ isSubmitStyle = false }: DownloadIWasteProps) {
  const { jsonDownload, selectedScenario } = useContext(SketchContext);
  return (
    <button
      css={isSubmitStyle ? submitButtonStyles : saveAttributesButtonStyles}
      onClick={() => {
        if (!selectedScenario) return;
        const fileName = `tods_${selectedScenario.scenarioName}.json`;

        const newJsonDownload = jsonDownload.map((j) => {
          const newJ = { ...j } as any;
          delete newJ.aboveDetectionLimit;
          delete newJ.averageInitialContamination;
          delete newJ.averageFinalContamination;

          return newJ;
        });

        // Create a blob of the data
        const fileToSave = new Blob([JSON.stringify(newJsonDownload)], {
          type: 'application/json',
        });

        // Save the file
        saveAs(fileToSave, fileName);
      }}
    >
      Download Data for Waste Planning
    </button>
  );
}

export default Calculate;

const resourceTallyContainerStyles = css`
  display: flex;
  justify-content: space-around;
`;
