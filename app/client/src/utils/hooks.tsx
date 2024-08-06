/** @jsxImportSource @emotion/react */

import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import Collection from '@arcgis/core/core/Collection';
import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import FillSymbol3DLayer from '@arcgis/core/symbols/FillSymbol3DLayer';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import LineStylePattern3D from '@arcgis/core/symbols/patterns/LineStylePattern3D';
import LineSymbol3D from '@arcgis/core/symbols/LineSymbol3D';
import LineSymbol3DLayer from '@arcgis/core/symbols/LineSymbol3DLayer';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import PolygonSymbol3D from '@arcgis/core/symbols/PolygonSymbol3D';
import PopupTemplate from '@arcgis/core/PopupTemplate';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import TextSymbol from '@arcgis/core/symbols/TextSymbol';
// components
import MapPopup, {
  buildingMapPopup,
  contaminationMapPopup,
  imageryAnalysisMapPopup,
} from 'components/MapPopup';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { CalculateContext } from 'contexts/Calculate';
import { DialogContext, AlertDialogOptions } from 'contexts/Dialog';
import { useLookupFiles } from 'contexts/LookupFiles';
import { NavigationContext } from 'contexts/Navigation';
import { PublishContext } from 'contexts/Publish';
import {
  AoiDataType,
  JsonDownloadType,
  SketchContext,
  SketchViewModelType,
} from 'contexts/Sketch';
// types
import {
  CalculateResultsType,
  CalculateResultsDataType,
  CalculateResultsDeconDataType,
} from 'types/CalculateResults';
import { EditsType, ScenarioEditsType } from 'types/Edits';
import { FieldInfos, LayerType, LayerTypeName } from 'types/Layer';
import { AppType } from 'types/Navigation';
// utils
import { appendEnvironmentObjectParam } from 'utils/arcGisRestUtils';
import { geoprocessorFetch, proxyFetch } from 'utils/fetchUtils';
import {
  calculateArea,
  convertToPoint,
  createBuffer,
  deactivateButtons,
  findLayerInEdits,
  generateUUID,
  getCurrentDateTime,
  handlePopupClick,
  removeZValues,
  updateLayerEdits,
} from 'utils/sketchUtils';
import { parseSmallFloat } from 'utils/utils';

// type AoiPercentages = {
//   numAois: number;
//   asphalt: number;
//   concrete: number;
//   soil: number;
//   // zone: number;
//   // aoiId: string;
// };

type NsiData = {
  status: 'none' | 'fetching' | 'success' | 'failure';
  planGraphics: PlanGraphics;
};

type PlanGraphics = {
  [planId: string]: {
    graphics: __esri.Graphic[];
    imageGraphics: __esri.Graphic[];
    aoiArea: number;
    buildingFootprint: number;
    summary: {
      totalAoiSqM: number;
      totalBuildingFootprintSqM: number;
      totalBuildingFloorsSqM: number;
      totalBuildingSqM: number;
      totalBuildingExtWallsSqM: number;
      totalBuildingIntWallsSqM: number;
      totalBuildingRoofSqM: number;
    };
    aoiPercentages: {
      numAois: number;
      asphalt: number;
      concrete: number;
      soil: number;
    };
  };
};

let view: __esri.MapView | __esri.SceneView | null = null;
export const baseBuildingSymbolProps = {
  text: '\ue687',
  color: 'blue',
  yoffset: -13,
  font: {
    family: 'CalciteWebCoreIcons',
    size: 24,
  },
};

export const detectionLimit = 100;

const bldgTypeEnum = {
  C: 'Concrete',
  H: 'Manufactured',
  M: 'Masonry',
  S: 'Steel',
  W: 'Wood',
};
const foundTypeEnum = {
  C: 'Crawl',
  B: 'Basement',
  S: 'Slab',
  P: 'Pier',
  I: 'Pile',
  F: 'Fill',
  W: 'Solid Wall',
};
const ftprntsrcEnum = {
  B: 'Bing',
  O: 'Oak Ridge National Labs',
  N: 'National Geospatial-Intelligence Agency',
  M: 'Map Building Layer',
};
const sourceEnum = {
  P: 'Parcel',
  E: 'ESRI',
  H: 'HIFLD Hospital',
  N: 'HIFLD Nursing Home',
  S: 'National Center for Education Statistics',
  X: 'HAZUS/NSI-2015',
};
const stDamcatEnum = {
  RES: 'Residential',
  COM: 'Commercial',
  IND: 'Industrial',
  PUB: 'Public',
};

const mediaToBeepEnum = {
  'Streets - Asphalt': 'asphalt',
  'Streets/Sidewalks - Concrete': 'concrete',
  'Soil/Vegetation': 'soil',
};

const partitionFactors = {
  'Building Exterior Walls': 0.5,
  'Building Interior Walls': 0.3,
  'Building Interior Floors': 0.7,
  'Building Roofs': 1,
} as any;

const backupImagerySymbol = new SimpleFillSymbol({
  color: [0, 0, 0, 0],
  outline: {
    color: [0, 0, 0, 0],
    width: 0,
    style: 'solid',
  },
});
export const imageAnalysisSymbols = {
  Asphalt: new SimpleFillSymbol({
    color: [0, 0, 0, 0.5],
    outline: {
      color: [0, 0, 0, 1],
      width: 1,
      style: 'solid',
    },
  }),
  Concrete: new SimpleFillSymbol({
    color: [156, 156, 156, 0.5],
    outline: {
      color: [156, 156, 156, 1],
      width: 1,
      style: 'solid',
    },
  }),
  // Soil: new SimpleFillSymbol({
  //   color: [181, 53, 53, 0.5],
  //   outline: {
  //     color: [181, 53, 53, 1],
  //     width: 1,
  //     style: 'solid',
  //   },
  // }),
  Soil: new SimpleFillSymbol({
    color: [191, 217, 153, 0.5],
    outline: {
      color: [191, 217, 153, 1],
      width: 1,
      style: 'solid',
    },
  }),
  Vegetation: new SimpleFillSymbol({
    color: [191, 217, 153, 0.5],
    outline: {
      color: [191, 217, 153, 1],
      width: 1,
      style: 'solid',
    },
  }),
  Water: new SimpleFillSymbol({
    color: [191, 217, 242, 0.5],
    outline: {
      color: [191, 217, 242, 1],
      width: 1,
      style: 'solid',
    },
  }),
};

function hasGraphics(aoiData: AoiDataType) {
  if (!aoiData.graphics || Object.keys(aoiData.graphics).length === 0)
    return false;

  for (let g of Object.values(aoiData.graphics)) {
    if (typeof g === 'number') continue;
    if (g.length > 0) return true;
  }

  return false;
}

function handleEnum(value: string, obj: any) {
  return obj.hasOwnProperty(value) ? obj[value] : value;
}

type ContaminationPercentages = {
  [planId: string]: { [key: number]: number };
};
type PlanBuildingCfu = { [planId: string]: number };

function processScenario(
  scenario: ScenarioEditsType | string,
  nsiData: NsiData,
  contaminationPercentages: ContaminationPercentages,
  planBuildingCfu: PlanBuildingCfu,
  defaultDeconSelections: any[],
) {
  const isScenario = typeof scenario !== 'string';
  const scenarioId = isScenario ? scenario.layerId : scenario;
  const deconTechSelections = isScenario ? scenario.deconTechSelections : [];

  const planGraphics = nsiData.planGraphics[scenarioId];
  if (!planGraphics) return;

  const {
    totalAoiSqM,
    totalBuildingFootprintSqM,
    totalBuildingFloorsSqM,
    // totalBuildingSqM,
    totalBuildingExtWallsSqM,
    totalBuildingIntWallsSqM,
    totalBuildingRoofSqM,
  } = planGraphics.summary;
  // console.log('totalAoiSqM: ', totalAoiSqM);
  // console.log('totalBuildingFootprintSqM: ', totalBuildingFootprintSqM);
  const nonBuildingArea = totalAoiSqM - totalBuildingFootprintSqM;

  if (isScenario && scenario.aoiSummary) {
    scenario.aoiSummary.area = planGraphics.aoiArea;
    scenario.aoiSummary.buildingFootprint = totalBuildingFootprintSqM;
  }

  const curDeconTechSelections =
    deconTechSelections && deconTechSelections.length > 0
      ? deconTechSelections
      : defaultDeconSelections;
  const newDeconTechSelections: any = [];
  // let hasDeconTech = false;
  curDeconTechSelections.forEach((sel) => {
    // find decon settings
    const media = sel.media;
    // if (sel.deconTech) hasDeconTech = true;

    let surfaceArea = 0;
    let avgCfu = 0;
    // let totalCfu = 0;
    let pctAoi = 0;
    if (media.includes('Building ')) {
      avgCfu =
        (planBuildingCfu[scenarioId] ?? 0) * (partitionFactors[media] ?? 1);

      if (media === 'Building Exterior Walls')
        surfaceArea = totalBuildingExtWallsSqM;
      if (media === 'Building Interior Walls')
        surfaceArea = totalBuildingIntWallsSqM;
      if (media === 'Building Interior Floors')
        surfaceArea = totalBuildingFloorsSqM;
      if (media === 'Building Roofs') surfaceArea = totalBuildingRoofSqM;
    } else {
      pctAoi = (planGraphics.aoiPercentages as any)[
        (mediaToBeepEnum as any)[sel.media]
      ] as number;
      console.log('pctAoi: ', pctAoi);
      const pctFactor = pctAoi * 0.01;
      console.log('pctFactor: ', pctFactor);

      // get surface area of soil, asphalt or concrete
      //             60 =             100 * 0.6 surface area of concrete
      console.log('nonBuildingArea: ', nonBuildingArea);
      surfaceArea = nonBuildingArea * pctFactor;

      // get total CFU for media
      let totalArea = 0;
      let totalCfu = 0;
      console.log('scenarioId: ', scenarioId);
      console.log('contaminationPercentages: ', contaminationPercentages);
      if (contaminationPercentages.hasOwnProperty(scenarioId)) {
        Object.keys(contaminationPercentages[scenarioId]).forEach(
          (key: any) => {
            // area of media and cfu level
            console.log('key: ', key);
            const pctCfu = contaminationPercentages[scenarioId][key];
            console.log('pctCfu: ', pctCfu);
            console.log('surfaceArea: ', surfaceArea);
            //                34.2 =   0.57 * 60
            const surfaceAreaSfCfu = pctCfu * surfaceArea;
            console.log('surfaceAreaSfCfu: ', surfaceAreaSfCfu);
            totalArea += surfaceAreaSfCfu;

            // 34.2M  =             34.2 * 1M;
            // SUM    = 35.916M CFU
            totalCfu += surfaceAreaSfCfu * key;
          },
        );
      }

      console.log('totalCfu: ', totalCfu);
      console.log('totalArea: ', totalArea);
      avgCfu = !totalCfu && !totalArea ? 0 : totalCfu / totalArea;
    }
    console.log('surfaceArea: ', surfaceArea);
    console.log('avgCfu: ', avgCfu);

    newDeconTechSelections.push({
      ...sel,
      pctAoi,
      surfaceArea,
      avgCfu,
    });
  });

  return newDeconTechSelections;
}

