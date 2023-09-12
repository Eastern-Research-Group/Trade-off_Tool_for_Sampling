/** @jsxImportSource @emotion/react */

import React, {
  // Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { css } from '@emotion/react';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
// import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
// import PopupTemplate from '@arcgis/core/PopupTemplate';
// components
// import { AccordionList, AccordionItem } from 'components/Accordion';
import LoadingSpinner from 'components/LoadingSpinner';
import { contaminationMapPopup } from 'components/MapPopup';
import Select from 'components/Select';
import ShowLessMore from 'components/ShowLessMore';
// import NavigationButton from 'components/NavigationButton';
// contexts
import { CalculateContext } from 'contexts/Calculate';
// import { useServicesContext } from 'contexts/LookupFiles';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerType } from 'types/Layer';
// import { ErrorType } from 'types/Misc';
// config
import {
  // contaminationHitsSuccessMessage,
  // featureNotAvailableMessage,
  noContaminationGraphicsMessage,
  noContaminationMapMessage,
  noSampleLayerMessage,
  noSamplesMessage,
  // webServiceErrorMessage,
} from 'config/errorMessages';
// utils
// import { appendEnvironmentObjectParam } from 'utils/arcGisRestUtils';
import { CalculateResultsType } from 'types/CalculateResults';
// import { geoprocessorFetch } from 'utils/fetchUtils';
// import { useDynamicPopup } from 'utils/hooks';
// import {
//   removeZValues,
//   // updateLayerEdits
// } from 'utils/sketchUtils';
import {
  // chunkArray,
  // createErrorObject,
  parseSmallFloat,
} from 'utils/utils';
// styles
import { reactSelectStyles } from 'styles';

// type ContaminationResultsType = {
//   status:
//     | 'none'
//     | 'no-layer'
//     | 'no-map'
//     | 'no-contamination-graphics'
//     | 'no-graphics'
//     | 'fetching'
//     | 'success'
//     | 'failure';
//   error?: ErrorType;
//   data: any[] | null;
// };

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
      // fullGraphics.forEach((graphic) => removeZValues(graphic));
      graphics.push(...fullGraphics.toArray());
    });
  }

  return { groupLayer, graphics };
}

