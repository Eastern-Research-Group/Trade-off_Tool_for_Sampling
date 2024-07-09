/** @jsxImportSource @emotion/react */

import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { css } from '@emotion/react';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import PopupTemplate from '@arcgis/core/PopupTemplate';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import LoadingSpinner from 'components/LoadingSpinner';
import Select from 'components/Select';
import ShowLessMore from 'components/ShowLessMore';
import NavigationButton from 'components/NavigationButton';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
// config
import {
  contaminationHitsSuccessMessage,
  noContaminationGraphicsMessage,
  noContaminationMapMessage,
  noSampleLayerMessage,
  noSamplesMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
// utils
import { CalculateResultsType } from 'types/CalculateResults';
import { useDynamicPopup } from 'utils/hooks';
import { removeZValues, updateLayerEdits } from 'utils/sketchUtils';
// styles
import { reactSelectStyles } from 'styles';

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
function Calculate() {
  const { setGoTo, setGoToOptions, trainingMode } =
    useContext(NavigationContext);
  const {
    edits,
    setEdits,
    layers,
    setLayers,
    map,
    sketchLayer,
    selectedScenario,
  } = useContext(SketchContext);
  const {
    calculateResults,
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

  const getPopupTemplate = useDynamicPopup();

  // sync the inputs with settings pulled from AGO
  const [pageInitialized, setPageInitialized] = useState(false);
  useEffect(() => {
    if (!selectedScenario || pageInitialized) return;
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
    setCalculateResults((calculateResults: CalculateResultsType) => {
      return {
        ...calculateResults,
        panelOpen: false,
      };
    });
  }, [setCalculateResults]);

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

    // set no scenario status
    if (!selectedScenario) {
      setCalculateResults({
        status: 'no-scenario',
        panelOpen: true,
        data: null,
      });
      return;
    }

    // set the no layer status
    if (selectedScenario.layers.length === 0) {
      setCalculateResults({ status: 'no-layer', panelOpen: true, data: null });
      return;
    }

    const { graphics } = getGraphics(map, selectedScenario.layerId);

    // set the no graphics status
    if (graphics.length === 0) {
      setCalculateResults({
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
      calculateResults.status === 'success' &&
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
      return;
    }

    // open the panel and update context to run calculations
    setCalculateResults({ status: 'fetching', panelOpen: true, data: null });
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

    // set no scenario status
    if (!selectedScenario) {
      setCalculateResults({
        status: 'no-scenario',
        panelOpen: true,
        data: null,
      });
      return;
    }

    // set the no layer status
    if (selectedScenario.layers.length === 0) {
      setCalculateResults({ status: 'no-layer', panelOpen: true, data: null });
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

        resFeatures.push({
          attributes: {
            CONTAMTYPE: contamGraphic.attributes.CONTAMTYPE,
            CONTAMUNIT: contamGraphic.attributes.CONTAMUNIT,
            CONTAMVAL: contamGraphic.attributes.CONTAMVAL,
            PERMANENT_IDENTIFIER: sampleGraphic.attributes.PERMANENT_IDENTIFIER,
          },
        });
      });
    });

    // perform calculations to update talley in nav bar
    setUpdateContextValues(true);

    let editsCopy = { ...edits };

    // make the contamination map visible in the legend
    if (window.location.search.includes('devMode=true')) {
      contaminationMap.listMode = 'show';
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
          <p>
            Default resource constraints are provided to estimate the cost and
            time required to implement the designed plan. You can change the
            default parameters to reflect scenario-specific constraints and to
            support conducting "what-if" scenarios. Click{' '}
            <strong>View Detailed Results</strong> to display a detailed summary
            of the results.{' '}
            {trainingMode && (
              <Fragment>
                If you have a contamination map layer, click{' '}
                <strong>View Contamination Hits</strong> to see if any of your
                samples would have resulted in contamination hits.{' '}
              </Fragment>
            )}
            Click <strong>Next</strong> to configure your output.
          </p>
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

          <label htmlFor="shifts-per-input">Sampling Team Shifts per Day</label>
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

          <label htmlFor="labor-cost-input">Sampling Team Labor Cost ($)</label>
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

        <div css={sectionContainer}>
          <div css={submitButtonContainerStyles}>
            <button css={submitButtonStyles} onClick={runCalculation}>
              View Detailed Results
            </button>
          </div>
        </div>

        {trainingMode && (
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
                      onClick={(ev) => {
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
        <NavigationButton goToPanel="configureOutput" />
      </div>
    </div>
  );
}

export default Calculate;