async function fetchBuildingData(
  aoiGraphics: __esri.Graphic[],
  features: any[],
  services: any,
  planGraphics: PlanGraphics,
  responseIndexes: string[],
  buildingFilter: string[] = [],
) {
  const requests: any[] = [];
  features.forEach((feature) => {
    const request: any = proxyFetch(`${services.nsi}/structures?fmt=fc`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [feature],
      }),
    });

    requests.push(request);
  });

  const responses = await Promise.all(requests);
  responses.forEach((results, index) => {
    results.features.forEach((feature: any) => {
      const {
        // bid,
        bldgtype,
        found_type,
        ftprntsrc,
        num_story,
        source,
        sqft,
        st_damcat,
      } = feature.properties;

      // if (buildingFilter.includes(bid)) return;

      // feet
      const footprintSqFt = sqft;
      const floorsSqFt = num_story * footprintSqFt;
      const extWallsSqFt = Math.sqrt(sqft) * 10 * 4 * num_story;
      const intWallsSqFt = extWallsSqFt * 3;

      // meters
      const footprintSqM = sqft / 10.7639104167;
      const floorsSqM = num_story * footprintSqM;
      const extWallsSqM = Math.sqrt(footprintSqM) * 10 * 4 * num_story;
      const intWallsSqM = extWallsSqM * 3;

      const planId = responseIndexes[index];
      const permId = generateUUID();
      planGraphics[planId].graphics.push(
        new Graphic({
          attributes: {
            ...feature.properties,
            PERMANENT_IDENTIFIER: permId,
            bldgtype: handleEnum(bldgtype, bldgTypeEnum),
            found_type: handleEnum(found_type, foundTypeEnum),
            ftprntsrc: handleEnum(ftprntsrc, ftprntsrcEnum),
            source: handleEnum(source, sourceEnum),
            st_damcat: handleEnum(st_damcat, stDamcatEnum),
            CONTAMTYPE: '',
            CONTAMUNIT: '',
            CONTAMVALPLUME: 0,
            CONTAMVALINITIAL: 0,
            CONTAMVAL: 0,
            footprintSqM,
            floorsSqM,
            totalSqM: floorsSqM + extWallsSqM + intWallsSqM + footprintSqM,
            extWallsSqM,
            intWallsSqM,
            roofSqM: footprintSqM,
            footprintSqFt,
            floorsSqFt,
            totalSqFt: floorsSqFt,
            extWallsSqFt,
            intWallsSqFt,
            roofSqFt: footprintSqFt,
          },
          geometry: new Point({
            longitude: feature.geometry.coordinates[0],
            latitude: feature.geometry.coordinates[1],
            spatialReference: {
              wkid: 102100,
            },
          }),
          symbol: new TextSymbol(baseBuildingSymbolProps),
          popupTemplate: {
            title: '',
            content: buildingMapPopup,
          },
        }),
      );

      planGraphics[planId].summary.totalBuildingFootprintSqM += footprintSqM;
      planGraphics[planId].summary.totalBuildingFloorsSqM += floorsSqM;
      planGraphics[planId].summary.totalBuildingSqM += floorsSqM;
      planGraphics[planId].summary.totalBuildingExtWallsSqM += extWallsSqM;
      planGraphics[planId].summary.totalBuildingIntWallsSqM += intWallsSqM;
      planGraphics[planId].summary.totalBuildingRoofSqM += footprintSqM;
    });
  });

  const iaResponses: any[] = [];
  for (let graphic of aoiGraphics) {
    removeZValues(graphic);

    const featureSet = new FeatureSet({
      displayFieldName: '',
      geometryType: 'polygon',
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
          name: 'PERMANENT_IDENTIFIER',
          type: 'guid',
          alias: 'PERMANENT_IDENTIFIER',
        },
      ],
      features: [graphic],
    });

    // call gp service
    const props = {
      f: 'json',
      Feature_Set: featureSet.toJSON(),
      Imagery_Layer_URL:
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    };
    appendEnvironmentObjectParam(props);

    iaResponses.push(
      await geoprocessorFetch({
        url: `${services.shippTestGPServer}/Classify%20AOI`,
        inputParameters: props,
      }),
    );
  }

  iaResponses.forEach((response, index) => {
    // console.log('response: ', response);
    const summaryOutput = response.results.find(
      (r: any) => r.paramName === 'Output_Classification_Summary',
    );
    if (summaryOutput) {
      const planId = responseIndexes[index];
      planGraphics[planId].aoiPercentages.numAois +=
        summaryOutput.value.features.length;
      // numAois += summaryOutput.value.features.length;

      summaryOutput.value.features.forEach((f: any, index: number) => {
        planGraphics[planId].aoiPercentages.asphalt += f.attributes.ASPHALT;
        planGraphics[planId].aoiPercentages.concrete += f.attributes.CONCRETE;
        planGraphics[planId].aoiPercentages.soil += f.attributes.SOIL;

        // totalAsphalt += f.attributes.ASPHALT;
        // totalConcrete += f.attributes.CONCRETE;
        // totalSoil += f.attributes.SOIL;
      });
    }

    // Figure out what to add graphics to
    const featuresOutput = response.results.find(
      (r: any) => r.paramName === 'Output_Classification_Features',
    );
    if (featuresOutput) {
      featuresOutput.value.features.forEach((f: any) => {
        const category = f.attributes.category;
        const symbol = imageAnalysisSymbols.hasOwnProperty(category)
          ? (imageAnalysisSymbols as any)[category]
          : backupImagerySymbol;

        const planId = responseIndexes[index];
        const permId = generateUUID();

        planGraphics[planId].imageGraphics.push(
          new Graphic({
            attributes: {
              ...f.attributes,
              PERMANENT_IDENTIFIER: permId,
            },
            geometry: f.geometry,
            symbol,
            popupTemplate: {
              title: '',
              content: imageryAnalysisMapPopup,
            },
          }),
        );
      });
    }
  });

  Object.keys(planGraphics).forEach((planId) => {
    const { numAois, asphalt, concrete, soil } =
      planGraphics[planId].aoiPercentages;
    planGraphics[planId].aoiPercentages = {
      numAois,
      asphalt: asphalt / numAois,
      concrete: concrete / numAois,
      soil: soil / numAois,
    };
  });
}

// Saves data to session storage
export async function writeToStorage(
  key: string,
  data: string | boolean | object,
  setOptions: Dispatch<SetStateAction<AlertDialogOptions | null>>,
) {
  const itemSize = Math.round(JSON.stringify(data).length / 1024);

  try {
    if (typeof data === 'string') sessionStorage.setItem(key, data);
    else sessionStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    const storageSize = Math.round(
      JSON.stringify(sessionStorage).length / 1024,
    );
    const message = `New storage size would be ${
      storageSize + itemSize
    }K up from ${storageSize}K already in storage`;
    console.error(e);

    setOptions({
      title: 'Session Storage Limit Reached',
      ariaLabel: 'Session Storage Limit Reached',
      description: message,
    });

    window.logErrorToGa(`${key}:${message}`);
  }
}

// Reads data from session storage
export function readFromStorage(key: string) {
  return sessionStorage.getItem(key);
}

// Hook that allows the user to easily start over without
// having to manually start a new session.
export function useStartOver() {
  const { resetCalculateContext } = useContext(CalculateContext);
  const { setOptions } = useContext(DialogContext);
  const {
    setCurrentPanel,
    setGettingStartedOpen,
    setGoTo,
    setGoToOptions,
    setLatestStepIndex,
    setTrainingMode,
  } = useContext(NavigationContext);
  const {
    setIncludePartialPlan,
    setIncludePartialPlanWebMap,
    setIncludePartialPlanWebScene,
    setIncludeCustomSampleTypes,
    setPublishSamplesMode,
    setPublishSampleTableMetaData,
    setSampleTableDescription,
    setSampleTableName,
    setSampleTypeSelections,
    setSelectedService,
    setWebMapReferenceLayerSelections,
    setWebSceneReferenceLayerSelections,
  } = useContext(PublishContext);
  const {
    basemapWidget,
    homeWidget,
    map,
    mapView,
    resetDefaultSymbols,
    sceneView,
    setAoiSketchLayer,
    setDisplayDimensions,
    setDisplayGeometryType,
    setEdits,
    setLayers,
    setPortalLayers,
    setReferenceLayers,
    setSelectedScenario,
    setSketchLayer,
    setTerrain3dUseElevation,
    setTerrain3dVisible,
    setUrlLayers,
    setUserDefinedAttributes,
    setUserDefinedOptions,
    setViewUnderground3d,
  } = useContext(SketchContext);

  function startOver() {
    try {
      if (sketchVMG) {
        sketchVMG['2d'].cancel();
        sketchVMG['3d'].cancel();
      }
      if (clickEvent) clickEvent.remove();
      if (doubleClickEvent) doubleClickEvent.remove();
      if (moveEvent) moveEvent.remove();
      if (popupEvent) popupEvent.remove();
    } catch (_ex) {}

    setSelectedScenario(null);
    setSketchLayer(null);
    setAoiSketchLayer(null);

    // clear the map
    map?.removeAll();

    // set the layers to just the defaults
    setLayers([]);
    resetDefaultSymbols();
    setEdits({ count: 0, edits: [] });
    setUrlLayers([]);
    setReferenceLayers([]);
    setPortalLayers([]);
    setUserDefinedAttributes({ editCount: 0, sampleTypes: {} });
    setUserDefinedOptions([]);

    // clear navigation
    setCurrentPanel(null);
    setGoTo('');
    setGoToOptions(null);
    writeToStorage(
      'tots_current_tab',
      { goTo: '', goToOptions: null },
      setOptions,
    );
    setLatestStepIndex(-1);
    setTrainingMode(false);
    setGettingStartedOpen(false);
    setDisplayDimensions('2d');
    setDisplayGeometryType('points');
    setTerrain3dUseElevation(true);
    setTerrain3dVisible(true);
    setViewUnderground3d(false);

    // set the calculate settings back to defaults
    resetCalculateContext();

    // clear publish
    setPublishSamplesMode('');
    setPublishSampleTableMetaData(null);
    setSampleTableDescription('');
    setSampleTableName('');
    setSampleTypeSelections([]);
    setSelectedService(null);
    setIncludePartialPlan(true);
    setIncludePartialPlanWebMap(true);
    setIncludePartialPlanWebScene(true);
    setIncludeCustomSampleTypes(false);
    setWebMapReferenceLayerSelections([]);
    setWebSceneReferenceLayerSelections([]);

    memoryState = {};

    // reset the zoom
    if (mapView) {
      mapView.center = new Point({ longitude: -95, latitude: 37 });
      mapView.zoom = 3;
      mapView.rotation = 0;
      if (mapView) mapView.closePopup();
    }
    if (sceneView) {
      if (sceneView.camera) {
        sceneView.camera.fov = 55;
        sceneView.camera.heading = 0;
        sceneView.camera.tilt = 0.171544;
        sceneView.camera.position = new Point({
          longitude: -95,
          latitude: 36.6715,
        });
      }
      sceneView.zoom = 4;
      if (sceneView) sceneView.closePopup();
    }

    if (homeWidget && mapView && sceneView) {
      homeWidget['2d'].viewpoint = mapView.viewpoint;
      homeWidget['3d'].viewpoint = sceneView.viewpoint;
    }

    if (basemapWidget) {
      // Search for the basemap with the matching basemap
      let selectedBasemap: __esri.Basemap | null = null;
      basemapWidget.source.basemaps.forEach((basemap) => {
        if (basemap.title === 'Streets') selectedBasemap = basemap;
      });

      // Set the activeBasemap to the basemap that was found
      if (selectedBasemap) basemapWidget.activeBasemap = selectedBasemap;
    }
  }

  return function () {
    setOptions({
      title: 'Would you like to continue?',
      ariaLabel: 'Would you like to continue?',
      description: 'This operation will clear all of your progress so far.',
      onContinue: startOver,
    });
  };
}