function convertToArray(item: any | any[]) {
  return Array.isArray(item) ? item : [item];
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
  const {
    setGoTo,
    setGoToOptions,
    // trainingMode,
  } = useContext(NavigationContext);
  const {
    defaultSymbols,
    // edits,
    // setEdits,
    layers,
    // setLayers,
    map,
    mapView,
    // sketchLayer,
    selectedScenario,
    // getGpMaxRecordCount,
  } = useContext(SketchContext);
  const {
    calculateResults,
    contaminationMap,
    // inputNumLabHours,
    // inputNumLabs,
    // inputNumSamplingHours,
    // inputNumSamplingPersonnel,
    // inputNumSamplingShifts,
    inputNumSamplingTeams,
    // inputSamplingLaborCost,
    // inputSurfaceArea,
    // resetCalculateContext,
    setCalculateResults,
    setContaminationMap,
    // setInputNumLabHours,
    // setInputNumLabs,
    // setInputNumSamplingHours,
    // setInputNumSamplingPersonnel,
    // setInputNumSamplingShifts,
    setInputNumSamplingTeams,
    // setInputSamplingLaborCost,
    // setInputSurfaceArea,
    setUpdateContextValues,
  } = useContext(CalculateContext);

  // const getPopupTemplate = useDynamicPopup();
  // const services = useServicesContext();

  // const [numTeams, setNumTeams] = useState(1);

  // sync the inputs with settings pulled from AGO
  const [pageInitialized, setPageInitialized] = useState(false);
  useEffect(() => {
    if (!selectedScenario || pageInitialized) return;
    setPageInitialized(true);

    const {
      //     NUM_LAB_HOURS: numLabHours,
      //     NUM_LABS: numLabs,
      //     NUM_SAMPLING_HOURS: numSamplingHours,
      //     NUM_SAMPLING_PERSONNEL: numSamplingPersonnel,
      //     NUM_SAMPLING_SHIFTS: numSamplingShifts,
      NUM_SAMPLING_TEAMS: numSamplingTeams,
      // SAMPLING_LABOR_COST: samplingLaborCost,
      //     SURFACE_AREA: surfaceArea,
    } = selectedScenario.calculateSettings.current;

    //   setInputNumLabHours(numLabHours);
    //   setInputNumLabs(numLabs);
    //   setInputNumSamplingHours(numSamplingHours);
    //   setInputNumSamplingPersonnel(numSamplingPersonnel);
    //   setInputNumSamplingShifts(numSamplingShifts);
    // setNumTeams(numSamplingTeams);
    setInputNumSamplingTeams(numSamplingTeams);
    //   setInputSamplingLaborCost(samplingLaborCost);
    //   setInputSurfaceArea(surfaceArea);
  }, [
    // edits,
    pageInitialized,
    // resetCalculateContext,
    selectedScenario,
    //   setInputNumLabHours,
    //   setInputNumLabs,
    //   setInputNumSamplingHours,
    //   setInputNumSamplingPersonnel,
    //   setInputNumSamplingShifts,
    setInputNumSamplingTeams,
    //   setInputSamplingLaborCost,
    //   setInputSurfaceArea,
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

  // // updates context to run the calculations
  // function runCalculationOriginal() {
  //   if (!map) return;

  //   // set no scenario status
  //   if (!selectedScenario) {
  //     setCalculateResults({
  //       status: 'no-scenario',
  //       panelOpen: true,
  //       data: null,
  //     });
  //     return;
  //   }

  //   // set the no layer status
  //   if (selectedScenario.layers.length === 0) {
  //     setCalculateResults({ status: 'no-layer', panelOpen: true, data: null });
  //     return;
  //   }

  //   const { graphics } = getGraphics(map, selectedScenario.layerId);

  //   // set the no graphics status
  //   if (graphics.length === 0) {
  //     setCalculateResults({
  //       status: 'no-graphics',
  //       panelOpen: true,
  //       data: null,
  //     });
  //     return;
  //   }

  //   const {
  //     NUM_LABS: numLabs,
  //     NUM_LAB_HOURS: numLabHours,
  //     NUM_SAMPLING_HOURS: numSamplingHours,
  //     NUM_SAMPLING_PERSONNEL: numSamplingPersonnel,
  //     NUM_SAMPLING_SHIFTS: numSamplingShifts,
  //     NUM_SAMPLING_TEAMS: numSamplingTeams,
  //     SAMPLING_LABOR_COST: samplingLaborCost,
  //     SURFACE_AREA: surfaceArea,
  //   } = selectedScenario.calculateSettings.current;

  //   // if the inputs are the same as context
  //   // fake a loading spinner and open the panel
  //   if (
  //     calculateResults.status === 'success' &&
  //     numLabs === inputNumLabs &&
  //     numLabHours === inputNumLabHours &&
  //     numSamplingHours === inputNumSamplingHours &&
  //     numSamplingShifts === inputNumSamplingShifts &&
  //     numSamplingPersonnel === inputNumSamplingPersonnel &&
  //     numSamplingTeams === inputNumSamplingTeams &&
  //     samplingLaborCost === inputSamplingLaborCost &&
  //     surfaceArea === inputSurfaceArea
  //   ) {
  //     // display the loading spinner for 1 second
  //     setCalculateResults({
  //       status: 'fetching',
  //       panelOpen: true,
  //       data: calculateResults.data,
  //     });
  //     setTimeout(() => {
  //       setCalculateResults({
  //         status: 'success',
  //         panelOpen: true,
  //         data: calculateResults.data,
  //       });
  //     }, 1000);
  //     return;
  //   }

  //   // open the panel and update context to run calculations
  //   setCalculateResults({ status: 'fetching', panelOpen: true, data: null });
  //   setUpdateContextValues(true);
  // }

  // updates context to run the calculations
  function runCalculation() {
    if (!map || !mapView) return;

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
      setCalculateResults({ status: 'no-map', panelOpen: false, data: null });
      return;
    }

    let contaminationGraphics: __esri.Graphic[] = [];
    if (contaminationMap?.sketchLayer?.type === 'graphics') {
      const fullGraphics = contaminationMap.sketchLayer.graphics.clone();
      contaminationGraphics = fullGraphics.toArray();
    }
    if (contaminationGraphics.length === 0) {
      // display the no graphics on contamination map warning
      setCalculateResults({
        status: 'no-contamination-graphics',
        panelOpen: false,
        data: null,
      });
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

    // open the panel and update context to run calculations
    setCalculateResults({ status: 'fetching', panelOpen: true, data: null });

    // TODO Calculate Decon from the contamination map
    // TODO reset contamination map
    const resultsLayer = map.findLayerById(
      'deconResults',
    ) as __esri.GraphicsLayer;
    resultsLayer.graphics.removeAll();
    resultsLayer.graphics.addMany(contaminationGraphics);

    const contamLayer = map.findLayerById(
      'contaminationMapUpdated',
    ) as __esri.GraphicsLayer;
    contamLayer.graphics.removeAll();

    console.log('graphics: ', graphics);
    console.log('contaminationGraphics: ', contaminationGraphics);

    // loop through decon application layer features
    graphics.forEach((graphic) => {
      // loop through contamination map features
      resultsLayer.graphics.toArray().forEach((contamGraphic) => {
        // console.log('graphic: ', graphic);
        // console.log('contamGraphic: ', contamGraphic);
        // call intersect to see if decon app intersects contamination map
        if (
          !graphic.geometry ||
          !contamGraphic.geometry ||
          !geometryEngine.intersects(graphic.geometry, contamGraphic.geometry)
        ) {
          return;
        }

        // const contamContainsDecon = geometryEngine.contains(
        //   contamGraphic.geometry,
        //   graphic.geometry,
        // );
        // console.log('contamContainsDecon: ', contamContainsDecon);
        const deconContainsContam = geometryEngine.contains(
          graphic.geometry,
          contamGraphic.geometry,
        );
        // console.log('deconContainsContam: ', deconContainsContam);

        // cut a hole in contamination map using result geometry from above step
        const newOuterContamGeometry = deconContainsContam
          ? null
          : geometryEngine.difference(contamGraphic.geometry, graphic.geometry);
        // console.log('newOuterContamGeometry: ', newOuterContamGeometry);

        // create new geometry to fill in the hole
        const newInnerContamGeometry = geometryEngine.intersect(
          graphic.geometry,
          contamGraphic.geometry,
        );
        // console.log('newInnerContamGeometry: ', newInnerContamGeometry);

        // calculate new CFU values for where decon application was applied (CFU * (1 - %effectiveness) = new CFU)
        // const curCfu = contamGraphic.attributes.CONTAMVAL;
        // console.log('curCfu: ', curCfu);
        const contamReduction = graphic.attributes.LOD_NON;
        // console.log('contamReduction: ', contamReduction);
        const reductionFactor = parseSmallFloat(1 - contamReduction);
        // console.log('parseSmallFloat 1 - contamReduction: ', reductionFactor);
        const newCfu = contamGraphic.attributes.CONTAMVAL * reductionFactor;
        // console.log('newCfu: ', newCfu);

        // add new graphics to the map and remove the original contamination feature
        const tempGroupLayer = map.layers.find(
          (layer) => layer.id === selectedScenario.layerId,
        ) as __esri.GroupLayer;
        if (tempGroupLayer && tempGroupLayer.layers.length > 0) {
          // add inner contam
          convertToArray(newInnerContamGeometry).forEach(
            (newGeom: __esri.Geometry) => {
              if (!newGeom) return;
              resultsLayer.graphics.add(
                new Graphic({
                  attributes: {
                    ...contamGraphic.attributes,
                    CONTAMVAL: newCfu,
                    CONTAMREDUCED: true,
                    CONTAMINATED: newCfu >= 100,
                    CONTAMHIT: true,
                  },
                  geometry: newGeom,
                  symbol:
                    newCfu < 100
                      ? ({
                          type: 'simple-fill',
                          color: [0, 255, 0],
                          outline: {
                            color: [0, 0, 0],
                          },
                        } as any)
                      : ({
                          type: 'simple-fill',
                          color: [255, 255, 255],
                          outline: {
                            color: [255, 0, 0],
                          },
                        } as any),
                  popupTemplate: {
                    title: '',
                    content: contaminationMapPopup,
                  },
                }),
              );
            },
          );
          // add outer contam
          if (newOuterContamGeometry) {
            convertToArray(newOuterContamGeometry).forEach(
              (newGeom: __esri.Geometry) => {
                resultsLayer.graphics.add(
                  new Graphic({
                    attributes: {
                      ...contamGraphic.attributes,
                      CONTAMHIT: true,
                    },
                    geometry: newGeom,
                    symbol: {
                      type: 'simple-fill',
                      color: contamGraphic.attributes.CONTAMREDUCED
                        ? contamGraphic.attributes.CONTAMVAL >= 100
                          ? [255, 255, 255]
                          : [0, 255, 0]
                        : [255, 0, 0],
                      outline: {
                        color:
                          contamGraphic.attributes.CONTAMVAL >= 100
                            ? [255, 0, 0]
                            : [0, 0, 0],
                      },
                    } as any,
                    popupTemplate: {
                      title: '',
                      content: contaminationMapPopup,
                    },
                  }),
                );
              },
            );
          }

          // remove the original contam graphic
          resultsLayer.remove(contamGraphic);
        }
      });
    });

    // remove any contamination plumes where decon was not applied
    const graphicsToRemove: any[] = [];
    const replacementGraphics: any[] = [];
    // console.log('resultsLayer: ', resultsLayer.graphics.length);
    resultsLayer.graphics.forEach((graphic) => {
      if (!graphic.attributes.CONTAMREDUCED) {
        graphicsToRemove.push(graphic);
      }

      const newGraphic = graphic.clone();
      newGraphic.symbol = defaultSymbols.symbols['Contamination Map'] as any;
      newGraphic.popupTemplate = {
        title: '',
        content: contaminationMapPopup,
      } as any;
      replacementGraphics.push(newGraphic);
    });
    // console.log('graphicsToRemove: ', graphicsToRemove);
    // console.log('replacementGraphics: ', replacementGraphics);
    resultsLayer.graphics.removeMany(graphicsToRemove);
    // console.log('resultsLayer2: ', resultsLayer.graphics.length);
    contamLayer.graphics.addMany(replacementGraphics);

    // sort the graphics such that the ones where contamination has not been reduced are at the bottom
    resultsLayer.graphics.sort((a, b) => {
      if (a.attributes.CONTAMREDUCED === b.attributes.CONTAMREDUCED) return 0;
      if (a.attributes.CONTAMREDUCED && !b.attributes.CONTAMREDUCED) return 1;
      else return -1;
    });

    contaminationMap.listMode = 'hide';
    contaminationMap.sketchLayer.listMode = 'hide';
    resultsLayer.listMode = 'show';
    resultsLayer.visible = true;
    contamLayer.listMode = 'show';
    contamLayer.visible = false;

    // setInputNumSamplingTeams(numTeams);
    setUpdateContextValues(true);
  }

  // const [
  //   contaminationResults,
  //   setContaminationResults, //
  // ] = useState<ContaminationResultsType>({ status: 'none', data: null });

  // // Call the GP Server to run calculations against the contamination
  // // map.
  // function runContaminationCalculation() {
  //   if (!getGpMaxRecordCount) return;
  //   if (!map || !sketchLayer?.sketchLayer) return;

  //   // set no scenario status
  //   if (!selectedScenario) {
  //     setCalculateResults({
  //       status: 'no-scenario',
  //       panelOpen: true,
  //       data: null,
  //     });
  //     return;
  //   }

  //   // set the no layer status
  //   if (selectedScenario.layers.length === 0) {
  //     setCalculateResults({ status: 'no-layer', panelOpen: true, data: null });
  //     return;
  //   }

  //   // set the no contamination map status
  //   if (!contaminationMap) {
  //     setContaminationResults({ status: 'no-map', data: null });
  //     return;
  //   }

  //   let contamMapSet: __esri.FeatureSet | null = null;
  //   let graphics: __esri.GraphicProperties[] = [];
  //   if (contaminationMap?.sketchLayer?.type === 'graphics') {
  //     const fullGraphics = contaminationMap.sketchLayer.graphics.clone();
  //     fullGraphics.forEach((graphic) => removeZValues(graphic));

  //     graphics = fullGraphics.toArray();
  //   }
  //   if (graphics.length === 0) {
  //     // display the no graphics on contamination map warning
  //     setContaminationResults({
  //       status: 'no-contamination-graphics',
  //       data: null,
  //     });
  //     return;
  //   }

  //   // create a feature set for communicating with the GPServer
  //   // this one is for the contamination map input
  //   contamMapSet = new FeatureSet({
  //     displayFieldName: '',
  //     geometryType: 'polygon',
  //     features: graphics,
  //     spatialReference: {
  //       wkid: 3857,
  //     },
  //     fields: [
  //       {
  //         name: 'OBJECTID',
  //         type: 'oid',
  //         alias: 'OBJECTID',
  //       },
  //       {
  //         name: 'GLOBALID',
  //         type: 'guid',
  //         alias: 'GlobalID',
  //       },
  //       {
  //         name: 'PERMANENT_IDENTIFIER',
  //         type: 'guid',
  //         alias: 'Permanent Identifier',
  //       },
  //       {
  //         name: 'CONTAMTYPE',
  //         type: 'string',
  //         alias: 'Contamination Type',
  //       },
  //       {
  //         name: 'CONTAMVAL',
  //         type: 'double',
  //         alias: 'Contamination Value',
  //       },
  //       {
  //         name: 'CONTAMUNIT',
  //         type: 'string',
  //         alias: 'Contamination Unit',
  //       },
  //       {
  //         name: 'Notes',
  //         type: 'string',
  //         alias: 'Notes',
  //       },
  //     ],
  //   });

  //   const { groupLayer, graphics: sketchedGraphics } = getGraphics(
  //     map,
  //     selectedScenario.layerId,
  //   );
  //   if (sketchedGraphics.length === 0 || !groupLayer) {
  //     // display the no-graphics warning
  //     setContaminationResults({
  //       status: 'no-graphics',
  //       data: null,
  //     });
  //     return;
  //   }

  //   // display the loading spinner
  //   setContaminationResults({
  //     status: 'fetching',
  //     data: null,
  //   });

  //   getGpMaxRecordCount()
  //     .then((maxRecordCount) => {
  //       const chunkedFeatures: __esri.Graphic[][] = chunkArray(
  //         sketchedGraphics,
  //         maxRecordCount,
  //       );

  //       // fire off the contamination results requests
  //       const requests: Promise<any>[] = [];
  //       chunkedFeatures.forEach((features) => {
  //         // create a feature set for communicating with the GPServer
  //         // this one is for the samples input
  //         const featureSet = new FeatureSet({
  //           displayFieldName: '',
  //           geometryType: 'polygon',
  //           features,
  //           spatialReference: {
  //             wkid: 3857,
  //           },
  //           fields: [
  //             {
  //               name: 'OBJECTID',
  //               type: 'oid',
  //               alias: 'OBJECTID',
  //             },
  //             {
  //               name: 'GLOBALID',
  //               type: 'guid',
  //               alias: 'GlobalID',
  //             },
  //             {
  //               name: 'PERMANENT_IDENTIFIER',
  //               type: 'guid',
  //               alias: 'Permanent Identifier',
  //             },
  //             {
  //               name: 'TYPEUUID',
  //               type: 'string',
  //               alias: 'Decon Technology Type ID',
  //             },
  //             {
  //               name: 'TYPE',
  //               type: 'string',
  //               alias: 'Decon Technology Type',
  //             },
  //             {
  //               name: 'TTPK',
  //               type: 'double',
  //               alias: 'Time to Prepare Kits',
  //             },
  //             {
  //               name: 'TTC',
  //               type: 'double',
  //               alias: 'Time to Collect',
  //             },
  //             {
  //               name: 'TTA',
  //               type: 'double',
  //               alias: 'Time to Analyze',
  //             },
  //             {
  //               name: 'TTPS',
  //               type: 'double',
  //               alias: 'Total Time per Decon Application',
  //             },
  //             {
  //               name: 'LOD_P',
  //               type: 'double',
  //               alias: 'Limit of Detection Porous',
  //             },
  //             {
  //               name: 'LOD_NON',
  //               type: 'double',
  //               alias: 'Limit of Detection Nonporous',
  //             },
  //             {
  //               name: 'MCPS',
  //               type: 'double',
  //               alias: 'Decon Technology Material Cost per Decon Application',
  //             },
  //             {
  //               name: 'TCPS',
  //               type: 'double',
  //               alias: 'Total Cost Per Decon Application',
  //             },
  //             {
  //               name: 'WVPS',
  //               type: 'double',
  //               alias: 'Waste Volume per Decon Application',
  //             },
  //             {
  //               name: 'WWPS',
  //               type: 'double',
  //               alias: 'Waste Weight per Decon Application',
  //             },
  //             {
  //               name: 'SA',
  //               type: 'double',
  //               alias: 'Decon Technology Surface Area',
  //             },
  //             {
  //               name: 'Notes',
  //               type: 'string',
  //               alias: 'Notes',
  //             },
  //             {
  //               name: 'ALC',
  //               type: 'double',
  //               alias: 'Analysis Labor Cost',
  //             },
  //             {
  //               name: 'AMC',
  //               type: 'double',
  //               alias: 'Analysis Material Cost',
  //             },
  //             {
  //               name: 'CONTAMTYPE',
  //               type: 'string',
  //               alias: 'Contamination Type',
  //             },
  //             {
  //               name: 'CONTAMVAL',
  //               type: 'double',
  //               alias: 'Contamination Value',
  //             },
  //             {
  //               name: 'CONTAMUNIT',
  //               type: 'string',
  //               alias: 'Contamination Unit',
  //             },
  //           ],
  //         });

  //         // call the GP Server
  //         const params = {
  //           f: 'json',
  //           Input_Sampling_Unit: featureSet,
  //           Contamination_Map: contamMapSet,
  //         };
  //         appendEnvironmentObjectParam(params);

  //         const request = geoprocessorFetch({
  //           url: `${services.data.totsGPServer}/Contamination Results`,
  //           inputParameters: params,
  //         });
  //         requests.push(request);
  //       });

  //       Promise.all(requests)
  //         .then((responses: any) => {
  //           // perform calculations to update talley in nav bar
  //           setUpdateContextValues(true);

  //           const resFeatures: any[] = [];
  //           for (let i = 0; i < responses.length; i++) {
  //             const res = responses[i];

  //             // catch an error in the response of the successful fetch
  //             if (res.error) {
  //               console.error(res.error);
  //               setContaminationResults({
  //                 status: 'failure',
  //                 error: {
  //                   error: createErrorObject(res),
  //                   message: res.error.message,
  //                 },
  //                 data: null,
  //               });
  //               return;
  //             }

  //             if (res?.results?.[0]?.value?.features) {
  //               resFeatures.push(...res.results[0].value.features);
  //             }
  //           }

  //           // make the contamination map visible in the legend
  //           contaminationMap.listMode = 'show';
  //           contaminationMap.sketchLayer.listMode = 'show';
  //           setContaminationMap((layer) => {
  //             return {
  //               ...layer,
  //               listMode: 'show',
  //             } as LayerType;
  //           });

  //           // find the layer being edited
  //           const index = layers.findIndex(
  //             (layer) => layer.layerId === contaminationMap.layerId,
  //           );

  //           // update the layers context
  //           if (index > -1) {
  //             setLayers((layers) => {
  //               return [
  //                 ...layers.slice(0, index),
  //                 {
  //                   ...contaminationMap,
  //                   listMode: 'show',
  //                 },
  //                 ...layers.slice(index + 1),
  //               ];
  //             });
  //           }

  //           // make a copy of the edits context variable
  //           let editsCopy = updateLayerEdits({
  //             edits,
  //             layer: contaminationMap,
  //             type: 'properties',
  //           });

  //           // save the data to state, use an empty array if there is no data
  //           if (resFeatures.length > 0) {
  //             const popupTemplate = new PopupTemplate(
  //               getPopupTemplate(sketchLayer.layerType, true),
  //             );

  //             // loop through the layers and update the contam values
  //             groupLayer.layers.forEach((graphicsLayer) => {
  //               if (graphicsLayer.type !== 'graphics') return;

  //               const tempLayer = graphicsLayer as __esri.GraphicsLayer;
  //               // update the contam value attribute of the graphics
  //               tempLayer.graphics.forEach((graphic) => {
  //                 const resFeature = resFeatures.find(
  //                   (feature: any) =>
  //                     graphic.attributes.PERMANENT_IDENTIFIER ===
  //                     feature.attributes.PERMANENT_IDENTIFIER,
  //                 );

  //                 // if the graphic was not found in the response, set contam value to null,
  //                 // otherwise use the contam value value found in the response.
  //                 let contamValue = null;
  //                 let contamType = graphic.attributes.CONTAMTYPE;
  //                 let contamUnit = graphic.attributes.CONTAMUNIT;
  //                 if (resFeature) {
  //                   contamValue = resFeature.attributes.CONTAMVAL;
  //                   contamType = resFeature.attributes.CONTAMTYPE;
  //                   contamUnit = resFeature.attributes.CONTAMUNIT;
  //                 }
  //                 graphic.attributes.CONTAMVAL = contamValue;
  //                 graphic.attributes.CONTAMTYPE = contamType;
  //                 graphic.attributes.CONTAMUNIT = contamUnit;
  //                 graphic.popupTemplate = popupTemplate;
  //               });

  //               // find the layer
  //               const layer = layers.find(
  //                 (layer) => layer.layerId === graphicsLayer.id,
  //               );
  //               if (!layer) return;

  //               // update the graphics of the sketch layer
  //               editsCopy = updateLayerEdits({
  //                 edits: editsCopy,
  //                 layer: layer,
  //                 type: 'update',
  //                 changes: tempLayer.graphics,
  //                 hasContaminationRan: true,
  //               });
  //             });

  //             setContaminationResults({
  //               status: 'success',
  //               data: resFeatures,
  //             });
  //           } else {
  //             setContaminationResults({
  //               status: 'success',
  //               data: [],
  //             });
  //           }

  //           setEdits(editsCopy);
  //         })
  //         .catch((err) => {
  //           console.error(err);

  //           // perform calculations to update talley in nav bar
  //           setUpdateContextValues(true);

  //           setContaminationResults({
  //             status: 'failure',
  //             error: {
  //               error: createErrorObject(err),
  //               message: err.message,
  //             },
  //             data: null,
  //           });

  //           window.logErrorToGa(err);
  //         });
  //     })
  //     .catch((err) => {
  //       console.error(err);

  //       // perform calculations to update talley in nav bar
  //       setUpdateContextValues(true);

  //       setContaminationResults({
  //         status: 'failure',
  //         error: {
  //           error: createErrorObject(err),
  //           message: err.message,
  //         },
  //         data: null,
  //       });

  //       window.logErrorToGa(err);
  //     });
  // }

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
            of the results.
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
            Number of Concurrent Applications
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

          {/* <label htmlFor="personnel-per-team-input">
            Personnel per Decon Team
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
            Decon Team Hours per Shift
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

          <label htmlFor="shifts-per-input">Decon Team Shifts per Day</label>
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

          <label htmlFor="labor-cost-input">Decon Team Labor Cost ($)</label>
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
          /> */}
        </div>

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

          {calculateResults.status === 'fetching' && <LoadingSpinner />}
          {/* {calculateResults.status === 'failure' &&
            webServiceErrorMessage(calculateResults.error)} */}
          {calculateResults.status === 'no-map' && noContaminationMapMessage}
          {calculateResults.status === 'no-layer' && noSampleLayerMessage}
          {calculateResults.status === 'no-graphics' && noSamplesMessage}
          {calculateResults.status === 'no-contamination-graphics' &&
            noContaminationGraphicsMessage}
          {/* {calculateResults.status === 'success' &&
            calculateResults?.data &&
            calculateResults.data.length > -1 &&
            contaminationHitsSuccessMessage(
              calculateResults.data.length,
            )} */}
          <div css={submitButtonContainerStyles}>
            <button css={submitButtonStyles} onClick={runCalculation}>
              View Detailed Results
            </button>
          </div>
        </div>

        {/* {trainingMode && (
          <Fragment>
            <div css={sectionContainer}>
              <p>
                <strong>TRAINING MODE</strong>: If you have a contamination
                layer, you can add here and check if your decon plan captured
                the contamination zone.
              </p>
            </div>
            <AccordionList>
              <AccordionItem title={'Include Contamination Map (Optional)'}>
                <div css={sectionContainer}>
                  {services.status === 'fetching' && <LoadingSpinner />}
                  {services.status === 'failure' &&
                    featureNotAvailableMessage('Include Contamination Map')}
                  {services.status === 'success' && (
                    <Fragment>
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
                          onChange={(ev) =>
                            setContaminationMap(ev as LayerType)
                          }
                          options={layers.filter(
                            (layer: any) =>
                              layer.layerType === 'Contamination Map',
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
                    </Fragment>
                  )}
                </div>
              </AccordionItem>
            </AccordionList>
          </Fragment>
        )} */}
      </div>
      {/* <div css={sectionContainer}>
        <NavigationButton goToPanel="configureOutput" />
      </div> */}
    </div>
  );
}

export default Calculate;