// Runs sampling plan calculations whenever the
// samples change or the variables on the calculate tab
// change.
export function useCalculatePlan() {
  const {
    edits,
    layers,
    sceneViewForArea,
    selectedScenario,
    setEdits,
    setSelectedScenario,
  } = useContext(SketchContext);
  const {
    inputNumLabs,
    inputNumLabHours,
    inputNumSamplingHours,
    inputNumSamplingPersonnel,
    inputNumSamplingShifts,
    inputNumSamplingTeams,
    inputSamplingLaborCost,
    inputSurfaceArea,
    setCalculateResults,
    setUpdateContextValues,
    updateContextValues,
  } = useContext(CalculateContext);

  // Reset the calculateResults context variable, whenever anything
  // changes that will cause a re-calculation.
  const [calcGraphics, setCalcGraphics] = useState<__esri.Graphic[]>([]);
  useEffect(() => {
    // Get the number of graphics for the selected scenario
    let numGraphics = 0;
    if (selectedScenario && selectedScenario.layers.length > 0) {
      layers.forEach((layer) => {
        if (layer.parentLayer?.id !== selectedScenario.layerId) return;
        if (layer.sketchLayer.type !== 'graphics') return;

        numGraphics += layer.sketchLayer.graphics.length;
      });
    }

    // exit early
    if (!selectedScenario || numGraphics === 0) {
      setCalculateResults({ status: 'none', panelOpen: false, data: null });
      setCalcGraphics([]);
      return;
    }
    if (selectedScenario.editType === 'properties') return;

    // to improve performance, do not perform calculations if
    // only the scenario name/description changed
    const { editsScenario } = findLayerInEdits(
      edits.edits,
      selectedScenario.layerId,
    );
    if (!editsScenario || editsScenario.editType === 'properties') return;

    setCalculateResults((calculateResults: CalculateResultsType) => {
      return {
        status: 'fetching',
        panelOpen: calculateResults.panelOpen,
        data: null,
      };
    });
  }, [edits, layers, selectedScenario, setCalculateResults]);

  const [totals, setTotals] = useState({
    ttpk: 0,
    ttc: 0,
    tta: 0,
    ttps: 0,
    lod_p: 0,
    lod_non: 0,
    mcps: 0,
    tcps: 0,
    wvps: 0,
    wwps: 0,
    sa: 0,
    alc: 0,
    amc: 0,
    ac: 0,
  });
  const [totalArea, setTotalArea] = useState(0);

  // perform geospatial calculatations
  useEffect(() => {
    // exit early checks
    if (
      !selectedScenario ||
      selectedScenario.layers.length === 0 ||
      edits.count === 0
    ) {
      return;
    }

    // to improve performance, do not perform calculations if
    // only the scenario name/description changed
    if (selectedScenario.editType === 'properties') return;
    const { editsScenario } = findLayerInEdits(
      edits.edits,
      selectedScenario.layerId,
    );
    if (!editsScenario || editsScenario.editType === 'properties') return;

    async function processFeatures() {
      let ttpk = 0;
      let ttc = 0;
      let tta = 0;
      let ttps = 0;
      let lod_p = 0;
      let lod_non = 0;
      let mcps = 0;
      let tcps = 0;
      let wvps = 0;
      let wwps = 0;
      let sa = 0;
      let alc = 0;
      let amc = 0;
      let ac = 0;

      // caluclate the area for graphics for the selected scenario
      let totalAreaSquereFeet = 0;
      const calcGraphics: __esri.Graphic[] = [];
      for (const layer of layers) {
        if (
          !selectedScenario ||
          layer.parentLayer?.id !== selectedScenario.layerId ||
          layer.sketchLayer.type !== 'graphics'
        ) {
          continue;
        }

        for (const graphic of layer.sketchLayer.graphics.toArray()) {
          const calcGraphic = graphic.clone();

          // calculate the area using the custom hook
          const areaSI = await calculateArea(graphic, sceneViewForArea);
          if (typeof areaSI !== 'number') {
            continue;
          }

          // convert area to square feet
          const areaSF = areaSI * 0.00694444;
          totalAreaSquereFeet = totalAreaSquereFeet + areaSF;

          // Get the number of reference surface areas that are in the actual area.
          // This is to prevent users from cheating the system by drawing larger shapes
          // then the reference surface area and it only getting counted as "1" sample.
          const { SA } = calcGraphic.attributes;
          let areaCount = 1;
          if (areaSI >= SA) {
            areaCount = Math.round(areaSI / SA);
          }

          // set the AA on the original graphic, so it is visible in the popup
          graphic.setAttribute('AA', Math.round(areaSI));
          graphic.setAttribute('AC', areaCount);

          // multiply all of the attributes by the area
          const {
            TTPK,
            TTC,
            TTA,
            TTPS,
            LOD_P,
            LOD_NON,
            MCPS,
            TCPS,
            WVPS,
            WWPS,
            ALC,
            AMC,
          } = calcGraphic.attributes;

          if (TTPK) {
            ttpk = ttpk + Number(TTPK) * areaCount;
          }
          if (TTC) {
            ttc = ttc + Number(TTC) * areaCount;
          }
          if (TTA) {
            tta = tta + Number(TTA) * areaCount;
          }
          if (TTPS) {
            ttps = ttps + Number(TTPS) * areaCount;
          }
          if (LOD_P) {
            lod_p = lod_p + Number(LOD_P);
          }
          if (LOD_NON) {
            lod_non = lod_non + Number(LOD_NON);
          }
          if (MCPS) {
            mcps = mcps + Number(MCPS) * areaCount;
          }
          if (TCPS) {
            tcps = tcps + Number(TCPS) * areaCount;
          }
          if (WVPS) {
            wvps = wvps + Number(WVPS) * areaCount;
          }
          if (WWPS) {
            wwps = wwps + Number(WWPS) * areaCount;
          }
          if (SA) {
            sa = sa + Number(SA);
          }
          if (ALC) {
            alc = alc + Number(ALC) * areaCount;
          }
          if (AMC) {
            amc = amc + Number(AMC) * areaCount;
          }
          if (areaCount) {
            ac = ac + Number(areaCount);
          }

          calcGraphics.push(calcGraphic);
        }
      }

      setTotals({
        ttpk,
        ttc,
        tta,
        ttps,
        lod_p,
        lod_non,
        mcps,
        tcps,
        wvps,
        wwps,
        sa,
        alc,
        amc,
        ac,
      });
      setCalcGraphics(calcGraphics);
      setTotalArea(totalAreaSquereFeet);
    }

    processFeatures();
  }, [edits, layers, sceneViewForArea, selectedScenario]);

  // perform non-geospatial calculations
  useEffect(() => {
    // exit early checks
    if (!selectedScenario) return;
    if (calcGraphics.length === 0 || totalArea === 0) {
      setCalculateResults({ status: 'none', panelOpen: false, data: null });
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

    // calculate spatial items
    let userSpecifiedAOI = null;
    let percentAreaSampled = null;
    if (surfaceArea > 0) {
      userSpecifiedAOI = surfaceArea;
      percentAreaSampled = (totalArea / surfaceArea) * 100;
    }

    // calculate the sampling items
    const samplingTimeHours = totals.ttpk + totals.ttc;
    const samplingHours =
      numSamplingTeams * numSamplingHours * numSamplingShifts;
    const samplingPersonnelHoursPerDay = samplingHours * numSamplingPersonnel;
    const samplingPersonnelLaborCost = samplingLaborCost / numSamplingPersonnel;
    const timeCompleteSampling = (totals.ttc + totals.ttpk) / samplingHours;
    const totalSamplingLaborCost =
      numSamplingTeams *
      numSamplingPersonnel *
      numSamplingHours *
      numSamplingShifts *
      samplingPersonnelLaborCost *
      timeCompleteSampling;

    // calculate lab throughput
    const totalLabHours = numLabs * numLabHours;
    let labThroughput = totals.tta / totalLabHours;

    // calculate total cost and time
    const totalSamplingCost = totalSamplingLaborCost + totals.mcps;
    const totalAnalysisCost = totals.alc + totals.amc;
    const totalCost = totalSamplingCost + totalAnalysisCost;

    // Calculate total time. Note: Total Time is the greater of sample collection time or Analysis Total Time.
    // If Analysis Time is equal to or greater than Sampling Total Time then the value reported is total Analysis Time Plus one day.
    // The one day accounts for the time samples get collected and shipped to the lab on day one of the sampling response.
    let totalTime = 0;
    if (labThroughput + 1 < timeCompleteSampling) {
      totalTime = timeCompleteSampling;
    } else {
      labThroughput += 1;
      totalTime = labThroughput;
    }

    // Get limiting time factor (will be undefined if they are equal)
    let limitingFactor: CalculateResultsDataType['Limiting Time Factor'] = '';
    if (timeCompleteSampling > labThroughput) {
      limitingFactor = 'Sampling';
    } else {
      limitingFactor = 'Analysis';
    }

    const resultObject: CalculateResultsDataType = {
      // assign input parameters
      'User Specified Number of Available Teams for Sampling': numSamplingTeams,
      'User Specified Personnel per Sampling Team': numSamplingPersonnel,
      'User Specified Sampling Team Hours per Shift': numSamplingHours,
      'User Specified Sampling Team Shifts per Day': numSamplingShifts,
      'User Specified Sampling Team Labor Cost': samplingLaborCost,
      'User Specified Number of Available Labs for Analysis': numLabs,
      'User Specified Analysis Lab Hours per Day': numLabHours,
      'User Specified Surface Area': surfaceArea,
      'Total Number of User-Defined Samples': calcGraphics.length,

      // assign counts
      'Total Number of Samples': totals.ac,
      'Total Sampled Area': totalArea,
      'Time to Prepare Kits': totals.ttpk,
      'Time to Collect': totals.ttc,
      'Sampling Material Cost': totals.mcps,
      'Time to Analyze': totals.tta,
      'Analysis Labor Cost': totals.alc,
      'Analysis Material Cost': totals.amc,
      'Waste Volume': totals.wvps,
      'Waste Weight': totals.wwps,

      // spatial items
      'User Specified Total AOI': userSpecifiedAOI,
      'Percent of Area Sampled': percentAreaSampled,

      // sampling
      'Total Required Sampling Time': samplingTimeHours,
      'Sampling Hours per Day': samplingHours,
      'Sampling Personnel hours per Day': samplingPersonnelHoursPerDay,
      'Sampling Personnel Labor Cost': samplingPersonnelLaborCost,
      'Time to Complete Sampling': timeCompleteSampling,
      'Total Sampling Labor Cost': totalSamplingLaborCost,
      'Total Sampling Cost': totalSamplingCost,
      'Total Analysis Cost': totalAnalysisCost,

      // analysis
      'Time to Complete Analyses': labThroughput,

      //totals
      'Total Cost': totalCost,
      'Total Time': Math.round(totalTime * 10) / 10,
      'Limiting Time Factor': limitingFactor,
    };

    // display loading spinner for 1 second
    setCalculateResults((calculateResults: CalculateResultsType) => {
      return {
        status: 'success',
        panelOpen: calculateResults.panelOpen,
        data: resultObject,
      };
    });
  }, [calcGraphics, selectedScenario, setCalculateResults, totals, totalArea]);

  // Updates the calculation context values with the inputs.
  // The intention is to update these values whenever the user navigates away from
  // the calculate resources tab or when they click the View Detailed Results button.
  useEffect(() => {
    if (!selectedScenario || !updateContextValues) return;
    setUpdateContextValues(false);

    const newSettings = {
      NUM_LABS: inputNumLabs,
      NUM_LAB_HOURS: inputNumLabHours,
      NUM_SAMPLING_HOURS: inputNumSamplingHours,
      NUM_SAMPLING_PERSONNEL: inputNumSamplingPersonnel,
      NUM_SAMPLING_SHIFTS: inputNumSamplingShifts,
      NUM_SAMPLING_TEAMS: inputNumSamplingTeams,
      SAMPLING_LABOR_COST: inputSamplingLaborCost,
      SURFACE_AREA: inputSurfaceArea,
    };

    setSelectedScenario((selectedScenario) => {
      if (selectedScenario) {
        selectedScenario.calculateSettings.current = {
          ...selectedScenario.calculateSettings.current,
          ...newSettings,
        };
      }

      return selectedScenario;
    });

    setEdits((edits) => {
      const selScenario = edits.edits.find(
        (e) => e.type === 'scenario' && e.value === selectedScenario.value,
      );
      if (!selScenario || selScenario.type !== 'scenario') return edits;

      selScenario.calculateSettings.current = {
        ...selScenario.calculateSettings.current,
        ...newSettings,
      };

      return {
        count: edits.count + 1,
        edits: edits.edits,
      };
    });
  }, [
    inputNumLabs,
    inputNumLabHours,
    inputNumSamplingHours,
    inputNumSamplingPersonnel,
    inputNumSamplingShifts,
    inputNumSamplingTeams,
    inputSamplingLaborCost,
    inputSurfaceArea,
    selectedScenario,
    setEdits,
    setSelectedScenario,
    setUpdateContextValues,
    updateContextValues,
  ]);
}

// Runs sampling plan calculations whenever the
// samples change or the variables on the calculate tab
// change.
export function useCalculateDeconPlan() {
  const {
    aoiData,
    defaultDeconSelections,
    displayDimensions,
    edits,
    layers,
    mapView,
    resultsOpen,
    sampleAttributesDecon,
    sceneView,
    sceneViewForArea,
    // selectedScenario,
    setEdits,
    setEfficacyResults,
    setJsonDownload,
  } = useContext(SketchContext);
  const { calculateResultsDecon, contaminationMap, setCalculateResultsDecon } =
    useContext(CalculateContext);
  const { services } = useLookupFiles().data;

  useEffect(() => {
    console.log('aoiData: ', aoiData);
  }, [aoiData]);

  useEffect(() => {
    view = displayDimensions === '2d' ? mapView : sceneView;
  }, [displayDimensions, mapView, sceneView]);

  // Reset the calculateResultsDecon context variable, whenever anything
  // changes that will cause a re-calculation.
  useEffect(() => {
    // exit early
    if (!hasGraphics(aoiData)) {
      setCalculateResultsDecon({
        status: 'none',
        panelOpen: false,
        data: null,
      });
      return;
    }
    // if (selectedScenario.editType === 'properties') return;

    // // to improve performance, do not perform calculations if
    // // only the scenario name/description changed
    // const { editsScenario } = findLayerInEdits(
    //   edits.edits,
    //   selectedScenario.layerId,
    // );
    // if (!editsScenario || editsScenario.editType === 'properties') return;

    setEfficacyResults(null);
    setCalculateResultsDecon((calculateResultsDecon) => {
      return {
        status: 'fetching',
        panelOpen: calculateResultsDecon.panelOpen,
        data: null,
      };
    });
    setNsiData({
      status: 'none',
      planGraphics: {},
    });

    const contamMapUpdated = view?.map.layers.find(
      (l) => l.id === 'contaminationMapUpdated',
    ) as __esri.GraphicsLayer;
    if (contamMapUpdated) contamMapUpdated.removeAll();
  }, [aoiData, setCalculateResultsDecon, setEfficacyResults]);

  const [nsiData, setNsiData] = useState<NsiData>({
    status: 'none',
    planGraphics: {},
  });

  // fetch building data for AOI
  useEffect(() => {
    if (!hasGraphics(aoiData)) return;
    if (calculateResultsDecon.status !== 'fetching') return;
    if (nsiData.status !== 'none') return;

    setNsiData({
      status: 'fetching',
      planGraphics: {},
    });

    async function fetchAoiData() {
      if (!aoiData.graphics) return;
      const features: any[] = [];
      // let totalAoiSqM = 0;
      let responseIndexes: string[] = [];
      let planGraphics: PlanGraphics = {};
      const aoiGraphics: __esri.Graphic[] = [];
      for (const planId of Object.keys(aoiData.graphics)) {
        if (!aoiData.graphics?.[planId]) return;

        aoiGraphics.push(...aoiData.graphics[planId]);
        let planAoiArea = 0;
        for (const graphic of aoiData.graphics[planId]) {
          const geometry = graphic.geometry as __esri.Polygon;

          const areaSM = await calculateArea(graphic, sceneViewForArea);
          console.log('areaSM1: ', areaSM);
          if (typeof areaSM === 'number') {
            planAoiArea += areaSM;
            // totalAoiSqM += areaSM;
            graphic.attributes.AREA = areaSM;
          }

          const dim1Rings: number[][][] = [];
          geometry.rings.forEach((dim1) => {
            const dim2Rings: number[][] = [];
            dim1.forEach((dim2) => {
              const point = new Point({
                spatialReference: {
                  wkid: 102100,
                },
                x: dim2[0],
                y: dim2[1],
              });

              dim2Rings.push([point.longitude, point.latitude]);
            });

            dim1Rings.push(dim2Rings);
          });

          responseIndexes.push(planId);

          const feature = {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: dim1Rings,
            },
          };
          features.push(feature);
        }

        if (!planGraphics.hasOwnProperty(planId)) {
          planGraphics[planId] = {
            graphics: [],
            imageGraphics: [],
            aoiArea: planAoiArea,
            buildingFootprint: 0,
            summary: {
              totalAoiSqM: planAoiArea,
              totalBuildingFootprintSqM: 0,
              totalBuildingFloorsSqM: 0,
              totalBuildingSqM: 0,
              totalBuildingExtWallsSqM: 0,
              totalBuildingIntWallsSqM: 0,
              totalBuildingRoofSqM: 0,
            },
            aoiPercentages: {
              numAois: 0,
              asphalt: 0,
              concrete: 0,
              soil: 0,
            },
          };
        } else {
          planGraphics[planId].aoiArea = planAoiArea;
          planGraphics[planId].summary.totalAoiSqM = planAoiArea;
        }
      }
      // console.log('responseIndexes: ', responseIndexes);
      // console.log('planGraphics: ', planGraphics);

      try {
        // TODO - look into adding more queries here
        await fetchBuildingData(
          aoiGraphics,
          features,
          services,
          planGraphics,
          responseIndexes,
        );

        // TODO call nsi for buildings in contamination plumes
        if (contaminationMap) {
          const contaminationLayer =
            contaminationMap.sketchLayer as __esri.GraphicsLayer;

          let planAoiArea = 0;
          for (const graphic of contaminationLayer.graphics) {
            const areaSM = await calculateArea(graphic, sceneViewForArea);
            console.log('areaSM2: ', areaSM);
            if (typeof areaSM === 'number') {
              planAoiArea += areaSM;
              // totalAoiSqM += areaSM;
              graphic.attributes.AREA = areaSM;
            }
          }

          planGraphics['contaminationMap'] = {
            graphics: [],
            imageGraphics: [],
            aoiArea: planAoiArea,
            buildingFootprint: 0,
            summary: {
              totalAoiSqM: planAoiArea,
              totalBuildingFootprintSqM: 0,
              totalBuildingFloorsSqM: 0,
              totalBuildingSqM: 0,
              totalBuildingExtWallsSqM: 0,
              totalBuildingIntWallsSqM: 0,
              totalBuildingRoofSqM: 0,
            },
            aoiPercentages: {
              numAois: 0,
              asphalt: 0,
              concrete: 0,
              soil: 0,
            },
          };

          // build list of building ids to filter on
          const buildingIds: string[] = [];
          Object.keys(planGraphics).forEach((planId) => {
            planGraphics[planId].graphics.forEach((graphic) => {
              buildingIds.push(graphic.attributes.bid);
            });
          });
          // console.log('buildingIds: ', buildingIds);

          const features: any[] = [];
          const responseIndexes: string[] = [];
          contaminationLayer.graphics.forEach((graphic) => {
            const geometry = graphic.geometry as __esri.Polygon;
            responseIndexes.push('contaminationMap');

            const dim1Rings: number[][][] = [];
            geometry.rings.forEach((dim1) => {
              const dim2Rings: number[][] = [];
              dim1.forEach((dim2) => {
                const point = new Point({
                  spatialReference: {
                    wkid: 102100,
                  },
                  x: dim2[0],
                  y: dim2[1],
                });

                dim2Rings.push([point.longitude, point.latitude]);
              });

              dim1Rings.push(dim2Rings);
            });

            const feature = {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: dim1Rings,
              },
            };
            features.push(feature);
          });

          await fetchBuildingData(
            contaminationLayer.graphics.toArray(),
            features,
            services,
            planGraphics,
            responseIndexes,
            buildingIds,
          );
        }

        setNsiData({
          status: 'success',
          planGraphics,
          // summary: {
          //   totalAoiSqM,
          //   totalBuildingFootprintSqM,
          //   totalBuildingFloorsSqM,
          //   totalBuildingSqM,
          //   totalBuildingExtWallsSqM,
          //   totalBuildingIntWallsSqM,
          //   totalBuildingRoofSqM,
          // },
          // aoiPercentages,
        });
      } catch (ex) {
        console.error(ex);
        setNsiData({
          status: 'failure',
          planGraphics: {},
          // summary: {
          //   totalAoiSqM: 0,
          //   totalBuildingFootprintSqM: 0,
          //   totalBuildingFloorsSqM: 0,
          //   totalBuildingSqM: 0,
          //   totalBuildingExtWallsSqM: 0,
          //   totalBuildingIntWallsSqM: 0,
          //   totalBuildingRoofSqM: 0,
          // },
          // aoiPercentages: {
          //   asphalt: 0,
          //   concrete: 0,
          //   soil: 0,
          // },
        });
        setCalculateResultsDecon({
          status: 'failure',
          data: null,
          panelOpen: false,
        });
      }
    }

    fetchAoiData();
  }, [
    aoiData,
    calculateResultsDecon,
    contaminationMap,
    layers,
    nsiData,
    // selectedScenario,
    sceneViewForArea,
    services,
    setCalculateResultsDecon,
  ]);

  type ContaminatedAoiAreas = { [planId: string]: { [key: number]: number } };
  const [aoiContamIntersect, setAoiContamIntersect] = useState<{
    contaminatedAoiAreas: ContaminatedAoiAreas;
    graphics: __esri.Graphic[];
  }>({
    contaminatedAoiAreas: {},
    graphics: [],
  });

  // do calculations for decon tech selection table
  useEffect(() => {
    if (
      ['none', 'success'].includes(calculateResultsDecon.status) ||
      ['none', 'failure', 'fetching'].includes(nsiData.status)
    )
      return;

    async function performAreaCalculations() {
      const contamMapUpdated = view?.map.layers.find(
        (l) => l.id === 'contaminationMapUpdated',
      ) as __esri.GraphicsLayer;
      if (contamMapUpdated) contamMapUpdated.removeAll();

      console.log('nsiData: ', nsiData);
      // if (!hasGraphics(nsiData.planGraphics)) {
      //   if (calculateResultsDecon.status !== 'none') {
      //     console.log('setting calculate results to none 2...');
      //     calculateResultsDecon({ status: 'none', panelOpen: false, data: null });
      //   }
      //   return;
      // }

      let editsCopy: EditsType = edits;
      const scenarios = editsCopy.edits.filter(
        (i) => i.type === 'scenario',
      ) as ScenarioEditsType[];

      const graphics: __esri.Graphic[] = [];
      Object.values(nsiData.planGraphics).forEach((planGraphics) => {
        graphics.push(...planGraphics.graphics);
      });

      const contaminatedAoiAreas: ContaminatedAoiAreas = {};
      const contaminationPercentages: ContaminationPercentages = {};
      const planBuildingCfu: PlanBuildingCfu = {};
      if (
        contaminationMap &&
        contaminationMap?.sketchLayer?.type === 'graphics'
      ) {
        // loop through structures
        Object.keys(nsiData.planGraphics).forEach((planId) => {
          const planGraphics = nsiData.planGraphics[planId];
          planGraphics.graphics.forEach((graphic) => {
            // loop through contamination map features
            (
              contaminationMap.sketchLayer as __esri.GraphicsLayer
            ).graphics.forEach((contamGraphic) => {
              // call intersect to see if decon app intersects contamination map
              if (
                !graphic.geometry ||
                !contamGraphic.geometry ||
                !geometryEngine.intersects(
                  graphic.geometry,
                  contamGraphic.geometry,
                )
              ) {
                return;
              }

              const { CONTAMVAL, ROOFS, FLOORS, EXTWALLS, INTWALLS } =
                contamGraphic.attributes;

              const plumeCfu = CONTAMVAL;

              // lookup decon selection
              let originalCfu = 0;
              let newCfu = 0;
              const scenario = scenarios.find((s) => s.layerId === planId);
              if (scenario) {
                // find decon tech selections
                const buildingTech = scenario.deconTechSelections?.filter((t) =>
                  t.media.includes('Building '),
                );
                buildingTech?.forEach((tech) => {
                  let mediaCfu = plumeCfu * (partitionFactors[tech.media] ?? 0);
                  if (tech.media === 'Building Roofs' && ROOFS)
                    mediaCfu = ROOFS;
                  if (tech.media === 'Building Interior Floors' && FLOORS)
                    mediaCfu = FLOORS;
                  if (tech.media === 'Building Exterior Walls' && EXTWALLS)
                    mediaCfu = EXTWALLS;
                  if (tech.media === 'Building Interior Walls' && INTWALLS)
                    mediaCfu = INTWALLS;

                  originalCfu += mediaCfu;

                  const deconTech =
                    sampleAttributesDecon[tech.deconTech?.value];
                  if (!deconTech) {
                    newCfu += mediaCfu;
                    return;
                  }

                  const { LOD_NON: contaminationRemovalFactor } =
                    sampleAttributesDecon[tech.deconTech.value];

                  const reductionFactor = parseSmallFloat(
                    1 - contaminationRemovalFactor,
                  );
                  const newMediaCfu = mediaCfu * reductionFactor;
                  newCfu += newMediaCfu;
                });
              }
              // console.log('originalCfu: ', originalCfu);
              // console.log('newCfu: ', newCfu);
              graphic.attributes.CONTAMVALPLUME = plumeCfu;
              graphic.attributes.CONTAMVALINITIAL = originalCfu;
              graphic.attributes.CONTAMVAL = newCfu;
              graphic.attributes.CONTAMUNIT =
                contamGraphic.attributes.CONTAMUNIT;
              graphic.attributes.CONTAMTYPE =
                contamGraphic.attributes.CONTAMTYPE;

              if (planBuildingCfu.hasOwnProperty(planId)) {
                planBuildingCfu[planId] += plumeCfu;
              } else {
                planBuildingCfu[planId] = plumeCfu;
              }

              // totalBuildingCfu += newCfu;
            });
          });
        });

        if (aoiData.graphics) {
          const aoiContamIntersectGraphics: __esri.Graphic[] = [];
          // partition AOI to determine where contamination is
          for (const key in Object.keys(aoiData.graphics)) {
            const planGraphics = aoiData.graphics?.[key] ?? [];
            for (const graphic of planGraphics) {
              for (const contamGraphic of (
                contaminationMap.sketchLayer as __esri.GraphicsLayer
              ).graphics) {
                const contamValue = contamGraphic.attributes
                  .CONTAMVAL as number;
                const outGeometry = geometryEngine.intersect(
                  graphic.geometry,
                  contamGraphic.geometry,
                ) as __esri.Geometry;
                if (!outGeometry) return;

                const clippedAreaM2 = await calculateArea(
                  new Graphic({ geometry: outGeometry }),
                  sceneViewForArea,
                );
                console.log('clippedAreaM2: ', clippedAreaM2);
                const currArea = contaminatedAoiAreas?.[key]?.[contamValue];
                if (typeof clippedAreaM2 === 'number') {
                  if (!contaminatedAoiAreas.hasOwnProperty(key)) {
                    contaminatedAoiAreas[key] = {};
                  }
                  contaminatedAoiAreas[key][contamValue] = currArea
                    ? currArea + clippedAreaM2
                    : clippedAreaM2;
                }

                aoiContamIntersectGraphics.push(
                  new Graphic({
                    attributes: contamGraphic.attributes,
                    geometry: outGeometry,
                  }),
                );
              }
            }
          }

          setAoiContamIntersect({
            contaminatedAoiAreas,
            graphics: aoiContamIntersectGraphics,
          });
        }
        // console.log('contaminedAoiAreas1: ', contaminatedAoiAreas);

        console.log('contaminatedAoiAreas1: ', contaminatedAoiAreas);
        console.log('contaminationPercentages1: ', contaminationPercentages);
        Object.keys(contaminatedAoiAreas).forEach((planId: any) => {
          const totalAoiSqM = nsiData.planGraphics[planId].summary.totalAoiSqM;
          Object.keys(contaminatedAoiAreas[planId]).forEach((key: any) => {
            if (!contaminationPercentages.hasOwnProperty(planId)) {
              contaminationPercentages[planId] = {};
            }
            contaminationPercentages[planId][key] =
              contaminatedAoiAreas[planId][key] / totalAoiSqM;
          });
        });

        // contaminationMap.sketchLayer.listMode = 'show';
      }
      // console.log('contaminatedAoiAreas: ', contaminatedAoiAreas);
      // console.log('contaminationPercentages: ', contaminationPercentages);

      // perform calculations off percentAOI stuff
      scenarios.forEach((scenario) => {
        const newDeconTechSelections = processScenario(
          scenario,
          nsiData,
          contaminationPercentages,
          planBuildingCfu,
          defaultDeconSelections,
        );

        // Figure out what to add graphics to
        const aoiAssessed = scenario?.layers.find(
          (l) => l.layerType === 'AOI Assessed',
        );
        const imageAnalysis = scenario?.layers.find(
          (l: any) => l.layerType === 'Image Analysis',
        );
        const deconAoi = scenario?.layers.find(
          (l: any) => l.layerType === 'Samples',
        );

        if (aoiAssessed && imageAnalysis && deconAoi) {
          const aoiAssessedLayer = layers.find(
            (l) => l.layerId === aoiAssessed.layerId,
          );
          const imageAnalysisLayer = layers.find(
            (l: any) => l.layerId === imageAnalysis.layerId,
          );
          const deconAoiLayer = layers.find(
            (l: any) => l.layerId === deconAoi.layerId,
          );

          // tie graphics and imageryGraphics to a scenario
          const planData = nsiData.planGraphics[scenario.layerId];
          if (
            aoiAssessedLayer?.sketchLayer?.type === 'graphics' &&
            planData?.graphics
          ) {
            aoiAssessedLayer?.sketchLayer.graphics.removeAll();
            aoiAssessedLayer?.sketchLayer.graphics.addMany(
              planData.graphics,
              // .map((g) => {
              //   if (!g.attributes.CONTAMTYPE || !hasDeconTech) return g;

              //   const newG = g.clone();
              //   newG.symbol = new TextSymbol({
              //     ...baseBuildingSymbolProps,
              //     color:
              //       g.attributes.CONTAMVAL < detectionLimit ? 'green' : 'red',
              //   });

              //   return newG;
              // }),
            );
          }
          if (
            imageAnalysisLayer?.sketchLayer?.type === 'graphics' &&
            planData?.imageGraphics
          ) {
            imageAnalysisLayer?.sketchLayer.graphics.removeAll();
            imageAnalysisLayer?.sketchLayer.graphics.addMany(
              planData.imageGraphics,
            );
          }
          if (deconAoiLayer) {
            deconAoiLayer.sketchLayer.visible = false;
          }

          scenario.deconTechSelections = newDeconTechSelections;
        }
      });

      setEdits(editsCopy);
    }

    performAreaCalculations();
  }, [
    aoiData,
    calculateResultsDecon,
    contaminationMap,
    defaultDeconSelections,
    edits,
    layers,
    nsiData,
    sampleAttributesDecon,
    // selectedScenario,
    // setCalculateResultsDecon,
    sceneViewForArea,
    setEdits,
    setJsonDownload,
  ]);

  // perform final calcs
  useEffect(() => {
    if (
      ['none', 'success'].includes(calculateResultsDecon.status) ||
      nsiData.status !== 'success'
    )
      return;

    let editsCopy: EditsType = edits;
    const scenarios = editsCopy.edits.filter(
      (i) => i.type === 'scenario',
    ) as ScenarioEditsType[];

    // let hasAllDeconTechSelections = true;
    // scenarios.forEach((scenario) => {
    //   if (scenario.deconTechSelections.length === 0)
    //     hasAllDeconTechSelections = false;

    //   let atleastOneSelected = false;
    //   scenario.deconTechSelections.forEach((tech) => {
    //     if (tech.deconTech) atleastOneSelected = true;
    //   });
    //   if (!atleastOneSelected) hasAllDeconTechSelections = false;
    // });
    // console.log('hasAllDeconTechSelections: ', hasAllDeconTechSelections);
    // if (!hasAllDeconTechSelections) {
    //   setCalculateResultsDecon({ status: 'none', panelOpen: false, data: null });
    //   return;
    // }
    let atLeastOneDeconTechSelection = false;
    scenarios.forEach((scenario) => {
      scenario.deconTechSelections?.forEach((tech) => {
        if (tech.deconTech) atLeastOneDeconTechSelection = true;
      });
    });
    // console.log('atLeastOneDeconTechSelection: ', atLeastOneDeconTechSelection);
    if (!atLeastOneDeconTechSelection) {
      setCalculateResultsDecon({
        status: 'none',
        panelOpen: false,
        data: null,
      });
      return;
    }

    const jsonDownload: JsonDownloadType[] = [];

    // perform calculations off percentAOI stuff
    // let totalFinalContam = 0;
    let totalSolidWasteM3 = 0;
    let totalLiquidWasteM3 = 0;
    let totalSolidWasteMass = 0;
    let totalLiquidWasteMass = 0;
    let totalDeconCost = 0;
    let totalApplicationTime = 0;
    let totalResidenceTime = 0;
    let totalDeconTime = 0;
    console.log('sampleAttributesDecon: ', sampleAttributesDecon);
    scenarios.forEach((scenario) => {
      if (!scenario.deconLayerResults) return;
      scenario.deconLayerResults.resultsTable = [];
      scenario.deconLayerResults.cost = 0;
      scenario.deconLayerResults.time = 0;
      scenario.deconLayerResults.wasteMass = 0;
      scenario.deconLayerResults.wasteVolume = 0;
      const curDeconTechSelections =
        scenario.deconTechSelections && scenario.deconTechSelections?.length > 0
          ? scenario.deconTechSelections
          : defaultDeconSelections;
      curDeconTechSelections.forEach((sel) => {
        // find decon settings
        const deconTech = sel.deconTech?.value;
        const media = sel.media;
        if (!deconTech) {
          sel.avgFinalContamination = sel.avgCfu;
          sel.aboveDetectionLimit = sel.avgCfu >= detectionLimit;
          return;
        }

        // need to lookup stuff from sampleAttributesDecon
        console.log(
          `deconTech: ${deconTech} | attr: ${sampleAttributesDecon[deconTech as any]}`,
        );
        const {
          LOD_NON: contaminationRemovalFactor,
          MCPS: setupCost,
          TCPS: costM2,
          WVPS: solidWasteVolume,
          WWPS: solidWasteM,
          ALC: liquidWasteVolume,
          AMC: liquidWasteM,
          TTC: applicationTimeHrs,
          TTA: residenceTimeHrs,
        } = sampleAttributesDecon[deconTech as any];

        // calculate final contamination
        const contamLeftFactor = 1 - contaminationRemovalFactor;
        const avgFinalContam =
          sel.avgCfu * Math.pow(contamLeftFactor, sel.numApplications);
        sel.avgFinalContamination = avgFinalContam;
        sel.aboveDetectionLimit = avgFinalContam >= detectionLimit;

        // const surfaceArea * (sel.pctDeconed * 0.01) * sel.numApplications;
        const areaDeconApplied =
          sel.surfaceArea * (sel.pctDeconed * 0.01) * sel.numApplications;
        const solidWasteM3 = areaDeconApplied * solidWasteVolume;
        const solidWasteMass = areaDeconApplied * solidWasteM;
        const liquidWasteM3 = areaDeconApplied * liquidWasteVolume;
        const liquidWasteMass = areaDeconApplied * liquidWasteM;

        const deconCost =
          setupCost * sel.numApplications + areaDeconApplied * costM2;
        const sumApplicationTime =
          (areaDeconApplied * applicationTimeHrs) /
          24 /
          sel.numConcurrentApplications;
        const sumResidenceTime =
          (residenceTimeHrs * sel.numApplications) /
          24 /
          sel.numConcurrentApplications;
        const deconTime = sumApplicationTime + sumResidenceTime;

        const jsonItem = {
          contaminationScenario: media,
          decontaminationTechnology: deconTech,
          solidWasteVolumeM3: solidWasteM3,
          liquidWasteVolumeM3: liquidWasteM3,
          decontaminationCost: deconCost,
          decontaminationTimeDays: deconTime,
          averageInitialContamination: sel.avgCfu,
          averageFinalContamination: sel.avgFinalContamination,
          aboveDetectionLimit: sel.aboveDetectionLimit,
        };

        jsonDownload.push(jsonItem);

        if (scenario.deconLayerResults) {
          scenario.deconLayerResults.cost += deconCost;
          scenario.deconLayerResults.time += deconTime;
          scenario.deconLayerResults.wasteVolume +=
            solidWasteM3 + liquidWasteM3;
          scenario.deconLayerResults.wasteMass +=
            solidWasteMass + liquidWasteMass;
          scenario.deconLayerResults.resultsTable.push(jsonItem);
        }

        // totalFinalContam += avgFinalContam;
        totalSolidWasteM3 += solidWasteM3;
        totalSolidWasteMass += solidWasteMass;
        totalLiquidWasteM3 += liquidWasteM3;
        totalLiquidWasteMass += liquidWasteMass;
        totalDeconCost += deconCost;
        totalApplicationTime += sumApplicationTime;
        totalResidenceTime += sumResidenceTime;
        totalDeconTime += deconTime;
      });
    });

    const jsonDownloadSummarized: JsonDownloadType[] = [];
    const scenariosIncluded: string[] = [];
    jsonDownload.forEach((item) => {
      if (scenariosIncluded.includes(item.contaminationScenario)) return;
      scenariosIncluded.push(item.contaminationScenario);
    });
    scenariosIncluded.forEach((scenario) => {
      const scenarioItems = jsonDownload.filter(
        (j) => j.contaminationScenario === scenario,
      );

      const tech: { [deconTech: string]: JsonDownloadType } = {};
      scenarioItems.forEach((item) => {
        const deconTech = item.decontaminationTechnology;
        if (tech.hasOwnProperty(deconTech)) {
          tech[deconTech].decontaminationCost += item.decontaminationCost;
          tech[deconTech].decontaminationTimeDays +=
            item.decontaminationTimeDays;
          tech[deconTech].solidWasteVolumeM3 += item.solidWasteVolumeM3;
          tech[deconTech].liquidWasteVolumeM3 += item.liquidWasteVolumeM3;
        } else {
          tech[deconTech] = {
            ...item,
          };
        }
      });

      Object.values(tech).forEach((deconTech) => {
        jsonDownloadSummarized.push(deconTech);
      });
    });

    const resultObject: CalculateResultsDeconDataType = {
      // assign input parameters
      // 'User Specified Number of Available Teams for Decon': numSamplingTeams,
      // 'User Specified Personnel per Decon Team': numSamplingPersonnel,
      // 'User Specified Decon Team Hours per Shift': numSamplingHours,
      // 'User Specified Decon Team Shifts per Day': numSamplingShifts,
      // 'User Specified Decon Team Labor Cost': samplingLaborCost,
      // 'User Specified Number of Available Labs for Analysis': numLabs,
      // 'User Specified Analysis Lab Hours per Day': numLabHours,
      // 'User Specified Surface Area': surfaceArea,
      'Total Number of User-Defined Decon Technologies': 0, // calcGraphics.length,
      'User Specified Number of Concurrent Applications': 0, //numSamplingTeams,

      // assign counts
      'Total Number of Decon Applications': 0, //totals.ac,
      'Total Decontamination Area': 0, //totalArea,
      'Total Setup Time': 0, //s,
      'Total Application Time': totalApplicationTime,
      'Total Residence Time': totalResidenceTime,
      'Average Contamination Removal': 0, //(totals.lod_non / calcGraphics.length) * 100,
      'Total Setup Cost': 0, //sc,
      'Total Application Cost': 0, //cm,
      'Solid Waste Volume': totalSolidWasteM3,
      'Solid Waste Mass': totalSolidWasteMass,
      'Liquid Waste Volume': totalLiquidWasteM3,
      'Liquid Waste Mass': totalLiquidWasteMass,
      'Total Waste Volume': totalSolidWasteM3 + totalLiquidWasteM3,
      'Total Waste Mass': totalSolidWasteMass + totalLiquidWasteMass,

      // spatial items
      // 'User Specified Total AOI': userSpecifiedAOI,
      // 'Percent of Area Sampled': percentAreaSampled,

      // sampling
      // 'Total Required Decon Time': samplingTimeHours,
      // 'Decon Hours per Day': samplingHours,
      // 'Decon Personnel hours per Day': samplingPersonnelHoursPerDay,
      // 'Decon Personnel Labor Cost': samplingPersonnelLaborCost,
      // 'Time to Complete Decon': timeCompleteSampling,
      // 'Total Decon Labor Cost': totalSamplingLaborCost,
      // 'Total Decon Cost': totalSamplingCost,
      // 'Total Analysis Cost': totalAnalysisCost,

      // // analysis
      // 'Time to Complete Analyses': labThroughput,

      //totals
      'Total Cost': totalDeconCost,
      'Total Time': Math.round(totalDeconTime * 10) / 10,
      // 'Limiting Time Factor': limitingFactor,
      'Total Contaminated Area': 0, //totals.totalContaminatedArea,
      'Total Reduction Area': 0, //totals.totalDeconReductionArea,
      'Total Remaining Contaminated Area': 0, //contaminatedAreaRemaining,
      'Total Decontaminated Area': 0, //totals.totalDecontaminatedArea,
      'Percent Contaminated Remaining': 0, //(contaminatedAreaRemaining / totals.totalContaminatedArea) * 100,
      'Contamination Type': '', //totals.contaminationType,
      resultsTable: jsonDownloadSummarized,
    };

    scenarios.forEach((scenario) => {
      scenario.deconSummaryResults = {
        summary: nsiData.planGraphics?.[scenario.layerId]?.summary,
        aoiPercentages:
          nsiData.planGraphics?.[scenario.layerId]?.aoiPercentages,
        calculateResults: resultObject,
      };
    });

    // console.log('resultObject: ', resultObject);
    // console.log('jsonDownload: ', jsonDownload);

    setEdits(editsCopy);

    setJsonDownload(jsonDownloadSummarized);

    // display loading spinner for 1 second
    setCalculateResultsDecon((calculateResultsDecon) => {
      return {
        status: 'success',
        panelOpen: calculateResultsDecon.panelOpen,
        data: resultObject,
      };
    });
  }, [
    aoiData,
    calculateResultsDecon,
    contaminationMap,
    defaultDeconSelections,
    edits,
    layers,
    nsiData,
    sampleAttributesDecon,
    // selectedScenario,
    setCalculateResultsDecon,
    setEdits,
    setJsonDownload,
  ]);

  useEffect(() => {
    if (!resultsOpen) return;
    if (calculateResultsDecon.status === 'failure') return;

    async function performCalculations() {
      const planId = 'contaminationMap';
      const planGraphics = nsiData.planGraphics[planId];

      const contaminationGraphicsClone: __esri.Graphic[] = [];
      const contaminatedAoiAreas: ContaminationPercentages = { [planId]: {} };
      const contaminationPercentages: ContaminationPercentages = {
        [planId]: {},
      };
      const planBuildingCfu: PlanBuildingCfu = { [planId]: 0 };
      if (
        contaminationMap &&
        contaminationMap.sketchLayer.type === 'graphics'
      ) {
        // loop through structures
        planGraphics.graphics.forEach((graphic) => {
          // loop through contamination map features
          (
            contaminationMap.sketchLayer as __esri.GraphicsLayer
          ).graphics.forEach((contamGraphic) => {
            // call intersect to see if decon app intersects contamination map
            if (
              !graphic.geometry ||
              !contamGraphic.geometry ||
              !geometryEngine.intersects(
                graphic.geometry,
                contamGraphic.geometry,
              )
            ) {
              return;
            }

            const { CONTAMVAL, ROOFS, FLOORS, EXTWALLS, INTWALLS } =
              contamGraphic.attributes;

            // lookup decon selection
            let originalCfu = 0;
            let newCfu = 0;
            // find decon tech selections
            const buildingTech = defaultDeconSelections.filter((t) =>
              t.media.includes('Building '),
            );
            buildingTech.forEach((tech) => {
              let mediaCfu = CONTAMVAL * (partitionFactors[tech.media] ?? 0);
              if (tech.media === 'Building Roofs' && ROOFS) mediaCfu = ROOFS;
              if (tech.media === 'Building Interior Floors' && FLOORS)
                mediaCfu = FLOORS;
              if (tech.media === 'Building Exterior Walls' && EXTWALLS)
                mediaCfu = EXTWALLS;
              if (tech.media === 'Building Interior Walls' && INTWALLS)
                mediaCfu = INTWALLS;

              originalCfu += mediaCfu;
              newCfu += mediaCfu;
            });
            // console.log('originalCfu: ', originalCfu);
            // console.log('newCfu: ', newCfu);
            graphic.attributes.CONTAMVALPLUME = CONTAMVAL;
            graphic.attributes.CONTAMVALINITIAL = originalCfu;
            graphic.attributes.CONTAMVAL = newCfu;
            graphic.attributes.CONTAMUNIT = contamGraphic.attributes.CONTAMUNIT;
            graphic.attributes.CONTAMTYPE = contamGraphic.attributes.CONTAMTYPE;

            if (planBuildingCfu.hasOwnProperty(planId)) {
              planBuildingCfu[planId] += CONTAMVAL;
            } else {
              planBuildingCfu[planId] = CONTAMVAL;
            }

            // totalBuildingCfu += newCfu;
          });
        });
        // console.log('planGraphics: ', planGraphics);

        contaminationMap.sketchLayer.graphics.forEach((graphic) => {
          contaminationGraphicsClone.push(graphic.clone());
          const contamValue = graphic.attributes.CONTAMVAL;
          const currArea = graphic.attributes.AREA;
          // console.log('contamValue: ', contamValue);
          // console.log('currArea: ', currArea);

          // TODO - May need to make this total CFU/m2 instead of average
          planBuildingCfu[planId] += contamValue;

          if (!contaminatedAoiAreas.hasOwnProperty(planId)) {
            contaminatedAoiAreas[planId] = {};
          }
          if (!contaminatedAoiAreas[planId].hasOwnProperty(contamValue)) {
            contaminatedAoiAreas[planId][contamValue] = 0;
          }
          contaminatedAoiAreas[planId][contamValue] += currArea;
        });

        console.log('contaminatedAoiAreas2: ', contaminatedAoiAreas);
        console.log('contaminationPercentages2: ', contaminationPercentages);
        Object.keys(contaminatedAoiAreas).forEach((planId: any) => {
          const totalAoiSqM = nsiData.planGraphics[planId].summary.totalAoiSqM;
          Object.keys(contaminatedAoiAreas[planId]).forEach((key: any) => {
            if (!contaminationPercentages.hasOwnProperty(planId)) {
              contaminationPercentages[planId] = {};
            }
            contaminationPercentages[planId][key] =
              contaminatedAoiAreas[planId][key] / totalAoiSqM;
          });
        });
      }

      // console.log('planGraphics: ', planGraphics);

      const newDeconTechSelections = processScenario(
        'contaminationMap',
        nsiData,
        contaminationPercentages,
        planBuildingCfu,
        defaultDeconSelections,
      );

      let cfuReductionBuildings = 0;
      let cfuReductionSurfaces = 0;
      const scenarios = edits.edits.filter(
        (i) => i.type === 'scenario',
      ) as ScenarioEditsType[];
      let newContamGraphics: __esri.Graphic[] = [];
      for (const scenario of scenarios) {
        // tie graphics and imageryGraphics to a scenario
        const planData = nsiData.planGraphics[scenario.layerId];

        // lookup aoi layer
        // const aoiGraphics = aoiData.graphics?.[scenario.layerId] ?? [];

        const deconAoi = scenario?.layers.find(
          (l: any) => l.layerType === 'Samples',
        );
        const deconAoiLayer = deconAoi
          ? layers.find((l: any) => l.layerId === deconAoi.layerId)
          : null;

        const curDeconTechSelections =
          scenario.deconTechSelections &&
          scenario.deconTechSelections?.length > 0
            ? scenario.deconTechSelections
            : defaultDeconSelections;
        let hasDeconTech = false;

        const aoiLayerGraphics =
          deconAoiLayer && deconAoiLayer.sketchLayer.type === 'graphics'
            ? deconAoiLayer.sketchLayer.graphics.toArray()
            : [];
        for (const graphic of aoiLayerGraphics) {
          const currContamGraphics =
            newContamGraphics.length > 0
              ? [...newContamGraphics]
              : contaminationGraphicsClone;
          newContamGraphics = [];
          for (const contamGraphic of currContamGraphics) {
            // console.log('graphic: ', graphic);
            // console.log('contamGraphic: ', contamGraphic);
            // call intersect to see if decon app intersects contamination map
            if (
              !graphic.geometry ||
              !contamGraphic.geometry ||
              !geometryEngine.intersects(
                graphic.geometry,
                contamGraphic.geometry,
              )
            ) {
              console.log('no intersection...');
              contamGraphic.attributes.INTWALLS = null;
              contamGraphic.attributes.EXTWALLS = null;
              contamGraphic.attributes.ROOFS = null;
              contamGraphic.attributes.FLOORS = null;
              newContamGraphics.push(contamGraphic);
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
              : geometryEngine.difference(
                  contamGraphic.geometry,
                  graphic.geometry,
                );
            // console.log('newOuterContamGeometry: ', newOuterContamGeometry);

            // create new geometry to fill in the hole
            const newInnerContamGeometry = geometryEngine.intersect(
              graphic.geometry,
              contamGraphic.geometry,
            );
            const innerGeometry = Array.isArray(newInnerContamGeometry)
              ? newInnerContamGeometry
              : [newInnerContamGeometry];
            const contamVal = contamGraphic.attributes.CONTAMVAL;

            let CONTAMVALINTWALLS = contamGraphic.attributes.INTWALLS;
            let CONTAMVALEXTWALLS = contamGraphic.attributes.EXTWALLS;
            let CONTAMVALROOFS = contamGraphic.attributes.ROOFS;
            let CONTAMVALFLOORS = contamGraphic.attributes.FLOORS;
            let totalSurfaceRemovalFactor = 0;
            let surfaceRemovalCount = 0;
            for (const sel of curDeconTechSelections) {
              if (sel.deconTech) hasDeconTech = true;

              // const avgFinal = sel.avgFinalContamination;
              if (sel.media.includes('Building')) {
                for (const graphic of planData.graphics) {
                  if (!graphic.attributes.CONTAMTYPE) return;
                  if (
                    !graphic.geometry ||
                    !contamGraphic.geometry ||
                    !geometryEngine.intersects(
                      graphic.geometry,
                      contamGraphic.geometry,
                    )
                  ) {
                    return;
                  }

                  const plumeCfu = graphic.attributes.CONTAMVALPLUME;
                  let mediaCfu = plumeCfu * (partitionFactors[sel.media] ?? 0);

                  let area = 0;
                  if (sel.media === 'Building Roofs') {
                    area = graphic.attributes.roofSqM;
                    if (contamGraphic.attributes.ROOFS)
                      mediaCfu = contamGraphic.attributes.ROOFS;
                  }
                  if (sel.media === 'Building Interior Floors') {
                    area = graphic.attributes.floorsSqM;
                    if (contamGraphic.attributes.FLOORS)
                      mediaCfu = contamGraphic.attributes.FLOORS;
                  }
                  if (sel.media === 'Building Exterior Walls') {
                    area = graphic.attributes.extWallsSqM;
                    if (contamGraphic.attributes.EXTWALLS)
                      mediaCfu = contamGraphic.attributes.EXTWALLS;
                  }
                  if (sel.media === 'Building Interior Walls') {
                    area = graphic.attributes.intWallsSqM;
                    if (contamGraphic.attributes.INTWALLS)
                      mediaCfu = contamGraphic.attributes.INTWALLS;
                  }

                  let cfu = mediaCfu * area;

                  const deconTech = sampleAttributesDecon[sel.deconTech?.value];
                  if (!deconTech) return;

                  const { LOD_NON: contaminationRemovalFactor } =
                    sampleAttributesDecon[sel.deconTech.value];
                  const avgReduction = cfu * contaminationRemovalFactor;
                  cfuReductionBuildings += avgReduction;

                  const contamReductionFactor = parseSmallFloat(
                    1 - contaminationRemovalFactor,
                  );
                  const avgCfu = mediaCfu * contamReductionFactor;
                  if (sel.media === 'Building Roofs') CONTAMVALROOFS = avgCfu;
                  if (sel.media === 'Building Interior Floors')
                    CONTAMVALFLOORS = avgCfu;
                  if (sel.media === 'Building Exterior Walls')
                    CONTAMVALEXTWALLS = avgCfu;
                  if (sel.media === 'Building Interior Walls')
                    CONTAMVALINTWALLS = avgCfu;
                }
              } else {
                surfaceRemovalCount += 1;
                if (!sel.pctAoi || !sel.deconTech) return; // || !areaContamReduced) return;

                // console.log('sel.media: ', sel.media);

                const { LOD_NON: contaminationRemovalFactor } =
                  sampleAttributesDecon[sel.deconTech.value];
                totalSurfaceRemovalFactor += contaminationRemovalFactor;
                const pctAoi = (planGraphics.aoiPercentages as any)[
                  (mediaToBeepEnum as any)[sel.media]
                ] as number;
                // console.log('pctAoi: ', pctAoi);
                const pctFactor = pctAoi * 0.01;
                // console.log('pctFactor: ', pctFactor);

                // let buildingFootprint = 0;
                // let contaminatedSurfaceArea = 0;
                let totalCfu = 0;
                for (const contamGraphic of innerGeometry) {
                  let buildingFootprint = 0;
                  planData.graphics.forEach((graphic) => {
                    if (
                      !graphic.geometry ||
                      !contamGraphic ||
                      !geometryEngine.intersects(
                        graphic.geometry,
                        contamGraphic,
                      )
                    ) {
                      return;
                    }

                    buildingFootprint += graphic.attributes.footprintSqM;
                  });

                  // console.log('contaminatedSurfaceArea: ', contaminatedSurfaceArea);
                  // console.log('buildingFootprint: ', buildingFootprint);
                  // const nonBuildingArea = contaminatedSurfaceArea - buildingFootprint;
                  // console.log('nonBuildingArea: ', nonBuildingArea);

                  const area = await calculateArea(
                    new Graphic({ geometry: contamGraphic }),
                    sceneViewForArea,
                  );
                  console.log('area1: ', area);
                  if (typeof area !== 'number') return;

                  // contaminatedSurfaceArea += area;

                  const surfaceArea = area - buildingFootprint;
                  const areaMedia = surfaceArea * pctFactor;
                  totalCfu +=
                    areaMedia * (contamVal * contaminationRemovalFactor);
                }

                // const surfaceArea = nonBuildingArea * pctFactor;
                // console.log('surfaceArea: ', surfaceArea);

                cfuReductionSurfaces += totalCfu;
              }
            }

            const avgSurfaceRemovalFactor =
              totalSurfaceRemovalFactor / surfaceRemovalCount;
            const avgSurfaceReductionFactor = parseSmallFloat(
              1 - avgSurfaceRemovalFactor,
            );
            console.log(
              'contamGraphic.attributes.CONTAMVAL: ',
              contamGraphic.attributes.CONTAMVAL,
            );
            console.log(
              'avgSurfaceReductionFactor: ',
              avgSurfaceReductionFactor,
            );
            const CONTAMVAL =
              contamGraphic.attributes.CONTAMVAL * avgSurfaceReductionFactor;

            if (newOuterContamGeometry) {
              const geometry = Array.isArray(newOuterContamGeometry)
                ? newOuterContamGeometry
                : [newOuterContamGeometry];
              if (geometry.length > 0) console.log('adding outer...');
              for (const geom of geometry) {
                newContamGraphics.push(
                  new Graphic({
                    attributes: {
                      ...contamGraphic.attributes,
                      INTWALLS: null,
                      EXTWALLS: null,
                      ROOFS: null,
                      FLOORS: null,
                    },
                    geometry: geom,
                    symbol: contamGraphic.symbol,
                    popupTemplate: {
                      title: '',
                      content: contaminationMapPopup,
                    },
                  }),
                );
              }
            }

            if (innerGeometry.length > 0) console.log('adding inner...');
            for (const geom of innerGeometry) {
              let newCfu = CONTAMVAL;
              if (CONTAMVALEXTWALLS > newCfu) newCfu = CONTAMVALEXTWALLS;
              if (CONTAMVALINTWALLS > newCfu) newCfu = CONTAMVALINTWALLS;
              if (CONTAMVALROOFS > newCfu) newCfu = CONTAMVALROOFS;
              if (CONTAMVALFLOORS > newCfu) newCfu = CONTAMVALFLOORS;

              newContamGraphics.push(
                new Graphic({
                  attributes: {
                    ...contamGraphic.attributes,
                    CONTAMVAL, // plume reductions
                    INTWALLS: CONTAMVALINTWALLS,
                    EXTWALLS: CONTAMVALEXTWALLS,
                    ROOFS: CONTAMVALROOFS,
                    FLOORS: CONTAMVALFLOORS,
                  },
                  geometry: geom,
                  symbol: !window.location.search.includes('devMode=true')
                    ? contamGraphic.symbol
                    : newCfu < detectionLimit
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
            }
          }
        }

        const aoiAssessed = scenario?.layers.find(
          (l) => l.layerType === 'AOI Assessed',
        );

        if (aoiAssessed) {
          const aoiAssessedLayer = layers.find(
            (l) => l.layerId === aoiAssessed.layerId,
          );

          if (
            aoiAssessedLayer?.sketchLayer?.type === 'graphics' &&
            planData?.graphics
          ) {
            aoiAssessedLayer?.sketchLayer.graphics.removeAll();
            aoiAssessedLayer?.sketchLayer.graphics.addMany(
              planData.graphics.map((g) => {
                if (!g.attributes.CONTAMTYPE || !hasDeconTech) return g;

                const newG = g.clone();
                let props = {
                  ...baseBuildingSymbolProps,
                };
                if (window.location.search.includes('devMode=true')) {
                  props.color =
                    g.attributes.CONTAMVAL < detectionLimit ? 'green' : 'red';
                }
                newG.symbol = new TextSymbol(props);

                return newG;
              }),
            );
          }
        }
      }

      const contamMapUpdated = view?.map.layers.find(
        (l) => l.id === 'contaminationMapUpdated',
      ) as __esri.GraphicsLayer;
      console.log('contamMapUpdated: ', contamMapUpdated);
      if (contamMapUpdated) {
        console.log('newContamGraphics: ', newContamGraphics);
        contamMapUpdated.removeAll();
        contamMapUpdated.addMany(newContamGraphics);
        if (window.location.search.includes('devMode=true'))
          contamMapUpdated.listMode = 'show';
      }

      console.log('cfuReductionBuildings: ', cfuReductionBuildings);
      console.log('cfuReductionSurfaces: ', cfuReductionSurfaces);
      const cfuReduction = cfuReductionBuildings + cfuReductionSurfaces;

      console.log('aoiContamIntersect: ', aoiContamIntersect);
      console.log('contaminatedAoiAreas: ', contaminatedAoiAreas);
      console.log('contaminationPercentages: ', contaminationPercentages);
      console.log('planBuildingCfu: ', planBuildingCfu);
      console.log('newDeconTechSelections: ', newDeconTechSelections);

      const {
        totalAoiSqM,
        totalBuildingFootprintSqM,
        // totalBuildingFloorsSqM,
        // // totalBuildingSqM,
        // totalBuildingExtWallsSqM,
        // totalBuildingIntWallsSqM,
        // totalBuildingRoofSqM,
      } = planGraphics.summary;
      console.log('totalAoiSqM: ', totalAoiSqM);
      console.log('totalBuildingFootprintSqM: ', totalBuildingFootprintSqM);
      const nonBuildingArea = totalAoiSqM - totalBuildingFootprintSqM;
      console.log('nonBuildingArea: ', nonBuildingArea);

      let buildingCfu = 0;
      let buildingSurfaceArea = 0;
      nsiData.planGraphics[planId].graphics.forEach((graphic) => {
        // find decon tech selections
        const buildingTech = defaultDeconSelections.filter((t) =>
          t.media.includes('Building '),
        );
        buildingTech.forEach((tech) => {
          const plumeCfu = graphic.attributes.CONTAMVALPLUME;
          const mediaCfu = plumeCfu * (partitionFactors[tech.media] ?? 0);

          let area = 0;
          if (tech.media === 'Building Roofs') {
            area = graphic.attributes.roofSqM;
          }
          if (tech.media === 'Building Interior Floors') {
            area = graphic.attributes.floorsSqM;
          }
          if (tech.media === 'Building Exterior Walls') {
            area = graphic.attributes.extWallsSqM;
          }
          if (tech.media === 'Building Interior Walls') {
            area = graphic.attributes.intWallsSqM;
          }

          buildingCfu += mediaCfu * area;
        });

        // console.log('attributes: ', graphic.attributes);
        // const mediaCfu = plumeCfu * (partitionFactors[tech.media] ?? 0);
        buildingSurfaceArea += graphic.attributes.totalSqM;
        // buildingCfu +=
        //   graphic.attributes.CONTAMVALINITIAL * graphic.attributes.totalSqM;
      });

      let surfaceCfu = 0;
      let nonBuildingSurfaceArea = 0;
      for (const sel of newDeconTechSelections) {
        if (!sel.pctAoi) return;

        const pctAoi = (planGraphics.aoiPercentages as any)[
          (mediaToBeepEnum as any)[sel.media]
        ] as number;
        // console.log('pctAoi: ', pctAoi);
        const pctFactor = pctAoi * 0.01;
        // console.log('pctFactor: ', pctFactor);

        // let buildingFootprint = 0;
        // let contaminatedSurfaceArea  = 0;
        let totalCfu = 0;
        if (
          contaminationMap &&
          contaminationMap.sketchLayer.type === 'graphics'
        ) {
          for (const contamGraphic of contaminationMap.sketchLayer.graphics) {
            let buildingFootprint = 0;
            planGraphics.graphics.forEach((graphic) => {
              if (
                !graphic.geometry ||
                !contamGraphic.geometry ||
                !geometryEngine.intersects(
                  graphic.geometry,
                  contamGraphic.geometry,
                )
              ) {
                return;
              }

              buildingFootprint += graphic.attributes.footprintSqM;
            });

            // console.log('contaminatedSurfaceArea: ', contaminatedSurfaceArea);
            // console.log('buildingFootprint: ', buildingFootprint);
            // const nonBuildingArea = contaminatedSurfaceArea - buildingFootprint;
            // console.log('nonBuildingArea: ', nonBuildingArea);

            const area = await calculateArea(contamGraphic, sceneViewForArea);
            console.log('area2: ', area);
            if (typeof area !== 'number') return;

            // contaminatedSurfaceArea += area;

            const surfaceArea = area - buildingFootprint;
            const areaMedia = surfaceArea * pctFactor;
            totalCfu += areaMedia * contamGraphic.attributes.CONTAMVAL;
          }
        }

        surfaceCfu += totalCfu;
      }

      console.log('buildingSurfaceArea: ', buildingSurfaceArea);
      console.log('nonBuildingSurfaceArea: ', nonBuildingSurfaceArea);
      console.log('buildingCfu: ', buildingCfu);
      console.log('surfaceCfu: ', surfaceCfu);
      const totalInitialCfu = buildingCfu + surfaceCfu;
      console.log('totalInitialCfu: ', totalInitialCfu);
      console.log('cfuReduction: ', cfuReduction);

      console.log('cfuReductionSurfaces: ', cfuReductionSurfaces);
      console.log('finalBuildingsCfu: ', buildingCfu - cfuReductionBuildings);
      console.log('finalSurfacesCfu: ', surfaceCfu - cfuReductionSurfaces);

      const totalFinalCfu = totalInitialCfu - cfuReduction;

      const totalArea = buildingSurfaceArea + nonBuildingSurfaceArea;
      const averageInitialCfu = totalInitialCfu / totalArea;
      const averageFinalCfu = totalFinalCfu / totalArea;

      console.log('totalFinalCfu: ', totalFinalCfu);
      setEfficacyResults({
        averageInitialCfu,
        averageFinalCfu,
      });
    }

    performCalculations();
  }, [
    aoiData,
    aoiContamIntersect,
    calculateResultsDecon,
    contaminationMap,
    defaultDeconSelections,
    edits,
    layers,
    nsiData,
    resultsOpen,
    sampleAttributesDecon,
    sceneViewForArea,
    setEfficacyResults,
  ]);

  useEffect(() => {
    if (!resultsOpen || !contaminationMap) return;
    if (window.location.search.includes('devMode=true'))
      contaminationMap.sketchLayer.listMode = 'show';
  }, [contaminationMap, resultsOpen]);

  useEffect(() => {
    console.log('calculateResultsDecon: ', calculateResultsDecon);
  }, [calculateResultsDecon]);
}

// Allows using a dynamicPopup that has access to react state/context.
// This is primarily needed for sample popups.
export function useDynamicPopup(appType: AppType) {
  const { edits, setEdits, layers } = useContext(SketchContext);
  const layerProps = useLookupFiles().data.layerProps;

  const getSampleTemplate = (
    feature: any,
    fieldInfos: FieldInfos,
    includeControls: boolean,
  ) => {
    const content = (
      <MapPopup
        appType={appType}
        features={[feature]}
        edits={edits}
        setEdits={setEdits}
        layers={layers}
        fieldInfos={fieldInfos}
        layerProps={layerProps}
        includeControls={includeControls}
        onClick={handlePopupClick}
      />
    );

    // wrap the content for esri
    const contentContainer = document.createElement('div');
    createRoot(contentContainer).render(content);

    return contentContainer;
  };

  /**
   * Creates a popup that contains all of the attributes with human readable labels.
   * The attributes displayed depends on the type provided.
   * Note: Reference layers will return an empty object. Reference layers should not use
   *  this function for getting the popup.
   *
   * @param type - The layer type to get the popup for.
   * @param includeContaminationFields - If true the contamination map fields will be included in the samples popups.
   * @returns the json object or function to pass to the Esri PopupTemplate constructor.
   */
  return function getPopupTemplate(
    type: LayerTypeName,
    includeContaminationFields: boolean = false,
    includeControls: boolean = true,
  ) {
    if (type === 'Sampling Mask') {
      const actions = new Collection<any>();
      if (includeControls) {
        actions.addMany([
          {
            title:
              window.location.pathname === '/decon'
                ? 'Delete Decon Technology'
                : 'Delete Sample',
            id: 'delete',
            className: 'esri-icon-trash',
          },
        ]);
      }

      return {
        title: '',
        content: [
          {
            type: 'fields',
            fieldInfos: [{ fieldName: 'TYPE', label: 'Type' }],
          },
        ],
        actions,
      };
    }
    if (type === 'Area of Interest') {
      return {
        title: '',
        content: [
          {
            type: 'fields',
            fieldInfos: [{ fieldName: 'TYPE', label: 'Type' }],
          },
        ],
      };
    }
    if (type === 'Contamination Map') {
      return {
        title: '',
        content: [
          {
            type: 'fields',
            fieldInfos: [
              { fieldName: 'TYPE', label: 'Type' },
              { fieldName: 'CONTAMTYPE', label: 'Contamination Type' },
              { fieldName: 'CONTAMVAL', label: 'Activity' },
              { fieldName: 'CONTAMUNIT', label: 'Unit of Measure' },
            ],
          },
        ],
      };
    }
    if (type === 'Samples' || type === 'VSP') {
      const fieldInfos = [
        { fieldName: 'DECISIONUNIT', label: 'Layer' },
        { fieldName: 'TYPE', label: 'Sample Type' },
        { fieldName: 'SA', label: 'Reference Surface Area (sq inch)' },
        { fieldName: 'AA', label: 'Actual Surface Area (sq inch)' },
        { fieldName: 'AC', label: 'Equivalent TOTS Samples' },
        // {
        //   fieldName: 'TCPS',
        //   label: 'Total Cost Per Sample (Labor + Material + Waste)',
        // },
        { fieldName: 'Notes', label: 'Notes' },
        { fieldName: 'ALC', label: 'Analysis Labor Cost ($)' },
        { fieldName: 'AMC', label: 'Analysis Material Cost ($)' },
        { fieldName: 'MCPS', label: 'Sampling Material Cost ($/sample)' },
        {
          fieldName: 'TTPK',
          label: 'Time to Prepare Kits (person hrs/sample)',
        },
        { fieldName: 'TTC', label: 'Time to Collect (person hrs/sample)' },
        { fieldName: 'TTA', label: 'Time to Analyze (person hrs/sample)' },
        // {
        //   fieldName: 'TTPS',
        //   label: 'Total Time per Sample (person hrs/sample)',
        // },
        { fieldName: 'LOD_P', label: 'Limit of Detection (CFU) Porous' },
        {
          fieldName: 'LOD_NON',
          label: 'Limit of Detection (CFU) Nonporous',
        },
        { fieldName: 'WVPS', label: 'Waste Volume (L/sample)' },
        { fieldName: 'WWPS', label: 'Waste Weight (lbs/sample)' },
      ];

      // add the contamination map related fields if necessary
      if (includeContaminationFields) {
        fieldInfos.push({
          fieldName: 'CONTAMTYPE',
          label: 'Contamination Type',
        });
        fieldInfos.push({ fieldName: 'CONTAMVAL', label: 'Activity' });
        fieldInfos.push({ fieldName: 'CONTAMUNIT', label: 'Unit of Measure' });
      }

      const actions = new Collection<any>();
      if (includeControls) {
        actions.addMany([
          {
            title:
              window.location.pathname === '/decon'
                ? 'Delete Decon'
                : 'Delete Sample',
            id: 'delete',
            className: 'esri-icon-trash',
          },
          {
            title: 'View In Table',
            id: 'table',
            className: 'esri-icon-table',
          },
        ]);
      }

      return {
        title: '',
        content: (feature: any) =>
          getSampleTemplate(feature, fieldInfos, includeControls),
        actions,
      };
    }

    return {};
  };
}

// Custom utility for sketching in 3D scene view. Currently, the ArcGIS JS
// sketch utilities don't support recording Z axis values.
let clickEvent: IHandle | null = null;
let doubleClickEvent: IHandle | null = null;
let moveEvent: IHandle | null = null;
let popupEvent: IHandle | null = null;
let sketchVMG: SketchViewModelType | null = null;
let tempSketchLayer: __esri.GraphicsLayer | null = null;
export function use3dSketch(appType: AppType) {
  const { userInfo } = useContext(AuthenticationContext);
  const { getTrainingMode } = useContext(NavigationContext);
  const {
    displayDimensions,
    edits,
    layers,
    map,
    sceneView,
    selectedScenario,
    setEdits,
    setLayers,
    setSelectedScenario,
    setSketchLayer,
    sketchLayer,
    sketchVM,
  } = useContext(SketchContext);
  const getPopupTemplate = useDynamicPopup(appType);

  const [geometry, setGeometry] = useState<
    __esri.Point | __esri.Polygon | null
  >(null);

  // syncs the sketchVMG variable with the sketchVM context value
  useEffect(() => {
    sketchVMG = sketchVM;
  }, [displayDimensions, sketchVM]);

  // turns off the 3D sketch tools
  const endSketch = useCallback(() => {
    try {
      if (sketchVMG) sketchVMG[displayDimensions].cancel();
      if (clickEvent) clickEvent.remove();
      if (doubleClickEvent) doubleClickEvent.remove();
      if (moveEvent) moveEvent.remove();
      if (popupEvent) popupEvent.remove();
    } catch (_ex) {}

    if (map && tempSketchLayer) {
      tempSketchLayer?.removeAll();
      map.remove(tempSketchLayer);
    }
  }, [displayDimensions, map]);

  // turns on the 3D sketch tools
  const startSketch = useCallback(
    (tool: 'point' | 'polygon') => {
      if (!map || !sceneView || !sketchVMG) return;

      endSketch();

      if (displayDimensions === '2d') {
        sketchVMG[displayDimensions].create(tool);
        return;
      }

      // turn the popups off while the 3D sketch tools are active
      const popupEvt = reactiveUtils.watch(
        () => sceneView.popup.visible,
        () => {
          if (sceneView.popup.visible) {
            sceneView.popup.visible = false;
          }
        },
      );
      popupEvent = popupEvt;

      const tmpSketchLayer = new GraphicsLayer({
        listMode: 'hide',
      });
      map.add(tmpSketchLayer);
      tempSketchLayer = tmpSketchLayer;

      // clean out temp sketch graphics
      function removeTempGraphics() {
        // delete last mouse position graphic
        const graphicsToRemove: __esri.Graphic[] = [];
        tmpSketchLayer.graphics.forEach((graphic) => {
          if (
            ['addVertex', 'addVertexLine', 'addPolygon'].includes(
              graphic.attributes.type,
            )
          ) {
            graphicsToRemove.push(graphic);
          }
        });
        tmpSketchLayer.removeMany(graphicsToRemove);
      }

      // Get the clicked location including 3D sceneview graphics
      function getClickedPoint(hitRes: __esri.SceneViewHitTestResult) {
        if (hitRes.results.length === 0) return hitRes.ground.mapPoint;

        // filter out temp sketch graphics
        const filteredResults = hitRes.results.filter(
          (result: any) =>
            !['addVertex', 'addVertexLine', 'addPolygon'].includes(
              result?.graphic?.attributes?.type,
            ),
        );

        if (filteredResults.length === 0) return hitRes.ground.mapPoint;
        return filteredResults[0].mapPoint;
      }

      // creates a partial polygon from temp vertices
      function createPolygon(hitRes: __esri.SceneViewHitTestResult) {
        const clickPoint = getClickedPoint(hitRes);

        const vertices = tmpSketchLayer.graphics.filter((graphic) => {
          return graphic.attributes.type === 'vertex';
        });

        const poly = new Polygon({
          spatialReference: clickPoint.spatialReference,
          hasZ: true,
        });

        const clockwiseRing = [
          ...vertices
            .map((graphic) => {
              const vertex: __esri.Point = graphic.geometry as __esri.Point;
              return [vertex.x, vertex.y, vertex.z];
            })
            .toArray(),
          [clickPoint.x, clickPoint.y, clickPoint.z],
        ];
        clockwiseRing.push(clockwiseRing[0]);

        const counterClockwiseRing = [
          [clickPoint.x, clickPoint.y, clickPoint.z],
          ...vertices
            .reverse()
            .map((graphic) => {
              const vertex: __esri.Point = graphic.geometry as __esri.Point;
              return [vertex.x, vertex.y, vertex.z];
            })
            .toArray(),
          [clickPoint.x, clickPoint.y, clickPoint.z],
        ];

        if (poly.isClockwise(clockwiseRing)) {
          poly.rings = [clockwiseRing];
        } else {
          poly.rings = [counterClockwiseRing];
        }

        if (!poly.isClockwise(poly.rings[0]))
          poly.rings = [poly.rings[0].reverse()];

        return poly;
      }

      // creates the line portion of the temp polygon/polyline
      function create3dFillLineGraphic() {
        return [
          new FillSymbol3DLayer({
            outline: {
              color: [30, 30, 30],
              size: '3.5px',
              pattern: new LineStylePattern3D({
                style: 'dash',
              }),
            },
          }),

          new FillSymbol3DLayer({
            outline: {
              color: [240, 240, 240],
              size: '3.5px',
            },
          }),

          new FillSymbol3DLayer({
            outline: {
              color: [30, 30, 30],
              size: '3.7px',
            },
          }),
        ];
      }

      // creates the line portion of the temp polygon/polyline
      function create3dLineGraphic() {
        return [
          new LineSymbol3DLayer({
            pattern: new LineStylePattern3D({
              style: 'dash',
            }),
            material: { color: [30, 30, 30] },
            size: '3.5px',
          }),
          new LineSymbol3DLayer({
            material: { color: [240, 240, 240] },
            size: '3.5px',
          }),
          new LineSymbol3DLayer({
            material: { color: [30, 30, 30] },
            size: '3.7px',
          }),
        ];
      }

      // creates a partial polygon graphic from temp vertices
      function createPolygonGraphic(hitRes: __esri.SceneViewHitTestResult) {
        const polySymbol = sketchVMG?.[displayDimensions].polygonSymbol as any;
        return new Graphic({
          attributes: { type: 'addPolygon' },
          geometry: createPolygon(hitRes),
          symbol: new PolygonSymbol3D({
            symbolLayers: [
              ...create3dFillLineGraphic(),
              new FillSymbol3DLayer({
                material: { color: polySymbol.color },
              }),
            ],
          }),
        });
      }

      // click event used for dropping single vertex for graphic
      const clickEvt = sceneView.on('click', (event) => {
        sceneView.hitTest(event).then((hitRes) => {
          const clickPoint = getClickedPoint(hitRes);

          removeTempGraphics();

          if (tool === 'point') {
            setGeometry(clickPoint);
            return;
          }

          // add the permanent vertex
          tmpSketchLayer.add(
            new Graphic({
              attributes: { type: 'vertex' },
              geometry: {
                type: 'point',
                spatialReference: clickPoint.spatialReference,
                x: clickPoint.x,
                y: clickPoint.y,
                z: clickPoint.z,
              } as any,
              symbol: {
                type: 'simple-marker',
                color: [255, 255, 255],
                size: 6,
                outline: {
                  color: [0, 0, 0],
                  width: 1,
                },
              } as any,
            }),
          );

          // add the permanent line if more than one point
          const vertices = tmpSketchLayer.graphics.filter(
            (graphic) => graphic.attributes.type === 'vertex',
          );
          if (vertices.length > 2) {
            tmpSketchLayer.add(createPolygonGraphic(hitRes));
          }
        });
      });
      clickEvent = clickEvt;

      // double click event used for finishing drawing of graphic
      if (tool === 'polygon') {
        const doubleClickEvt = sceneView.on('double-click', (event) => {
          sceneView.hitTest(event).then((hitRes) => {
            removeTempGraphics();

            const poly = createPolygon(hitRes);

            setGeometry(poly);

            tmpSketchLayer.removeAll();
          });
        });
        doubleClickEvent = doubleClickEvt;
      }

      // pointer move event used for displaying what graphic will look like
      // when user drops the vertex
      const moveEvt = sceneView.on('pointer-move', (event) => {
        sceneView
          .hitTest(event)
          .then((hitRes) => {
            const clickPoint = getClickedPoint(hitRes);

            removeTempGraphics();

            // add in current mouse position graphic
            tmpSketchLayer.add(
              new Graphic({
                attributes: { type: 'addVertex' },
                geometry: {
                  type: 'point',
                  spatialReference: clickPoint.spatialReference,
                  x: clickPoint.x,
                  y: clickPoint.y,
                  z: clickPoint.z,
                } as any,
                symbol: {
                  type: 'simple-marker',
                  color: [255, 127, 0],
                  size: 6,
                  outline: {
                    color: [0, 0, 0],
                    width: 1,
                  },
                } as any,
              }),
            );

            // add in line graphic if more than one point
            const vertices = tmpSketchLayer.graphics.filter((graphic) => {
              return graphic.attributes.type === 'vertex';
            });
            if (vertices.length === 1) {
              const lastGraphic: __esri.Graphic = vertices.getItemAt(
                vertices.length - 1,
              );
              const lastVertex: __esri.Point =
                lastGraphic.geometry as __esri.Point;

              tmpSketchLayer.add(
                new Graphic({
                  attributes: { type: 'addVertexLine' },
                  geometry: {
                    type: 'polyline',
                    spatialReference: clickPoint.spatialReference,
                    paths: [
                      [lastVertex.x, lastVertex.y, lastVertex.z],
                      [clickPoint.x, clickPoint.y, clickPoint.z],
                    ],
                  } as any,
                  symbol: new LineSymbol3D({
                    symbolLayers: create3dLineGraphic(),
                  }),
                }),
              );
            }
            if (vertices.length > 1) {
              const poly = createPolygonGraphic(hitRes);
              tmpSketchLayer.add(poly);
            }
          })
          .catch((error) => {
            console.error(error);
          });
      });
      moveEvent = moveEvt;
    },
    [displayDimensions, endSketch, map, sceneView],
  );

  // save sketched 3d graphic
  useEffect(() => {
    async function processItem() {
      if (!geometry || !tempSketchLayer || !sketchLayer) return;
      if (sketchLayer.sketchLayer.type === 'feature') return;

      // get the button and it's id
      const button = document.querySelector('.sketch-button-selected');
      const id = button && button.id;
      if (id?.includes('-sampling-mask')) {
        deactivateButtons();
      }

      if (!id) return;

      // get the predefined attributes using the id of the clicked button
      let attributes: any = {};
      const uuid = generateUUID();
      let layerType: LayerTypeName = 'Samples';
      if (id.includes('-sampling-mask')) {
        layerType = 'Sampling Mask';
        attributes = {
          DECISIONUNITUUID: sketchLayer.sketchLayer.id,
          DECISIONUNIT: sketchLayer.sketchLayer.title,
          DECISIONUNITSORT: 0,
          PERMANENT_IDENTIFIER: uuid,
          GLOBALID: uuid,
          OBJECTID: -1,
          TYPE: layerType,
        };
      } else {
        attributes = {
          ...(window as any).totsSampleAttributes[id],
          DECISIONUNITUUID: sketchLayer.sketchLayer.id,
          DECISIONUNIT: sketchLayer.sketchLayer.title,
          DECISIONUNITSORT: 0,
          PERMANENT_IDENTIFIER: uuid,
          GLOBALID: uuid,
          OBJECTID: -1,
          Notes: '',
          CREATEDDATE: getCurrentDateTime(),
          UPDATEDDATE: getCurrentDateTime(),
          USERNAME: userInfo?.username || '',
          ORGANIZATION: userInfo?.orgId || '',
        };
      }

      const graphic = new Graphic({
        attributes,
        geometry,
        popupTemplate: new PopupTemplate(
          getPopupTemplate(layerType, getTrainingMode()),
        ),
        symbol: sketchVM?.[displayDimensions].polygonSymbol,
      });

      sketchLayer.sketchLayer.graphics.add(graphic);

      // predefined boxes (sponge, micro vac and swab) need to be
      // converted to a box of a specific size.
      if (attributes.ShapeType === 'point') {
        await createBuffer(graphic);
      }

      if (!id.includes('-sampling-mask')) {
        // find the points version of the layer
        const layerId = graphic.layer.id;
        const pointLayer = (graphic.layer as any).parent.layers.find(
          (layer: any) => `${layerId}-points` === layer.id,
        );
        if (pointLayer) pointLayer.add(convertToPoint(graphic));

        const hybridLayer = (graphic.layer as any).parent.layers.find(
          (layer: any) => `${layerId}-hybrid` === layer.id,
        );
        if (hybridLayer) {
          hybridLayer.add(
            graphic.attributes.ShapeType === 'point'
              ? convertToPoint(graphic)
              : graphic.clone(),
          );
        }
      }

      // look up the layer for this event
      let updateLayer: LayerType | null = null;
      let updateLayerIndex = -1;
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (
          (sketchLayer && layer.layerId === sketchLayer.sketchLayer.id) ||
          (!sketchLayer &&
            layer.layerId === graphic.attributes?.DECISIONUNITUUID)
        ) {
          updateLayer = layer;
          updateLayerIndex = i;
          break;
        }
      }
      if (!updateLayer) return;

      const changes = new Collection<__esri.Graphic>();
      changes.add(graphic);

      // save the layer changes
      // make a copy of the edits context variable
      const editsCopy = updateLayerEdits({
        appType,
        edits,
        layer: sketchLayer,
        type: 'add',
        changes,
      });

      // update the edits state
      setEdits(editsCopy);

      const newScenario = editsCopy.edits.find(
        (e) => e.type === 'scenario' && e.layerId === selectedScenario?.layerId,
      ) as ScenarioEditsType;
      if (newScenario) setSelectedScenario(newScenario);

      // updated the edited layer
      setLayers([
        ...layers.slice(0, updateLayerIndex),
        updateLayer,
        ...layers.slice(updateLayerIndex + 1),
      ]);

      // update sketchVM event
      setSketchLayer((layer) => {
        return layer ? { ...layer, editType: 'add' } : null;
      });

      // clear out sketched stuff
      setGeometry(null);
      tempSketchLayer.removeAll();
    }

    processItem();
  }, [
    appType,
    displayDimensions,
    edits,
    geometry,
    getPopupTemplate,
    getTrainingMode,
    layers,
    selectedScenario,
    setEdits,
    setLayers,
    setSelectedScenario,
    setSketchLayer,
    sketchLayer,
    sketchVM,
    userInfo,
  ]);

  return { endSketch, startSketch };
}

// A generic state management helper. Used for preserving
// state locally to the component.
type MemoryStateType<T> = { [key: string]: T };
let memoryState: MemoryStateType<unknown> = {};
export function useMemoryState<T>(
  key: string,
  initialState: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const hasMemoryValue = Object.prototype.hasOwnProperty.call(
      memoryState,
      key,
    );
    if (hasMemoryValue) {
      return memoryState[key];
    } else {
      return typeof initialState === 'function' ? initialState() : initialState;
    }
  });

  function onChange(nextState: T) {
    memoryState[key] = nextState;
    setState(nextState);
  }

  return [state, onChange as Dispatch<SetStateAction<T>>];
}

// Used to abort fetch requests
export function useAbort() {
  const abortController = useRef(new AbortController());
  const getAbortController = useCallback(() => {
    if (abortController.current.signal.aborted) {
      abortController.current = new AbortController();
    }
    return abortController.current;
  }, []);

  const abort = useCallback(() => {
    getAbortController().abort();
  }, [getAbortController]);

  useEffect(() => {
    return function cleanup() {
      abortController.current.abort();
    };
  }, [getAbortController]);

  const getSignal = useCallback(
    () => getAbortController().signal,
    [getAbortController],
  );

  return { abort, getSignal };
}
