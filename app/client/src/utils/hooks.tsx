/** @jsxImportSource @emotion/react */

import {
  //React,
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
// import { createRoot } from 'react-dom/client';
import Collection from '@arcgis/core/core/Collection';
import CSVLayer from '@arcgis/core/layers/CSVLayer';
import Extent from '@arcgis/core/geometry/Extent';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Field from '@arcgis/core/layers/support/Field';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import * as geometryJsonUtils from '@arcgis/core/geometry/support/jsonUtils';
import GeoRSSLayer from '@arcgis/core/layers/GeoRSSLayer';
import Graphic from '@arcgis/core/Graphic';
// import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import KMLLayer from '@arcgis/core/layers/KMLLayer';
import Layer from '@arcgis/core/layers/Layer';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import PortalItem from '@arcgis/core/portal/PortalItem';
import * as projection from '@arcgis/core/geometry/projection';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import * as rendererJsonUtils from '@arcgis/core/renderers/support/jsonUtils';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import TextSymbol from '@arcgis/core/symbols/TextSymbol';
import Viewpoint from '@arcgis/core/Viewpoint';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import WMSLayer from '@arcgis/core/layers/WMSLayer';
// components
import {
  //MapPopup,
  buildingMapPopup,
  contaminationMapPopup,
  imageryAnalysisMapPopup,
} from 'components/MapPopup';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { CalculateContext } from 'contexts/Calculate';
import { DashboardContext } from 'contexts/Dashboard';
import { DialogContext, AlertDialogOptions } from 'contexts/Dialog';
import {
  // useLayerProps,
  useSampleTypesContext,
  useServicesContext,
} from 'contexts/LookupFiles';
import { NavigationContext } from 'contexts/Navigation';
import { PublishContext } from 'contexts/Publish';
import {
  AoiDataType,
  AoiGraphics,
  JsonDownloadType,
  SketchContext,
} from 'contexts/Sketch';
// types
import {
  CalculateResultsType,
  CalculateResultsDataType,
} from 'types/CalculateResults';
import {
  EditsType,
  LayerEditsType,
  // FeatureEditsType,
  ScenarioEditsType,
  ServiceMetaDataType,
} from 'types/Edits';
import {
  // FieldInfos,
  LayerType,
  LayerTypeName,
  PortalLayerType,
  UrlLayerType,
} from 'types/Layer';
import { SampleTypeOptions } from 'types/Publish';
// config
import { PanelValueType } from 'config/navigation';
// utils
import { geoprocessorFetch, proxyFetch } from 'utils/fetchUtils';
import {
  createLayer,
  // findLayerInEdits,
  generateUUID,
  // handlePopupClick,
  removeZValues,
  // updateLayerEdits,
} from 'utils/sketchUtils';
// import { parseSmallFloat } from 'utils/utils';
// types
import { GoToOptions } from 'types/Navigation';
import {
  SampleIssues,
  SampleIssuesOutput,
  SampleSelectType,
  UserDefinedAttributes,
} from 'config/sampleAttributes';
import { appendEnvironmentObjectParam } from './arcGisRestUtils';
import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import { parseSmallFloat } from './utils';
import { LookupFile } from 'types/Misc';

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

// gets a layer type value used for sorting
function getLayerType(layer: LayerEditsType) {
  let type = 'other';

  if (layer.layerType === 'Samples') {
    type = 'Samples';
  } else if (layer.layerType === 'Image Analysis') {
    type = 'Image Analysis';
  } else if (layer.layerType === 'AOI Assessed') {
    type = 'AOI Assessed';
  }

  return type;
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

  if (isScenario) {
    scenario.aoiSummary.area = planGraphics.aoiArea;
    scenario.aoiSummary.buildingFootprint = totalBuildingFootprintSqM;
  }

  const curDeconTechSelections =
    deconTechSelections.length > 0
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
        (planBuildingCfu[scenarioId] ?? 0) * (partitionFactors[media] ?? 0);

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
      // console.log('pctAoi: ', pctAoi);
      const pctFactor = pctAoi * 0.01;

      // get surface area of soil, asphalt or concrete
      //             60 =             100 * 0.6 surface area of concrete
      surfaceArea = nonBuildingArea * pctFactor;

      // get total CFU for media
      let totalArea = 0;
      let totalCfu = 0;
      // console.log('contaminationPercentages: ', contaminationPercentages);
      if (contaminationPercentages.hasOwnProperty(scenarioId)) {
        Object.keys(contaminationPercentages[scenarioId]).forEach(
          (key: any) => {
            // area of media and cfu level
            const pctCfu = contaminationPercentages[scenarioId][key];
            //                34.2 =   0.57 * 60
            const surfaceAreaSfCfu = pctCfu * surfaceArea;
            totalArea += surfaceAreaSfCfu;

            // 34.2M  =             34.2 * 1M;
            // SUM    = 35.916M CFU
            totalCfu += surfaceAreaSfCfu * key;
          },
        );
      }

      avgCfu = !totalCfu && !totalArea ? 0 : totalCfu / totalArea;
    }
    // console.log('surfaceArea: ', surfaceArea);
    // console.log('avgCfu: ', avgCfu);

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
  services: LookupFile,
  planGraphics: PlanGraphics,
  responseIndexes: string[],
  buildingFilter: string[] = [],
) {
  const requests: any[] = [];
  features.forEach((feature) => {
    const request: any = proxyFetch(`${services.data.nsi}/structures?fmt=fc`, {
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
      const extWallsSqFt = Math.sqrt(floorsSqFt) * 10 * 4 * num_story;
      const intWallsSqFt = extWallsSqFt * 3;

      // meters
      const footprintSqM = sqft / 10.7639104167;
      const floorsSqM = num_story * footprintSqM;
      const extWallsSqM = Math.sqrt(floorsSqM) * 10 * 4 * num_story;
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
        url: `${services.data.shippTestGPServer}/Classify%20AOI`,
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

// Finds the layer by the layer id
function getLayerById(layers: LayerType[], id: string) {
  const index = layers.findIndex((layer) => layer.layerId === id);
  return layers[index];
}

// Finds the center of the provided geometry
function getCenterOfGeometry(geometry: __esri.Geometry) {
  let geometryCasted;
  let center: __esri.Point | null = null;

  // get the center based on geometry type
  if (geometry.type === 'point') {
    geometryCasted = geometry as __esri.Point;
    center = geometryCasted;
  } else if (geometry.type === 'polygon') {
    geometryCasted = geometry as __esri.Polygon;
    center = geometryCasted.centroid;
  }

  return center;
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
    setAoiData,
    setJsonDownload,
    setDeconSelections,
    setPlanSettings,
    setEfficacyResults,
  } = useContext(SketchContext);

  function startOver() {
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
    setDisplayGeometryType('polygons');
    setTerrain3dUseElevation(true);
    setTerrain3dVisible(true);
    setViewUnderground3d(false);

    // set the calculate settings back to defaults
    resetCalculateContext();
    setEfficacyResults(null);

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

    setPlanSettings({
      name: '',
      description: '',
    });

    setAoiData({
      count: 0,
      graphics: null,
    });
    setJsonDownload([]);
    setDeconSelections([]);

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

// Provides geometry engine related tools
//    calculateArea    - Function for calculating the area of the provided graphic.
//    createBuffer     - Function for creating a square around the center point of
//                       the provided graphic with the provided width.
//    loadedProjection - The esri projection library. Mainly used to test if the
//                       library is ready for use.
export function useGeometryTools() {
  const sampleTypeContext = useSampleTypesContext();

  // Load the esri projection module. This needs
  // to happen before the projection module will work.
  const [
    loadedProjection,
    setLoadedProjection, //
  ] = useState<__esri.projection | null>(null);
  useEffect(() => {
    projection.load().then(() => {
      setLoadedProjection(projection);
    });
  });

  // Calculates the area of the provided graphic using a
  // spatial reference system based on where the sample is located.
  const calculateArea = useCallback(
    (graphic: __esri.Graphic | __esri.Geometry) => {
      if (!loadedProjection) return 'ERROR - Projection library not loaded';

      const graphicWType = graphic as __esri.Graphic;
      const geometry = (
        graphicWType.geometry ? graphicWType.geometry : graphic
      ) as __esri.Geometry;

      // convert the geometry to WGS84 for geometryEngine
      // Cast the geometry as a Polygon to avoid typescript errors on
      // accessing the centroid.
      const wgsGeometry = webMercatorUtils.webMercatorToGeographic(
        geometry,
        false,
      ) as __esri.Polygon;

      if (!wgsGeometry) return 'ERROR - WGS Geometry is null';

      // get the center
      let center: __esri.Point | null = getCenterOfGeometry(wgsGeometry);
      if (!center) return;

      // get the spatial reference from the centroid
      const { latitude, longitude } = center;
      const base_wkid = latitude > 0 ? 32600 : 32700;
      const out_wkid = base_wkid + Math.floor((longitude + 180) / 6) + 1;
      const spatialReference = new SpatialReference({ wkid: out_wkid });

      if (!spatialReference) return 'ERROR - Spatial Reference is null';

      // project the geometry
      const projectedGeometry = loadedProjection.project(
        wgsGeometry,
        spatialReference,
      ) as __esri.Polygon;

      if (!projectedGeometry) return 'ERROR - Projected Geometry is null';

      // calulate the area
      const areaSM = geometryEngine.planarArea(
        projectedGeometry,
        'square-meters',
      );
      return areaSM;
    },
    [loadedProjection],
  );

  // Creates a square buffer around the center of the provided graphic,
  // where the width of the sqaure is the provided width.
  const createBuffer = useCallback(
    (graphic: __esri.Graphic) => {
      if (!loadedProjection) return 'ERROR - Projection library not loaded';

      // convert the geometry to WGS84 for geometryEngine
      // Cast the geometry as a Polygon to avoid typescript errors on
      // accessing the centroid.
      const wgsGeometry = webMercatorUtils.webMercatorToGeographic(
        graphic.geometry,
        false,
      );

      if (!wgsGeometry) return 'ERROR - WGS Geometry is null';

      // get the center
      let center: __esri.Point | null = getCenterOfGeometry(wgsGeometry);
      if (!center) return;

      // get the spatial reference from the centroid
      const { latitude, longitude } = center;
      const base_wkid = latitude > 0 ? 32600 : 32700;
      const out_wkid = base_wkid + Math.floor((longitude + 180) / 6) + 1;
      const spatialReference = new SpatialReference({ wkid: out_wkid });

      if (!spatialReference) return 'ERROR - Spatial Reference is null';

      // project the geometry
      const projectedGeometry = loadedProjection.project(
        wgsGeometry,
        spatialReference,
      ) as __esri.Geometry;

      if (!projectedGeometry) return 'ERROR - Projected Geometry is null';

      center = getCenterOfGeometry(projectedGeometry);
      if (!center) return;

      // create a circular buffer around the center point
      const halfWidth = Math.sqrt(graphic.attributes.SA) / 2;
      const ptBuff = geometryEngine.buffer(
        center,
        halfWidth,
        109009,
      ) as __esri.Polygon;

      // use the extent to make the buffer a square
      const projectedPolygon = new Polygon({
        spatialReference: center.spatialReference,
        centroid: center,
        rings: [
          [
            [ptBuff.extent.xmin, ptBuff.extent.ymin, center.z],
            [ptBuff.extent.xmin, ptBuff.extent.ymax, center.z],
            [ptBuff.extent.xmax, ptBuff.extent.ymax, center.z],
            [ptBuff.extent.xmax, ptBuff.extent.ymin, center.z],
            [ptBuff.extent.xmin, ptBuff.extent.ymin, center.z],
          ],
        ],
      });

      // re-project the geometry back to the original spatialReference
      const reprojectedGeometry = loadedProjection.project(
        projectedPolygon,
        graphic.geometry.spatialReference,
      ) as __esri.Point;

      graphic.geometry = reprojectedGeometry;
    },
    [loadedProjection],
  );

  // Validates that the area of samples is within tolerance and that sample
  // attributes match up with the predefined attributes.
  const sampleValidation: (
    graphics: __esri.Graphic[],
    isFullGraphic?: boolean,
    hasAllAttributes?: boolean,
  ) => SampleIssuesOutput = useCallback(
    (
      graphics: __esri.Graphic[],
      isFullGraphic: boolean = false,
      hasAllAttributes: boolean = true,
    ) => {
      let areaOutOfTolerance = false;
      let attributeMismatch = false;

      let sampleWithIssues: SampleIssues = {
        areaOutOfTolerance: false,
        attributeMismatch: false,
        attributesWithMismatch: [],
        difference: 0,
        graphic: null,
      };
      const samplesWithIssues: SampleIssues[] = [];

      graphics.forEach((simpleGraphic) => {
        let graphic = simpleGraphic;
        if (!isFullGraphic) {
          graphic = new Graphic({
            ...simpleGraphic,
            geometry: new Polygon({
              ...simpleGraphic.geometry,
            }),
          });
        }

        // create the sample issues object
        sampleWithIssues = {
          areaOutOfTolerance: false,
          attributeMismatch: false,
          attributesWithMismatch: [],
          difference: 0,
          graphic,
        };

        // Calculates area and checks if the sample area is within the allowable
        // tolerance of the reference surface area (SA) value
        function performAreaToleranceCheck() {
          // Get the area of the sample
          const area = calculateArea(graphic);
          if (typeof area !== 'number') return;

          // check that area is within allowable tolerance
          const difference = area - graphic.attributes.SA;
          sampleWithIssues.difference = difference;
          if (Math.abs(difference) > sampleTypeContext.data.areaTolerance) {
            areaOutOfTolerance = true;
            sampleWithIssues.areaOutOfTolerance = true;
          }
        }

        // Check if the sample is a predefined type or not
        if (
          sampleTypeContext.status === 'success' &&
          sampleTypeContext.data.sampleAttributes.hasOwnProperty(
            graphic.attributes.TYPEUUID,
          )
        ) {
          performAreaToleranceCheck();

          // check sample attributes against predefined attributes
          const predefinedAttributes: any =
            sampleTypeContext.data.sampleAttributes[
              graphic.attributes.TYPEUUID
            ];
          Object.keys(predefinedAttributes).forEach((key) => {
            if (!sampleTypeContext.data.attributesToCheck.includes(key)) return;
            if (!hasAllAttributes && !graphic.attributes.hasOwnProperty(key))
              return;
            if (
              graphic.attributes.hasOwnProperty(key) &&
              predefinedAttributes[key] === graphic.attributes[key]
            ) {
              return;
            }

            attributeMismatch = true;
            sampleWithIssues.attributeMismatch = true;
            sampleWithIssues.attributesWithMismatch.push(key);
          });
        } else {
          // Check area tolerance of user defined sample types
          if (graphic?.attributes?.SA) {
            performAreaToleranceCheck();
          }
        }

        if (
          sampleWithIssues.areaOutOfTolerance ||
          sampleWithIssues.attributeMismatch
        ) {
          samplesWithIssues.push(sampleWithIssues);
        }
      });

      const output: SampleIssuesOutput = {
        areaOutOfTolerance,
        attributeMismatch,
        samplesWithIssues,
      };
      if (window.location.search.includes('devMode=true')) {
        console.log('sampleValidation: ', output);
      }

      return output;
    },
    [calculateArea, sampleTypeContext],
  );

  return { calculateArea, createBuffer, loadedProjection, sampleValidation };
}

// // Runs sampling plan calculations whenever the
// // samples change or the variables on the calculate tab
// // change.
// export function useCalculatePlanOld() {
//   const {
//     edits,
//     layers,
//     map,
//     selectedScenario,
//     setEdits,
//     setSelectedScenario,
//   } = useContext(SketchContext);
//   const {
//     contaminationMap,
//     inputNumLabs,
//     inputNumLabHours,
//     inputNumSamplingHours,
//     inputNumSamplingPersonnel,
//     inputNumSamplingShifts,
//     inputNumSamplingTeams,
//     inputSamplingLaborCost,
//     inputSurfaceArea,
//     setCalculateResults,
//     setUpdateContextValues,
//     updateContextValues,
//   } = useContext(CalculateContext);

//   const { calculateArea, loadedProjection } = useGeometryTools();

//   // Reset the calculateResults context variable, whenever anything
//   // changes that will cause a re-calculation.
//   const [calcGraphics, setCalcGraphics] = useState<__esri.Graphic[]>([]);
//   useEffect(() => {
//     // Get the number of graphics for the selected scenario
//     let numGraphics = 0;
//     if (selectedScenario && selectedScenario.layers.length > 0) {
//       layers.forEach((layer) => {
//         if (layer.parentLayer?.id !== selectedScenario.layerId) return;
//         if (layer.sketchLayer.type !== 'graphics') return;

//         numGraphics += layer.sketchLayer.graphics.length;
//       });
//     }

//     // exit early
//     if (!selectedScenario || numGraphics === 0) {
//       setCalculateResults({ status: 'none', panelOpen: false, data: null });
//       setCalcGraphics([]);
//       return;
//     }
//     if (selectedScenario.editType === 'properties') return;

//     // to improve performance, do not perform calculations if
//     // only the scenario name/description changed
//     const { editsScenario } = findLayerInEdits(
//       edits.edits,
//       selectedScenario.layerId,
//     );
//     if (!editsScenario || editsScenario.editType === 'properties') return;

//     setCalculateResults((calculateResults: CalculateResultsType) => {
//       return {
//         status: 'fetching',
//         panelOpen: calculateResults.panelOpen,
//         data: null,
//       };
//     });
//   }, [edits, layers, selectedScenario, setCalculateResults]);

//   const [totals, setTotals] = useState({
//     ttpk: 0,
//     ttc: 0,
//     tta: 0,
//     ttps: 0,
//     lod_p: 0,
//     lod_non: 0,
//     mcps: 0,
//     tcps: 0,
//     wvps: 0,
//     wwps: 0,
//     sa: 0,
//     alc: 0,
//     amc: 0,
//     ac: 0,
//     totalContaminatedArea: 0,
//     totalDeconReductionArea: 0,
//     totalDecontaminatedArea: 0,
//     contaminationType: '',
//   });
//   const [totalArea, setTotalArea] = useState(0);

//   // perform geospatial calculatations
//   useEffect(() => {
//     // exit early checks
//     if (!loadedProjection) return;
//     if (
//       !map ||
//       !selectedScenario ||
//       selectedScenario.layers.length === 0 ||
//       edits.count === 0
//     ) {
//       return;
//     }

//     // to improve performance, do not perform calculations if
//     // only the scenario name/description changed
//     if (selectedScenario.editType === 'properties') return;
//     const { editsScenario } = findLayerInEdits(
//       edits.edits,
//       selectedScenario.layerId,
//     );
//     if (!editsScenario || editsScenario.editType === 'properties') return;

//     let ttpk = 0;
//     let ttc = 0;
//     let tta = 0;
//     let ttps = 0;
//     let lod_p = 0;
//     let lod_non = 0;
//     let mcps = 0;
//     let tcps = 0;
//     let wvps = 0;
//     let wwps = 0;
//     let sa = 0;
//     let alc = 0;
//     let amc = 0;
//     let ac = 0;

//     // caluclate the area for graphics for the selected scenario
//     let totalAreaSquereMeter = 0;
//     const calcGraphics: __esri.Graphic[] = [];
//     layers.forEach((layer) => {
//       if (
//         layer.parentLayer?.id !== selectedScenario.layerId ||
//         layer.sketchLayer.type !== 'graphics'
//       ) {
//         return;
//       }

//       layer.sketchLayer.graphics.forEach((graphic) => {
//         const calcGraphic = graphic.clone();

//         // calculate the area using the custom hook
//         const areaSM = calculateArea(graphic);
//         if (typeof areaSM !== 'number') {
//           return;
//         }

//         totalAreaSquereMeter = totalAreaSquereMeter + areaSM;

//         // Get the number of reference surface areas that are in the actual area.
//         // This is to prevent users from cheating the system by drawing larger shapes
//         // then the reference surface area and it only getting counted as "1" sample.
//         const { SA } = calcGraphic.attributes;
//         let areaCount = 1;
//         if (areaSM >= SA) {
//           areaCount = Math.ceil(areaSM / SA);
//         }

//         // set the AA on the original graphic, so it is visible in the popup
//         graphic.setAttribute('AA', Math.round(areaSM));
//         graphic.setAttribute('AC', areaCount);

//         // multiply all of the attributes by the area
//         const {
//           TTPK,
//           TTC,
//           TTA,
//           TTPS,
//           LOD_P,
//           LOD_NON,
//           MCPS,
//           TCPS,
//           WVPS,
//           WWPS,
//           ALC,
//           AMC,
//         } = calcGraphic.attributes;

//         if (TTPK) {
//           ttpk = ttpk + parseSmallFloat(Number(TTPK)) * areaCount;
//         }
//         if (TTC) {
//           ttc = ttc + parseSmallFloat(Number(TTC)) * areaSM;
//         }
//         if (TTA) {
//           tta = tta + parseSmallFloat(Number(TTA)) * areaCount;
//         }
//         if (TTPS) {
//           ttps = ttps + parseSmallFloat(Number(TTPS)) * areaCount;
//         }
//         if (LOD_P) {
//           lod_p = lod_p + parseSmallFloat(Number(LOD_P));
//         }
//         if (LOD_NON) {
//           lod_non = lod_non + parseSmallFloat(Number(LOD_NON));
//         }
//         if (MCPS) {
//           mcps = mcps + parseSmallFloat(Number(MCPS)) * areaCount;
//         }
//         if (TCPS) {
//           tcps = tcps + parseSmallFloat(Number(TCPS)) * areaSM;
//         }
//         if (WVPS) {
//           wvps = wvps + parseSmallFloat(Number(WVPS)) * areaSM;
//         }
//         if (WWPS) {
//           wwps = wwps + parseSmallFloat(Number(WWPS)) * areaSM;
//         }
//         if (SA) {
//           sa = sa + parseSmallFloat(Number(SA));
//         }
//         if (ALC) {
//           alc = alc + parseSmallFloat(Number(ALC)) * areaSM;
//         }
//         if (AMC) {
//           amc = amc + parseSmallFloat(Number(AMC)) * areaSM;
//         }
//         if (areaCount) {
//           ac = ac + Number(areaCount);
//         }

//         calcGraphics.push(calcGraphic);
//       });
//     });

//     let totalContaminatedArea = 0;
//     let totalDeconReductionArea = 0;
//     let totalDecontaminatedArea = 0;
//     let contaminationType = '';
//     if (contaminationMap) {
//       (contaminationMap.sketchLayer as __esri.GraphicsLayer).graphics.forEach(
//         (graphic, index) => {
//           const calcGraphic = graphic.clone();

//           // calculate the area using the custom hook
//           const areaSM = calculateArea(graphic);
//           if (typeof areaSM !== 'number') {
//             return;
//           }

//           const { CONTAMINATED, CONTAMTYPE } = calcGraphic.attributes;

//           if (CONTAMINATED)
//             totalContaminatedArea = totalContaminatedArea + areaSM;

//           if (index === 0) contaminationType = CONTAMTYPE;
//         },
//       );

//       const contamLayer = map.findLayerById(
//         'contaminationMapUpdated',
//       ) as __esri.GraphicsLayer;
//       contamLayer.graphics.forEach((graphic) => {
//         const calcGraphic = graphic.clone();

//         // calculate the area using the custom hook
//         const areaSM = calculateArea(graphic);
//         if (typeof areaSM !== 'number') {
//           return;
//         }

//         const { CONTAMVAL } = calcGraphic.attributes;
//         console.log('newContamVal: ', CONTAMVAL);

//         if (graphic.attributes.CONTAMREDUCED) {
//           totalDeconReductionArea = totalDeconReductionArea + areaSM;

//           if (!graphic.attributes.CONTAMINATED) {
//             totalDecontaminatedArea = totalDecontaminatedArea + areaSM;
//           }
//         }
//       });
//     }

//     setTotals({
//       ttpk,
//       ttc,
//       tta,
//       ttps,
//       lod_p,
//       lod_non,
//       mcps,
//       tcps,
//       wvps,
//       wwps,
//       sa,
//       alc,
//       amc,
//       ac,
//       totalContaminatedArea,
//       totalDeconReductionArea,
//       totalDecontaminatedArea,
//       contaminationType,
//     });
//     setCalcGraphics(calcGraphics);
//     setTotalArea(totalAreaSquereMeter);
//   }, [
//     calculateArea,
//     contaminationMap,
//     edits,
//     layers,
//     loadedProjection,
//     map,
//     selectedScenario,
//   ]);

//   // perform non-geospatial calculations
//   useEffect(() => {
//     // exit early checks
//     if (!selectedScenario) return;
//     if (calcGraphics.length === 0 || totalArea === 0) {
//       setCalculateResults({ status: 'none', panelOpen: false, data: null });
//       return;
//     }

//     const { NUM_SAMPLING_TEAMS: numSamplingTeams } =
//       selectedScenario.calculateSettings.current;

//     console.log('totals: ', totals);
//     const s = totals.ttpk / 24 / numSamplingTeams; // setup time (days)
//     const r = totals.tta / 24 / numSamplingTeams; // residence time (days)
//     const tm = totals.ttc / 24 / numSamplingTeams; // time per decon
//     const sc = totals.mcps; // setup cost
//     const cm = totals.tcps; // cost per square meter

//     const totalTime = s + r + tm;
//     const totalCost = sc + cm;

//     const contaminatedAreaRemaining =
//       totals.totalContaminatedArea - totals.totalDecontaminatedArea;

//     const resultObject: CalculateResultsDataType = {
//       // assign input parameters
//       // 'User Specified Number of Available Teams for Decon': numSamplingTeams,
//       // 'User Specified Personnel per Decon Team': numSamplingPersonnel,
//       // 'User Specified Decon Team Hours per Shift': numSamplingHours,
//       // 'User Specified Decon Team Shifts per Day': numSamplingShifts,
//       // 'User Specified Decon Team Labor Cost': samplingLaborCost,
//       // 'User Specified Number of Available Labs for Analysis': numLabs,
//       // 'User Specified Analysis Lab Hours per Day': numLabHours,
//       // 'User Specified Surface Area': surfaceArea,
//       'Total Number of User-Defined Decon Technologies': calcGraphics.length,
//       'User Specified Number of Concurrent Applications': numSamplingTeams,

//       // assign counts
//       'Total Number of Decon Applications': totals.ac,
//       'Total Decontamination Area': totalArea,
//       'Total Setup Time': s,
//       'Total Application Time': tm,
//       'Total Residence Time': r,
//       'Average Contamination Removal':
//         (totals.lod_non / calcGraphics.length) * 100,
//       'Total Setup Cost': sc,
//       'Total Application Cost': cm,
//       'Solid Waste Volume': totals.wvps,
//       'Solid Waste Mass': totals.wwps,
//       'Liquid Waste Volume': totals.alc,
//       'Liquid Waste Mass': totals.amc,
//       'Total Waste Volume': totals.wvps + totals.alc,
//       'Total Waste Mass': totals.wwps + totals.amc,

//       // spatial items
//       // 'User Specified Total AOI': userSpecifiedAOI,
//       // 'Percent of Area Sampled': percentAreaSampled,

//       // sampling
//       // 'Total Required Decon Time': samplingTimeHours,
//       // 'Decon Hours per Day': samplingHours,
//       // 'Decon Personnel hours per Day': samplingPersonnelHoursPerDay,
//       // 'Decon Personnel Labor Cost': samplingPersonnelLaborCost,
//       // 'Time to Complete Decon': timeCompleteSampling,
//       // 'Total Decon Labor Cost': totalSamplingLaborCost,
//       // 'Total Decon Cost': totalSamplingCost,
//       // 'Total Analysis Cost': totalAnalysisCost,

//       // // analysis
//       // 'Time to Complete Analyses': labThroughput,

//       //totals
//       'Total Cost': totalCost,
//       'Total Time': Math.round(totalTime * 10) / 10,
//       // 'Limiting Time Factor': limitingFactor,
//       'Total Contaminated Area': totals.totalContaminatedArea,
//       'Total Reduction Area': totals.totalDeconReductionArea,
//       'Total Remaining Contaminated Area': contaminatedAreaRemaining,
//       'Total Decontaminated Area': totals.totalDecontaminatedArea,
//       'Percent Contaminated Remaining':
//         (contaminatedAreaRemaining / totals.totalContaminatedArea) * 100,
//       'Contamination Type': totals.contaminationType,
//     };

//     // display loading spinner for 1 second
//     setCalculateResults((calculateResults: CalculateResultsType) => {
//       return {
//         status: 'success',
//         panelOpen: calculateResults.panelOpen,
//         data: resultObject,
//       };
//     });

//     ///////////////////////////////////////////////////////////////////////////////////////////
//     ////////////////////////////// Old Stuff      /////////////////////////////////////////////
//     ///////////////////////////////////////////////////////////////////////////////////////////

//     // const {
//     //   NUM_LABS: numLabs,
//     //   NUM_LAB_HOURS: numLabHours,
//     //   NUM_SAMPLING_HOURS: numSamplingHours,
//     //   NUM_SAMPLING_PERSONNEL: numSamplingPersonnel,
//     //   NUM_SAMPLING_SHIFTS: numSamplingShifts,
//     //   NUM_SAMPLING_TEAMS: numSamplingTeams,
//     //   SAMPLING_LABOR_COST: samplingLaborCost,
//     //   SURFACE_AREA: surfaceArea,
//     // } = selectedScenario.calculateSettings.current;

//     // // calculate spatial items
//     // let userSpecifiedAOI = null;
//     // let percentAreaSampled = null;
//     // if (surfaceArea > 0) {
//     //   userSpecifiedAOI = surfaceArea;
//     //   percentAreaSampled = (totalArea / surfaceArea) * 100;
//     // }

//     // // calculate the sampling items
//     // const samplingTimeHours = totals.ttpk + totals.ttc;
//     // const samplingHours =
//     //   numSamplingTeams * numSamplingHours * numSamplingShifts;
//     // const samplingPersonnelHoursPerDay = samplingHours * numSamplingPersonnel;
//     // const samplingPersonnelLaborCost = samplingLaborCost / numSamplingPersonnel;
//     // const timeCompleteSampling = (totals.ttc + totals.ttpk) / samplingHours;
//     // const totalSamplingLaborCost =
//     //   numSamplingTeams *
//     //   numSamplingPersonnel *
//     //   numSamplingHours *
//     //   numSamplingShifts *
//     //   samplingPersonnelLaborCost *
//     //   timeCompleteSampling;

//     // // calculate lab throughput
//     // const totalLabHours = numLabs * numLabHours;
//     // let labThroughput = totals.tta / totalLabHours;

//     // // calculate total cost and time
//     // const totalSamplingCost = totalSamplingLaborCost + totals.mcps;
//     // const totalAnalysisCost = totals.alc + totals.amc;
//     // // const totalCost = totalSamplingCost + totalAnalysisCost;
//     // const totalCost = totalSamplingCost;

//     // // Calculate total time. Note: Total Time is the greater of sample collection time or Analysis Total Time.
//     // // If Analysis Time is equal to or greater than Sampling Total Time then the value reported is total Analysis Time Plus one day.
//     // // The one day accounts for the time samples get collected and shipped to the lab on day one of the sampling response.
//     // // let totalTime = timeCompleteSampling;
//     // // if (labThroughput + 1 < timeCompleteSampling) {
//     // //   totalTime = timeCompleteSampling;
//     // // } else {
//     // //   labThroughput += 1;
//     // //   totalTime = labThroughput;
//     // // }

//     // // Get limiting time factor (will be undefined if they are equal)
//     // let limitingFactor: CalculateResultsDataType['Limiting Time Factor'] = '';
//     // if (timeCompleteSampling > labThroughput) {
//     //   limitingFactor = 'Decon';
//     // } else {
//     //   limitingFactor = 'Analysis';
//     // }

//     // const resultObject: CalculateResultsDataType = {
//     //   // assign input parameters
//     //   'User Specified Number of Available Teams for Decon': numSamplingTeams,
//     //   'User Specified Personnel per Decon Team': numSamplingPersonnel,
//     //   'User Specified Decon Team Hours per Shift': numSamplingHours,
//     //   'User Specified Decon Team Shifts per Day': numSamplingShifts,
//     //   'User Specified Decon Team Labor Cost': samplingLaborCost,
//     //   'User Specified Number of Available Labs for Analysis': numLabs,
//     //   'User Specified Analysis Lab Hours per Day': numLabHours,
//     //   'User Specified Surface Area': surfaceArea,
//     //   'Total Number of User-Defined Decon Technologies': calcGraphics.length,

//     //   // assign counts
//     //   'Total Number of Decon Applications': totals.ac,
//     //   'Total Sampled Area': totalArea,
//     //   'Time to Prepare Kits': totals.ttpk,
//     //   'Time to Collect': totals.ttc,
//     //   'Decon Technology Material Cost': totals.mcps,
//     //   'Time to Analyze': totals.tta,
//     //   'Analysis Labor Cost': totals.alc,
//     //   'Analysis Material Cost': totals.amc,
//     //   'Waste Volume': totals.wvps,
//     //   'Waste Weight': totals.wwps,

//     //   // spatial items
//     //   'User Specified Total AOI': userSpecifiedAOI,
//     //   'Percent of Area Sampled': percentAreaSampled,

//     //   // sampling
//     //   'Total Required Decon Time': samplingTimeHours,
//     //   'Decon Hours per Day': samplingHours,
//     //   'Decon Personnel hours per Day': samplingPersonnelHoursPerDay,
//     //   'Decon Personnel Labor Cost': samplingPersonnelLaborCost,
//     //   'Time to Complete Decon': timeCompleteSampling,
//     //   'Total Decon Labor Cost': totalSamplingLaborCost,
//     //   'Total Decon Cost': totalSamplingCost,
//     //   'Total Analysis Cost': totalAnalysisCost,

//     //   // analysis
//     //   'Time to Complete Analyses': labThroughput,

//     //   //totals
//     //   'Total Cost': totalCost,
//     //   'Total Time': Math.round(totalTime * 10) / 10,
//     //   'Limiting Time Factor': limitingFactor,
//     // };

//     // // display loading spinner for 1 second
//     // setCalculateResults((calculateResults: CalculateResultsType) => {
//     //   return {
//     //     status: 'success',
//     //     panelOpen: calculateResults.panelOpen,
//     //     data: resultObject,
//     //   };
//     // });
//   }, [calcGraphics, selectedScenario, setCalculateResults, totals, totalArea]);

//   // Updates the calculation context values with the inputs.
//   // The intention is to update these values whenever the user navigates away from
//   // the calculate resources tab or when they click the View Detailed Results button.
//   useEffect(() => {
//     if (!selectedScenario || !updateContextValues) return;
//     setUpdateContextValues(false);

//     const newSettings = {
//       NUM_LABS: inputNumLabs,
//       NUM_LAB_HOURS: inputNumLabHours,
//       NUM_SAMPLING_HOURS: inputNumSamplingHours,
//       NUM_SAMPLING_PERSONNEL: inputNumSamplingPersonnel,
//       NUM_SAMPLING_SHIFTS: inputNumSamplingShifts,
//       NUM_SAMPLING_TEAMS: inputNumSamplingTeams,
//       SAMPLING_LABOR_COST: inputSamplingLaborCost,
//       SURFACE_AREA: inputSurfaceArea,
//     };

//     setSelectedScenario((selectedScenario) => {
//       if (selectedScenario) {
//         selectedScenario.calculateSettings.current = {
//           ...selectedScenario.calculateSettings.current,
//           ...newSettings,
//         };
//       }

//       return selectedScenario;
//     });

//     setEdits((edits) => {
//       const selScenario = edits.edits.find(
//         (e) => e.type === 'scenario' && e.value === selectedScenario.value,
//       );
//       if (!selScenario || selScenario.type !== 'scenario') return edits;

//       selScenario.calculateSettings.current = {
//         ...selScenario.calculateSettings.current,
//         ...newSettings,
//       };

//       return {
//         count: edits.count + 1,
//         edits: edits.edits,
//       };
//     });
//   }, [
//     inputNumLabs,
//     inputNumLabHours,
//     inputNumSamplingHours,
//     inputNumSamplingPersonnel,
//     inputNumSamplingShifts,
//     inputNumSamplingTeams,
//     inputSamplingLaborCost,
//     inputSurfaceArea,
//     selectedScenario,
//     setEdits,
//     setSelectedScenario,
//     setUpdateContextValues,
//     updateContextValues,
//   ]);
// }

// Runs sampling plan calculations whenever the
// samples change or the variables on the calculate tab
// change.
export function useCalculatePlan() {
  const {
    aoiData,
    defaultDeconSelections,
    edits,
    layers,
    mapView,
    resultsOpen,
    sampleAttributes,
    // selectedScenario,
    setEdits,
    setEfficacyResults,
    setJsonDownload,
  } = useContext(SketchContext);
  const { calculateResults, contaminationMap, setCalculateResults } =
    useContext(CalculateContext);
  const services = useServicesContext();

  const { calculateArea } = useGeometryTools();

  useEffect(() => {
    console.log('aoiData: ', aoiData);
  }, [aoiData]);

  // Reset the calculateResults context variable, whenever anything
  // changes that will cause a re-calculation.
  useEffect(() => {
    // exit early
    if (!hasGraphics(aoiData)) {
      setCalculateResults({ status: 'none', panelOpen: false, data: null });
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
    setCalculateResults((calculateResults: CalculateResultsType) => {
      return {
        status: 'fetching',
        panelOpen: calculateResults.panelOpen,
        data: null,
      };
    });
    setNsiData({
      status: 'none',
      planGraphics: {},
    });
    const contamMapUpdated = mapView?.map.layers.find(
      (l) => l.id === 'contaminationMapUpdated',
    ) as __esri.GraphicsLayer;
    if (contamMapUpdated) contamMapUpdated.removeAll();
  }, [aoiData, mapView, setCalculateResults, setEfficacyResults]);

  const [nsiData, setNsiData] = useState<NsiData>({
    status: 'none',
    planGraphics: {},
  });

  // fetch building data for AOI
  useEffect(() => {
    if (services.status !== 'success') return;
    if (!hasGraphics(aoiData)) return;
    if (calculateResults.status !== 'fetching') return;
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
      Object.keys(aoiData.graphics).forEach((planId: string) => {
        if (!aoiData.graphics?.[planId]) return;

        aoiGraphics.push(...aoiData.graphics[planId]);
        let planAoiArea = 0;
        aoiData.graphics[planId].forEach((graphic: any) => {
          const geometry = graphic.geometry as __esri.Polygon;

          const areaSM = calculateArea(graphic);
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
        });

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
      });
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
          contaminationLayer.graphics.forEach((graphic) => {
            const areaSM = calculateArea(graphic);
            if (typeof areaSM === 'number') {
              planAoiArea += areaSM;
              // totalAoiSqM += areaSM;
              graphic.attributes.AREA = areaSM;
            }
          });

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
      }
    }

    fetchAoiData();
  }, [
    aoiData,
    calculateArea,
    calculateResults,
    contaminationMap,
    layers,
    nsiData,
    // selectedScenario,
    services,
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
      ['none', 'success'].includes(calculateResults.status) ||
      ['none', 'failure', 'fetching'].includes(nsiData.status)
    )
      return;

    const contamMapUpdated = mapView?.map.layers.find(
      (l) => l.id === 'contaminationMapUpdated',
    ) as __esri.GraphicsLayer;
    if (contamMapUpdated) contamMapUpdated.removeAll();

    console.log('nsiData: ', nsiData);
    // if (!hasGraphics(nsiData.planGraphics)) {
    //   if (calculateResults.status !== 'none') {
    //     console.log('setting calculate results to none 2...');
    //     setCalculateResults({ status: 'none', panelOpen: false, data: null });
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
              const buildingTech = scenario.deconTechSelections.filter((t) =>
                t.media.includes('Building '),
              );
              buildingTech.forEach((tech) => {
                let mediaCfu = plumeCfu * (partitionFactors[tech.media] ?? 0);
                if (tech.media === 'Building Roofs' && ROOFS) mediaCfu = ROOFS;
                if (tech.media === 'Building Interior Floors' && FLOORS)
                  mediaCfu = FLOORS;
                if (tech.media === 'Building Exterior Walls' && EXTWALLS)
                  mediaCfu = EXTWALLS;
                if (tech.media === 'Building Interior Walls' && INTWALLS)
                  mediaCfu = INTWALLS;

                originalCfu += mediaCfu;

                const deconTech = sampleAttributes[tech.deconTech?.value];
                if (!deconTech) {
                  newCfu += mediaCfu;
                  return;
                }

                const { LOD_NON: contaminationRemovalFactor } =
                  sampleAttributes[tech.deconTech.value];

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
            graphic.attributes.CONTAMUNIT = contamGraphic.attributes.CONTAMUNIT;
            graphic.attributes.CONTAMTYPE = contamGraphic.attributes.CONTAMTYPE;

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
        Object.keys(aoiData.graphics).forEach((key) => {
          const planGraphics = aoiData.graphics?.[key] ?? [];
          planGraphics.forEach((graphic) => {
            (
              contaminationMap.sketchLayer as __esri.GraphicsLayer
            ).graphics.forEach((contamGraphic) => {
              const contamValue = contamGraphic.attributes.CONTAMVAL as number;
              const outGeometry = geometryEngine.intersect(
                graphic.geometry,
                contamGraphic.geometry,
              ) as __esri.Geometry;
              if (!outGeometry) return;

              const clippedAreaM2 = calculateArea(outGeometry);
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
            });
          });
        });

        setAoiContamIntersect({
          contaminatedAoiAreas,
          graphics: aoiContamIntersectGraphics,
        });
      }
      // console.log('contaminedAoiAreas1: ', contaminatedAoiAreas);

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
  }, [
    aoiData,
    calculateArea,
    calculateResults,
    contaminationMap,
    defaultDeconSelections,
    edits,
    layers,
    mapView,
    nsiData,
    sampleAttributes,
    // selectedScenario,
    // setCalculateResults,
    setEdits,
    setJsonDownload,
  ]);

  // perform final calcs
  useEffect(() => {
    if (
      ['none', 'success'].includes(calculateResults.status) ||
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
    //   setCalculateResults({ status: 'none', panelOpen: false, data: null });
    //   return;
    // }
    let atLeastOneDeconTechSelection = false;
    scenarios.forEach((scenario) => {
      scenario.deconTechSelections.forEach((tech) => {
        if (tech.deconTech) atLeastOneDeconTechSelection = true;
      });
    });
    // console.log('atLeastOneDeconTechSelection: ', atLeastOneDeconTechSelection);
    if (!atLeastOneDeconTechSelection) {
      setCalculateResults({ status: 'none', panelOpen: false, data: null });
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
    scenarios.forEach((scenario) => {
      scenario.deconLayerResults.resultsTable = [];
      scenario.deconLayerResults.cost = 0;
      scenario.deconLayerResults.time = 0;
      scenario.deconLayerResults.wasteMass = 0;
      scenario.deconLayerResults.wasteVolume = 0;
      const curDeconTechSelections =
        scenario.deconTechSelections.length > 0
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

        // need to lookup stuff from sampleAttributes
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
        } = sampleAttributes[deconTech as any];

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

        scenario.deconLayerResults.cost += deconCost;
        scenario.deconLayerResults.time += deconTime;
        scenario.deconLayerResults.wasteVolume += solidWasteM3 + liquidWasteM3;
        scenario.deconLayerResults.wasteMass +=
          solidWasteMass + liquidWasteMass;
        scenario.deconLayerResults.resultsTable.push(jsonItem);

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

    const resultObject: CalculateResultsDataType = {
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
    setCalculateResults((calculateResults: CalculateResultsType) => {
      return {
        status: 'success',
        panelOpen: calculateResults.panelOpen,
        data: resultObject,
      };
    });
  }, [
    aoiData,
    calculateArea,
    calculateResults,
    contaminationMap,
    defaultDeconSelections,
    edits,
    layers,
    nsiData,
    sampleAttributes,
    // selectedScenario,
    setCalculateResults,
    setEdits,
    setJsonDownload,
  ]);

  useEffect(() => {
    if (!resultsOpen) return;

    const planId = 'contaminationMap';
    const planGraphics = nsiData.planGraphics[planId];

    const contaminationGraphicsClone: __esri.Graphic[] = [];
    const contaminatedAoiAreas: ContaminationPercentages = { [planId]: {} };
    const contaminationPercentages: ContaminationPercentages = { [planId]: {} };
    const planBuildingCfu: PlanBuildingCfu = { [planId]: 0 };
    if (contaminationMap && contaminationMap.sketchLayer.type === 'graphics') {
      // loop through structures
      planGraphics.graphics.forEach((graphic) => {
        // loop through contamination map features
        (contaminationMap.sketchLayer as __esri.GraphicsLayer).graphics.forEach(
          (contamGraphic) => {
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
          },
        );
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
    scenarios.forEach((scenario) => {
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
        scenario.deconTechSelections.length > 0
          ? scenario.deconTechSelections
          : defaultDeconSelections;
      let hasDeconTech = false;

      const aoiLayerGraphics =
        deconAoiLayer && deconAoiLayer.sketchLayer.type === 'graphics'
          ? deconAoiLayer.sketchLayer.graphics.toArray()
          : [];
      aoiLayerGraphics.forEach((graphic) => {
        const currContamGraphics =
          newContamGraphics.length > 0
            ? [...newContamGraphics]
            : contaminationGraphicsClone;
        newContamGraphics = [];
        currContamGraphics.forEach((contamGraphic) => {
          // console.log('graphic: ', graphic);
          // console.log('contamGraphic: ', contamGraphic);
          // call intersect to see if decon app intersects contamination map
          if (
            !graphic.geometry ||
            !contamGraphic.geometry ||
            !geometryEngine.intersects(graphic.geometry, contamGraphic.geometry)
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
          curDeconTechSelections.forEach((sel) => {
            if (sel.deconTech) hasDeconTech = true;

            // const avgFinal = sel.avgFinalContamination;
            if (sel.media.includes('Building')) {
              planData.graphics.forEach((graphic) => {
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

                const deconTech = sampleAttributes[sel.deconTech?.value];
                if (!deconTech) return;

                const { LOD_NON: contaminationRemovalFactor } =
                  sampleAttributes[sel.deconTech.value];
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
              });
            } else {
              surfaceRemovalCount += 1;
              if (!sel.pctAoi || !sel.deconTech) return; // || !areaContamReduced) return;

              // console.log('sel.media: ', sel.media);

              const { LOD_NON: contaminationRemovalFactor } =
                sampleAttributes[sel.deconTech.value];
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
              innerGeometry.forEach((contamGraphic) => {
                let buildingFootprint = 0;
                planData.graphics.forEach((graphic) => {
                  if (
                    !graphic.geometry ||
                    !contamGraphic ||
                    !geometryEngine.intersects(graphic.geometry, contamGraphic)
                  ) {
                    return;
                  }

                  buildingFootprint += graphic.attributes.footprintSqM;
                });

                // console.log('contaminatedSurfaceArea: ', contaminatedSurfaceArea);
                // console.log('buildingFootprint: ', buildingFootprint);
                // const nonBuildingArea = contaminatedSurfaceArea - buildingFootprint;
                // console.log('nonBuildingArea: ', nonBuildingArea);

                const area = calculateArea(contamGraphic);
                if (typeof area !== 'number') return;

                // contaminatedSurfaceArea += area;

                const surfaceArea = area - buildingFootprint;
                const areaMedia = surfaceArea * pctFactor;
                totalCfu +=
                  areaMedia * (contamVal * contaminationRemovalFactor);
              });

              // const surfaceArea = nonBuildingArea * pctFactor;
              // console.log('surfaceArea: ', surfaceArea);

              cfuReductionSurfaces += totalCfu;
            }
          });

          const avgSurfaceRemovalFactor =
            totalSurfaceRemovalFactor / surfaceRemovalCount;
          const avgSurfaceReductionFactor = parseSmallFloat(
            1 - avgSurfaceRemovalFactor,
          );
          console.log(
            'contamGraphic.attributes.CONTAMVAL: ',
            contamGraphic.attributes.CONTAMVAL,
          );
          console.log('avgSurfaceReductionFactor: ', avgSurfaceReductionFactor);
          const CONTAMVAL =
            contamGraphic.attributes.CONTAMVAL * avgSurfaceReductionFactor;

          if (newOuterContamGeometry) {
            const geometry = Array.isArray(newOuterContamGeometry)
              ? newOuterContamGeometry
              : [newOuterContamGeometry];
            if (geometry.length > 0) console.log('adding outer...');
            geometry.forEach((geom) => {
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
            });
          }

          if (innerGeometry.length > 0) console.log('adding inner...');
          innerGeometry.forEach((geom) => {
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
                symbol:
                  newCfu < detectionLimit
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
          });
        });
      });

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
              newG.symbol = new TextSymbol({
                ...baseBuildingSymbolProps,
                color:
                  g.attributes.CONTAMVAL < detectionLimit ? 'green' : 'red',
              });

              return newG;
            }),
          );
        }
      }
    });

    const contamMapUpdated = mapView?.map.layers.find(
      (l) => l.id === 'contaminationMapUpdated',
    ) as __esri.GraphicsLayer;
    console.log('contamMapUpdated: ', contamMapUpdated);
    if (contamMapUpdated) {
      console.log('newContamGraphics: ', newContamGraphics);
      contamMapUpdated.removeAll();
      contamMapUpdated.addMany(newContamGraphics);
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
    newDeconTechSelections.forEach((sel: any) => {
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
        contaminationMap.sketchLayer.graphics.forEach((contamGraphic) => {
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

          const area = calculateArea(contamGraphic);
          if (typeof area !== 'number') return;

          // contaminatedSurfaceArea += area;

          const surfaceArea = area - buildingFootprint;
          const areaMedia = surfaceArea * pctFactor;
          totalCfu += areaMedia * contamGraphic.attributes.CONTAMVAL;
        });
      }

      surfaceCfu += totalCfu;
    });

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
  }, [
    aoiData,
    aoiContamIntersect,
    calculateArea,
    contaminationMap,
    defaultDeconSelections,
    edits,
    layers,
    mapView,
    nsiData,
    resultsOpen,
    sampleAttributes,
    setEfficacyResults,
  ]);

  useEffect(() => {
    if (!resultsOpen || !contaminationMap) return;
    contaminationMap.sketchLayer.listMode = 'show';
  }, [contaminationMap, resultsOpen]);

  useEffect(() => {
    console.log('calculateResults: ', calculateResults);
  }, [calculateResults]);
}

// Allows using a dynamicPopup that has access to react state/context.
// This is primarily needed for sample popups.
export function useDynamicPopup() {
  // const { edits, setEdits, layers } = useContext(SketchContext);
  // const layerProps = useLayerProps();

  // const getSampleTemplate = (
  //   feature: any,
  //   fieldInfos: FieldInfos,
  //   includeControls: boolean,
  // ) => {
  //   const content = (
  //     <MapPopup
  //       features={[feature]}
  //       edits={edits}
  //       setEdits={setEdits}
  //       layers={layers}
  //       fieldInfos={fieldInfos}
  //       layerProps={layerProps}
  //       includeControls={includeControls}
  //       onClick={handlePopupClick}
  //     />
  //   );

  //   // wrap the content for esri
  //   const contentContainer = document.createElement('div');
  //   createRoot(contentContainer).render(content);

  //   return contentContainer;
  // };

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
            title: 'Delete Decon Technology',
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
    if (type === 'Area of Interest' || type === 'Samples' || type === 'VSP') {
      const actions = new Collection<any>();
      if (includeControls) {
        actions.addMany([
          {
            title: 'Delete Decon',
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
    // if (type === 'Samples' || type === 'VSP') {
    //   const fieldInfos = [
    //     { fieldName: 'DECISIONUNIT', label: 'Layer' },
    //     { fieldName: 'TYPE', label: 'Decon Technology' },
    //     { fieldName: 'SA', label: 'Application Max Area (sq m)' },
    //     { fieldName: 'AA', label: 'Actual Surface Area (sq m)' },
    //     { fieldName: 'AC', label: 'Equivalent TODS Decon Applications' },
    //     { fieldName: 'Notes', label: 'Notes' },
    //     {
    //       fieldName: 'MCPS',
    //       label: 'Setup Cost ($/application)',
    //     },
    //     {
    //       fieldName: 'TCPS',
    //       label: 'Application Cost ($/sq m)',
    //     },
    //     {
    //       fieldName: 'TTPK',
    //       label: 'Setup Time (hrs)',
    //     },
    //     { fieldName: 'TTC', label: 'Application Time (hrs/sq m)' },
    //     { fieldName: 'TTA', label: 'Residence Time (hrs)' },
    //     // {
    //     //   fieldName: 'TTPS',
    //     //   label: 'Total Time per Decon Application (person hrs/application)',
    //     // },
    //     { fieldName: 'LOD_P', label: 'Log Reduction' },
    //     {
    //       fieldName: 'LOD_NON',
    //       label: 'Contamination Removal (%)',
    //     },
    //     { fieldName: 'WVPS', label: 'Solid Waste Volume (cu m/sq m)' },
    //     { fieldName: 'WWPS', label: 'Solid Waste Mass (kg/sq m)' },
    //     { fieldName: 'ALC', label: 'Liquid Waste Volume (cu m/sq m)' },
    //     { fieldName: 'AMC', label: 'Liquid Waste Mass (kg/sq m)' },
    //   ];

    //   // add the contamination map related fields if necessary
    //   if (includeContaminationFields) {
    //     fieldInfos.push({
    //       fieldName: 'CONTAMTYPE',
    //       label: 'Contamination Type',
    //     });
    //     fieldInfos.push({ fieldName: 'CONTAMVAL', label: 'Activity' });
    //     fieldInfos.push({ fieldName: 'CONTAMUNIT', label: 'Unit of Measure' });
    //   }

    //   const actions = new Collection<any>();
    //   if (includeControls) {
    //     actions.addMany([
    //       {
    //         title: 'Delete Decon',
    //         id: 'delete',
    //         className: 'esri-icon-trash',
    //       },
    //       {
    //         title: 'View In Table',
    //         id: 'table',
    //         className: 'esri-icon-table',
    //       },
    //     ]);
    //   }

    //   return {
    //     title: '',
    //     content: (feature: any) =>
    //       getSampleTemplate(feature, fieldInfos, includeControls),
    //     actions,
    //   };
    // }

    return {};
  };
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

///////////////////////////////////////////////////////////////////
////////////////// Browser storage related hooks //////////////////
///////////////////////////////////////////////////////////////////

// Uses browser storage for holding graphics color.
function useGraphicColor() {
  const key = 'tots_polygon_symbol';

  const { setOptions } = useContext(DialogContext);
  const { defaultSymbols, setDefaultSymbols, setSymbolsInitialized } =
    useContext(SketchContext);

  // Retreives training mode data from browser storage when the app loads
  const [localPolygonInitialized, setLocalPolygonInitialized] = useState(false);
  useEffect(() => {
    if (localPolygonInitialized) return;

    setLocalPolygonInitialized(true);

    const polygonStr = readFromStorage(key);
    if (!polygonStr) {
      // if no key in browser storage, leave as default and say initialized
      setSymbolsInitialized(true);
      return;
    }

    const polygon = JSON.parse(polygonStr);

    // validate the polygon
    setDefaultSymbols(polygon);
    setSymbolsInitialized(true);
  }, [localPolygonInitialized, setDefaultSymbols, setSymbolsInitialized]);

  useEffect(() => {
    if (!localPolygonInitialized) return;

    const polygonObj = defaultSymbols as object;
    writeToStorage(key, polygonObj, setOptions);
  }, [defaultSymbols, localPolygonInitialized, setOptions]);
}

// // Uses browser storage for holding the training mode selection.
// function useTrainingModeStorage() {
//   const key = 'tots_training_mode';

//   const { setOptions } = useContext(DialogContext);
//   const { trainingMode, setTrainingMode } = useContext(NavigationContext);

//   // Retreives training mode data from browser storage when the app loads
//   const [localTrainingModeInitialized, setLocalTrainingModeInitialized] =
//     useState(false);
//   useEffect(() => {
//     if (localTrainingModeInitialized) return;

//     setLocalTrainingModeInitialized(true);

//     const trainingModeStr = readFromStorage(key);
//     if (!trainingModeStr) return;

//     const trainingMode = JSON.parse(trainingModeStr);
//     setTrainingMode(trainingMode);
//   }, [localTrainingModeInitialized, setTrainingMode]);

//   useEffect(() => {
//     if (!localTrainingModeInitialized) return;

//     writeToStorage(key, trainingMode, setOptions);
//   }, [trainingMode, localTrainingModeInitialized, setOptions]);
// }

// Uses browser storage for holding any editable layers.
function useEditsLayerStorage() {
  const key = 'tots_edits';
  const { setOptions } = useContext(DialogContext);
  const {
    defaultSymbols,
    edits,
    setEdits,
    layersInitialized,
    setLayersInitialized,
    layers,
    setLayers,
    map,
    symbolsInitialized,
    setAoiData,
  } = useContext(SketchContext);
  const getPopupTemplate = useDynamicPopup();
  const { loadedProjection } = useGeometryTools();

  // Retreives edit data from browser storage when the app loads
  useEffect(() => {
    if (
      !map ||
      !setEdits ||
      !setLayers ||
      !symbolsInitialized ||
      layersInitialized ||
      !loadedProjection
    )
      return;

    const editsStr = readFromStorage(key);
    if (!editsStr) {
      setLayersInitialized(true);
      return;
    }

    // change the edit type to add and set the edit context state
    const edits: EditsType = JSON.parse(editsStr);
    edits.edits.forEach((edit) => {
      edit.editType = 'add';
    });
    setEdits(edits);

    const newLayers: LayerType[] = [];
    const graphicsLayers: (__esri.GraphicsLayer | __esri.GroupLayer)[] = [];
    edits.edits.forEach((editsLayer) => {
      // add layer edits directly
      if (editsLayer.type === 'layer') {
        const outLayers = createLayer({
          defaultSymbols,
          editsLayer,
          getPopupTemplate,
          newLayers,
        });
        graphicsLayers.push(...outLayers);

        // if (editsLayer.layerType === 'Sampling Mask') {
        //   setAoiData((aoiDataCur: any) => {
        //     return {
        //       count: aoiDataCur.count + 1,
        //       graphics: outLayers[0].graphics.toArray(),
        //     } as any;
        //   });
        // }
      }
      // scenarios need to be added to a group layer first
      if (editsLayer.type === 'scenario') {
        const groupLayer = new GroupLayer({
          id: editsLayer.layerId,
          title: editsLayer.scenarioName,
          visible: true,
          listMode: 'show',
        });

        const sortBy = ['other', 'Samples', 'Image Analysis', 'AOI Assessed'];
        const layersCopy = [...editsLayer.layers];
        layersCopy.sort((a, b) => {
          return (
            sortBy.indexOf(getLayerType(a)) - sortBy.indexOf(getLayerType(b))
          );
        });

        // create the layers and add them to the group layer
        const scenarioLayers: __esri.GraphicsLayer[] = [];
        layersCopy.forEach((layer) => {
          // if (layer.layerType === 'AOI Assessed') {
          //   // create graphics layer
          //   const graphicsLayer = new GraphicsLayer({
          //     id: layer.layerId,
          //     title: 'AOI Assessment',
          //     listMode: 'show',
          //   });

          //   // create popup template
          //   const popupTemplate = {
          //     title: '',
          //     content: buildingMapPopup,
          //   };

          //   // process adds/updates/deletes/published
          //   const pointFeatures: __esri.Graphic[] = [];
          //   const idsUsed: string[] = [];
          //   const displayedFeatures: FeatureEditsType[] = [];

          //   // push the items from the adds array
          //   layer.adds.forEach((item) => {
          //     displayedFeatures.push(item);
          //     idsUsed.push(item.attributes['PERMANENT_IDENTIFIER']);
          //   });

          //   // push the items from the updates array
          //   layer.updates.forEach((item) => {
          //     displayedFeatures.push(item);
          //     idsUsed.push(item.attributes['PERMANENT_IDENTIFIER']);
          //   });

          //   // only push the ids of the deletes array to prevent drawing deleted items
          //   layer.deletes.forEach((item) => {
          //     idsUsed.push(item.PERMANENT_IDENTIFIER);
          //   });

          //   // add graphics from AGOL that haven't been changed
          //   layer.published.forEach((item) => {
          //     // don't re-add graphics that have already been added above
          //     if (idsUsed.includes(item.attributes['PERMANENT_IDENTIFIER']))
          //       return;

          //     displayedFeatures.push(item);
          //   });

          //   // add graphics to map
          //   displayedFeatures.forEach((graphic) => {
          //     const geometry = graphic.geometry as __esri.PointProperties;
          //     pointFeatures.push(
          //       new Graphic({
          //         attributes: { ...graphic.attributes },
          //         popupTemplate,
          //         symbol: new TextSymbol({
          //           text: '\ue687',
          //           color: 'blue',
          //           yoffset: -13,
          //           font: {
          //             family: 'CalciteWebCoreIcons',
          //             size: 24,
          //           },
          //         }),
          //         geometry: new Point({
          //           spatialReference: {
          //             wkid: 3857,
          //           },
          //           x: geometry.x,
          //           y: geometry.y,
          //         }),
          //       }),
          //     );
          //   });
          //   graphicsLayer.addMany(pointFeatures);

          //   scenarioLayers.push(graphicsLayer);

          //   newLayers.push({
          //     id: layer.id,
          //     pointsId: layer.pointsId,
          //     uuid: layer.uuid,
          //     layerId: layer.layerId,
          //     portalId: layer.portalId,
          //     value: layer.label,
          //     name: layer.name,
          //     label: layer.label,
          //     layerType: layer.layerType,
          //     editType: 'add',
          //     addedFrom: layer.addedFrom,
          //     status: layer.status,
          //     visible: layer.visible,
          //     listMode: layer.listMode,
          //     sort: layer.sort,
          //     geometryType: 'esriGeometryPolygon',
          //     sketchLayer: graphicsLayer,
          //     pointsLayer: null,
          //     hybridLayer: null,
          //     parentLayer: null,
          //   });
          // } else if (layer.layerType === 'Image Analysis') {
          //   // create graphics layer
          //   const graphicsLayer = new GraphicsLayer({
          //     id: layer.layerId,
          //     title: 'Imagery Analysis Results',
          //     listMode: 'show',
          //   });

          //   // create popup template
          //   const popupTemplate = {
          //     title: '',
          //     content: imageryAnalysisMapPopup,
          //   };

          //   // process adds/updates/deletes/published
          //   const polygonFeatures: __esri.Graphic[] = [];
          //   const idsUsed: string[] = [];
          //   const displayedFeatures: FeatureEditsType[] = [];

          //   // push the items from the adds array
          //   layer.adds.forEach((item) => {
          //     displayedFeatures.push(item);
          //     idsUsed.push(item.attributes['PERMANENT_IDENTIFIER']);
          //   });

          //   // push the items from the updates array
          //   layer.updates.forEach((item) => {
          //     displayedFeatures.push(item);
          //     idsUsed.push(item.attributes['PERMANENT_IDENTIFIER']);
          //   });

          //   // only push the ids of the deletes array to prevent drawing deleted items
          //   layer.deletes.forEach((item) => {
          //     idsUsed.push(item.PERMANENT_IDENTIFIER);
          //   });

          //   // add graphics from AGOL that haven't been changed
          //   layer.published.forEach((item) => {
          //     // don't re-add graphics that have already been added above
          //     if (idsUsed.includes(item.attributes['PERMANENT_IDENTIFIER']))
          //       return;

          //     displayedFeatures.push(item);
          //   });

          //   // add graphics to map
          //   displayedFeatures.forEach((graphic) => {
          //     const geometry = graphic.geometry as __esri.PolygonProperties;
          //     const category = graphic.attributes.category;
          //     const symbol = imageAnalysisSymbols.hasOwnProperty(category)
          //       ? (imageAnalysisSymbols as any)[category]
          //       : backupImagerySymbol;
          //     polygonFeatures.push(
          //       new Graphic({
          //         attributes: { ...graphic.attributes },
          //         popupTemplate,
          //         symbol,
          //         geometry: new Polygon({
          //           spatialReference: {
          //             wkid: 3857,
          //           },
          //           rings: geometry.rings,
          //         }),
          //       }),
          //     );
          //   });
          //   graphicsLayer.addMany(polygonFeatures);

          //   scenarioLayers.push(graphicsLayer);

          //   newLayers.push({
          //     id: layer.id,
          //     pointsId: layer.pointsId,
          //     uuid: layer.uuid,
          //     layerId: layer.layerId,
          //     portalId: layer.portalId,
          //     value: layer.label,
          //     name: layer.name,
          //     label: layer.label,
          //     layerType: layer.layerType,
          //     editType: 'add',
          //     addedFrom: layer.addedFrom,
          //     status: layer.status,
          //     visible: layer.visible,
          //     listMode: layer.listMode,
          //     sort: layer.sort,
          //     geometryType: 'esriGeometryPolygon',
          //     sketchLayer: graphicsLayer,
          //     pointsLayer: null,
          //     hybridLayer: null,
          //     parentLayer: null,
          //   });
          // } else {
          scenarioLayers.push(
            ...createLayer({
              defaultSymbols,
              editsLayer: layer,
              getPopupTemplate,
              newLayers,
              parentLayer: groupLayer,
            }),
          );
          // }
        });
        groupLayer.addMany(scenarioLayers);

        graphicsLayers.push(groupLayer);
      }
    });

    const newLayersOutput = [...layers];
    if (newLayers.length > 0) newLayersOutput.push(...newLayers);

    const newAoiData: AoiGraphics = {};
    const scenarios = edits.edits.filter(
      (e) => e.type === 'scenario',
    ) as ScenarioEditsType[];
    scenarios.forEach((scenario) => {
      console.log('scenario.label: ', scenario.label);
      console.log('scenario.aoiLayerMode: ', scenario.aoiLayerMode);
      if (!scenario.aoiLayerMode) return;

      console.log('scenario.importedAoiLayer: ', scenario.importedAoiLayer);

      let aoiLayer: LayerType | undefined = undefined;

      // locate the layer
      if (scenario.aoiLayerMode === 'draw') {
        const aoiEditsLayer = scenario.layers.find(
          (l) => l.layerType === 'Samples',
        );
        console.log('aoiEditsLayer: ', aoiEditsLayer);
        aoiLayer = newLayersOutput.find(
          (l) =>
            l.layerType === 'Samples' && l.layerId === aoiEditsLayer?.layerId,
        );
        console.log('aoiLayer: ', aoiLayer);
      }

      if (scenario.aoiLayerMode === 'file' && scenario.importedAoiLayer) {
        // locate the layer
        aoiLayer = newLayersOutput.find(
          (l) =>
            l.layerType === 'Area of Interest' &&
            l.layerId === scenario.importedAoiLayer?.layerId,
        );
      }

      if (aoiLayer?.sketchLayer && aoiLayer.sketchLayer.type === 'graphics') {
        console.log('graphics: ', aoiLayer.sketchLayer.graphics.toArray());
        // aoiGraphics.push(...aoiLayer.sketchLayer.graphics.toArray());
        newAoiData[scenario.layerId] = aoiLayer.sketchLayer.graphics.toArray();
      }
    });

    setAoiData((aoiData) => {
      return {
        count: aoiData.count + 1,
        graphics: newAoiData,
      };
    });

    if (newLayers.length > 0) {
      setLayers(newLayersOutput);
      map.addMany(graphicsLayers);
    }

    setLayersInitialized(true);
  }, [
    defaultSymbols,
    setAoiData,
    setEdits,
    getPopupTemplate,
    setLayers,
    layers,
    layersInitialized,
    setLayersInitialized,
    map,
    symbolsInitialized,
    loadedProjection,
  ]);

  // Saves the edits to browser storage everytime they change
  useEffect(() => {
    if (!layersInitialized) return;
    writeToStorage(key, edits, setOptions);
  }, [edits, layersInitialized, setOptions]);
}

// Uses browser storage for holding the reference layers that have been added.
function useReferenceLayerStorage() {
  const key = 'tots_reference_layers';
  const { setOptions } = useContext(DialogContext);
  const { map, referenceLayers, setReferenceLayers } =
    useContext(SketchContext);

  // Retreives reference layers from browser storage when the app loads
  const [localReferenceLayerInitialized, setLocalReferenceLayerInitialized] =
    useState(false);
  useEffect(() => {
    if (!map || !setReferenceLayers || localReferenceLayerInitialized) return;

    setLocalReferenceLayerInitialized(true);
    const referenceLayersStr = readFromStorage(key);
    if (!referenceLayersStr) return;

    const referenceLayers = JSON.parse(referenceLayersStr);

    // add the portal layers to the map
    const layersToAdd: __esri.FeatureLayer[] = [];
    referenceLayers.forEach((layer: any) => {
      const fields: __esri.Field[] = [];
      layer.fields.forEach((field: __esri.Field) => {
        fields.push(Field.fromJSON(field));
      });

      const source: any[] = [];
      layer.source.forEach((feature: any) => {
        source.push({
          attributes: feature.attributes,
          geometry: geometryJsonUtils.fromJSON(feature.geometry),
          popupTemplate: feature.popupTemplate,
          symbol: feature.symbol,
        });
      });

      const layerProps = {
        fields,
        source,
        id: layer.layerId,
        objectIdField: layer.objectIdField,
        outFields: layer.outFields,
        title: layer.title,
        renderer: rendererJsonUtils.fromJSON(layer.renderer),
        popupTemplate: layer.popupTemplate,
      };

      layersToAdd.push(new FeatureLayer(layerProps));
    });

    map.addMany(layersToAdd);
    setReferenceLayers(referenceLayers);
  }, [localReferenceLayerInitialized, map, setReferenceLayers]);

  // Saves the reference layers to browser storage everytime they change
  useEffect(() => {
    if (!localReferenceLayerInitialized) return;
    writeToStorage(key, referenceLayers, setOptions);
  }, [referenceLayers, localReferenceLayerInitialized, setOptions]);
}

// Uses browser storage for holding the url layers that have been added.
function useUrlLayerStorage() {
  const key = 'tots_url_layers';
  const { setOptions } = useContext(DialogContext);
  const { map, urlLayers, setUrlLayers } = useContext(SketchContext);

  // Retreives url layers from browser storage when the app loads
  const [localUrlLayerInitialized, setLocalUrlLayerInitialized] =
    useState(false);
  useEffect(() => {
    if (!map || !setUrlLayers || localUrlLayerInitialized) return;

    setLocalUrlLayerInitialized(true);
    const urlLayersStr = readFromStorage(key);
    if (!urlLayersStr) return;

    const urlLayers: UrlLayerType[] = JSON.parse(urlLayersStr);
    const newUrlLayers: UrlLayerType[] = [];

    // add the portal layers to the map
    urlLayers.forEach((urlLayer) => {
      const type = urlLayer.type;

      if (
        type === 'ArcGIS' ||
        type === 'WMS' ||
        // type === 'WFS' ||
        type === 'KML' ||
        type === 'GeoRSS' ||
        type === 'CSV'
      ) {
        newUrlLayers.push(urlLayer);
      }
    });

    setUrlLayers(newUrlLayers);
  }, [localUrlLayerInitialized, map, setUrlLayers]);

  // Saves the url layers to browser storage everytime they change
  useEffect(() => {
    if (!localUrlLayerInitialized) return;
    writeToStorage(key, urlLayers, setOptions);
  }, [urlLayers, localUrlLayerInitialized, setOptions]);

  // adds url layers to map
  useEffect(() => {
    if (!map || urlLayers.length === 0) return;

    // add the url layers to the map
    urlLayers.forEach((urlLayer) => {
      const type = urlLayer.type;
      const url = urlLayer.url;
      const id = urlLayer.layerId;

      const layerFound = map.layers.findIndex((l) => l.id === id) > -1;
      if (layerFound) return;

      let layer;
      if (type === 'ArcGIS') {
        Layer.fromArcGISServerUrl({ url, properties: { id } })
          .then((layer) => map.add(layer))
          .catch((err) => {
            console.error(err);

            window.logErrorToGa(err);
          });
        return;
      }
      if (type === 'WMS') {
        layer = new WMSLayer({ url, id });
      }
      /* // not supported in 4.x js api
      if(type === 'WFS') {
        layer = new WFSLayer({ url, id });
      } */
      if (type === 'KML') {
        layer = new KMLLayer({ url, id });
      }
      if (type === 'GeoRSS') {
        layer = new GeoRSSLayer({ url, id });
      }
      if (type === 'CSV') {
        layer = new CSVLayer({ url, id });
      }

      // add the layer if isn't null
      if (layer) {
        map.add(layer);
      }
    });
  }, [map, urlLayers]);
}

// Uses browser storage for holding the portal layers that have been added.
function usePortalLayerStorage() {
  const key = 'tots_portal_layers';
  const { setOptions } = useContext(DialogContext);
  const { map, portalLayers, setPortalLayers } = useContext(SketchContext);

  // Retreives portal layers from browser storage when the app loads
  const [localPortalLayerInitialized, setLocalPortalLayerInitialized] =
    useState(false);
  useEffect(() => {
    if (!map || !setPortalLayers || localPortalLayerInitialized) return;

    setLocalPortalLayerInitialized(true);
    const portalLayersStr = readFromStorage(key);
    if (!portalLayersStr) return;

    const portalLayers: PortalLayerType[] = JSON.parse(portalLayersStr);
    setPortalLayers(portalLayers);
  }, [localPortalLayerInitialized, map, portalLayers, setPortalLayers]);

  // Saves the portal layers to browser storage everytime they change
  useEffect(() => {
    if (!localPortalLayerInitialized) return;
    writeToStorage(key, portalLayers, setOptions);
  }, [portalLayers, localPortalLayerInitialized, setOptions]);

  // function setRenderer(layer: __esri.FeatureLayer, isPoints: boolean = false) {
  //   const type = isPoints ? 'simple-marker' : 'simple-fill';

  //   // 1,000,000 | 10,000,000 | 100,000,000
  //   layer.renderer = {
  //     type: 'class-breaks',
  //     field: 'CONTAMVAL',
  //     defaultSymbol: {
  //       type,
  //       color: [150, 150, 150, 0.2],
  //       outline: {
  //         color: [150, 150, 150],
  //         width: 2,
  //       },
  //     },
  //     classBreakInfos: [
  //       {
  //         minValue: 1,
  //         maxValue: 1_000_000,
  //         symbol: {
  //           type,
  //           color: [255, 255, 0, 0.7],
  //           outline: {
  //             color: [255, 255, 0],
  //             width: 2,
  //           },
  //         },
  //       },
  //       {
  //         minValue: 1_000_001,
  //         maxValue: 10_000_000,
  //         symbol: {
  //           type,
  //           color: [255, 165, 0, 0.7],
  //           outline: {
  //             color: [255, 165, 0],
  //             width: 2,
  //           },
  //         },
  //       },
  //       {
  //         minValue: 10_000_001,
  //         maxValue: Number.MAX_SAFE_INTEGER,
  //         symbol: {
  //           type,
  //           color: [255, 0, 0, 0.7],
  //           outline: {
  //             color: [255, 0, 0],
  //             width: 2,
  //           },
  //         },
  //       },
  //     ],
  //   } as any;
  // }

  // adds portal layers to map
  useEffect(() => {
    if (!map || portalLayers.length === 0) return;

    // add the portal layers to the map
    portalLayers.forEach((portalLayer) => {
      const id = portalLayer.id;

      const layerFound =
        map.layers.findIndex((l: any) => l?.portalItem?.id === id) > -1;
      if (layerFound) return;

      // Skip tots layers, since they are stored in edits.
      // The only reason tots layers are also in portal layers is
      // so the search panel will show the layer as having been
      // added.
      if (portalLayer.type === 'tots') return;
      // if (portalLayer.type === 'tots') {
      //   Layer.fromPortalItem({
      //     portalItem: new PortalItem({ id }),
      //   }).then((layer) => {
      //     // setup the watch event to see when the layer finishes loading
      //     reactiveUtils.watch(
      //       () => layer.loadStatus,
      //       () => {
      //         // set the status based on the load status
      //         if (layer.loadStatus === 'loaded') {
      //           console.log('layer.type: ', layer.type);
      //           if (layer.type === 'feature') {
      //             console.log('is a feature layer');
      //             setRenderer(layer as __esri.FeatureLayer);
      //           }
      //           if (layer.type === 'group') {
      //             console.log('is a group layer');
      //             const groupLayer = layer as __esri.GroupLayer;
      //             groupLayer.layers.forEach((layer, index) => {
      //               setRenderer(layer as __esri.FeatureLayer, index === 1);
      //             });
      //           }

      //           layer.visible = true;
      //         }
      //       },
      //     );

      //     // setWatcher(watcher);

      //     // add the layer to the map
      //     map.add(layer);
      //   });
      // } else {
      const layer = Layer.fromPortalItem({
        portalItem: new PortalItem({ id }),
      });
      map.add(layer);
      // }
    });
  }, [map, portalLayers]);
}

// Uses browser storage for holding the map's view port extent.
function useMapExtentStorage() {
  const key2d = 'tots_map_2d_extent';
  const key3d = 'tots_map_3d_extent';

  const { setOptions } = useContext(DialogContext);
  const { mapView, sceneView } = useContext(SketchContext);

  // Retreives the map position and zoom level from browser storage when the app loads
  const [localMapPositionInitialized, setLocalMapPositionInitialized] =
    useState(false);
  useEffect(() => {
    if (!mapView || !sceneView || localMapPositionInitialized) return;

    setLocalMapPositionInitialized(true);

    const position2dStr = readFromStorage(key2d);
    if (position2dStr) {
      const extent = JSON.parse(position2dStr) as any;
      mapView.extent = Extent.fromJSON(extent);
    }

    const position3dStr = readFromStorage(key3d);
    if (position3dStr) {
      const extent = JSON.parse(position3dStr) as any;
      sceneView.extent = Extent.fromJSON(extent);
    }

    setLocalMapPositionInitialized(true);
  }, [mapView, sceneView, localMapPositionInitialized]);

  // Saves the map position and zoom level to browser storage whenever it changes
  const [
    watchExtentInitialized,
    setWatchExtentInitialized, //
  ] = useState(false);
  useEffect(() => {
    if (!mapView || !sceneView || watchExtentInitialized) return;

    reactiveUtils.when(
      () => mapView.stationary,
      () => {
        if (mapView && mapView.extent && mapView.stationary) {
          writeToStorage(key2d, mapView.extent.toJSON(), setOptions);
        }
      },
    );
    reactiveUtils.watch(
      () => sceneView.stationary,
      () => {
        if (sceneView && sceneView.extent && sceneView.stationary) {
          writeToStorage(key3d, sceneView.extent.toJSON(), setOptions);
        }
      },
    );

    setWatchExtentInitialized(true);
  }, [
    mapView,
    sceneView,
    watchExtentInitialized,
    localMapPositionInitialized,
    setOptions,
  ]);
}

// Uses browser storage for holding the map's view port extent.
function useMapPositionStorage() {
  const key = 'tots_map_scene_position';

  const { setOptions } = useContext(DialogContext);
  const { mapView, sceneView } = useContext(SketchContext);

  // Retreives the map position and zoom level from browser storage when the app loads
  const [localMapPositionInitialized, setLocalMapPositionInitialized] =
    useState(false);
  useEffect(() => {
    if (!sceneView || localMapPositionInitialized) return;

    setLocalMapPositionInitialized(true);

    const positionStr = readFromStorage(key);
    if (!positionStr) return;

    const camera = JSON.parse(positionStr) as any;
    if (!sceneView.camera) sceneView.camera = {} as any;
    sceneView.camera.fov = camera.fov;
    sceneView.camera.heading = camera.heading;
    sceneView.camera.position = geometryJsonUtils.fromJSON(
      camera.position,
    ) as __esri.Point;
    sceneView.camera.tilt = camera.tilt;

    setLocalMapPositionInitialized(true);
  }, [sceneView, localMapPositionInitialized]);

  // Saves the map position and zoom level to browser storage whenever it changes
  const [
    watchExtentInitialized,
    setWatchExtentInitialized, //
  ] = useState(false);
  useEffect(() => {
    if (!mapView || !sceneView || watchExtentInitialized) return;

    reactiveUtils.watch(
      () => mapView.center,
      () => {
        if (!mapView.center) return;
        const cameraObj = {
          fov: sceneView.camera?.fov,
          heading: sceneView.camera?.heading,
          position: mapView.center.toJSON(),
          tilt: sceneView.camera?.tilt,
        };
        writeToStorage(key, cameraObj, setOptions);
      },
    );

    reactiveUtils.watch(
      () => sceneView.camera,
      () => {
        if (!sceneView.camera) return;
        const cameraObj = {
          fov: sceneView.camera.fov,
          heading: sceneView.camera.heading,
          position: sceneView.camera.position.toJSON(),
          tilt: sceneView.camera.tilt,
        };
        writeToStorage(key, cameraObj, setOptions);
      },
    );

    setWatchExtentInitialized(true);
  }, [
    mapView,
    sceneView,
    watchExtentInitialized,
    localMapPositionInitialized,
    setOptions,
  ]);
}

// Uses browser storage for holding the home widget's viewpoint.
function useHomeWidgetStorage() {
  const key2d = 'tots_home_2d_viewpoint';
  const key3d = 'tots_home_3d_viewpoint';

  const { setOptions } = useContext(DialogContext);
  const { homeWidget } = useContext(SketchContext);

  // Retreives the home widget viewpoint from browser storage when the app loads
  const [localHomeWidgetInitialized, setLocalHomeWidgetInitialized] =
    useState(false);
  useEffect(() => {
    if (!homeWidget || localHomeWidgetInitialized) return;

    setLocalHomeWidgetInitialized(true);

    const viewpoint2dStr = readFromStorage(key2d);
    const viewpoint3dStr = readFromStorage(key3d);

    if (viewpoint2dStr) {
      const viewpoint2d = JSON.parse(viewpoint2dStr) as any;
      homeWidget['2d'].viewpoint = Viewpoint.fromJSON(viewpoint2d);
    }
    if (viewpoint3dStr) {
      const viewpoint3d = JSON.parse(viewpoint3dStr) as any;
      homeWidget['3d'].viewpoint = Viewpoint.fromJSON(viewpoint3d);
    }
  }, [homeWidget, localHomeWidgetInitialized]);

  // Saves the home widget viewpoint to browser storage whenever it changes
  const [
    watchHomeWidgetInitialized,
    setWatchHomeWidgetInitialized, //
  ] = useState(false);
  useEffect(() => {
    if (!homeWidget || watchHomeWidgetInitialized) return;

    reactiveUtils.watch(
      () => homeWidget['2d']?.viewpoint,
      () => {
        writeToStorage(
          key2d,
          homeWidget['2d']?.viewpoint
            ? homeWidget['2d']?.viewpoint.toJSON()
            : {},
          setOptions,
        );
      },
    );

    reactiveUtils.watch(
      () => homeWidget['3d']?.viewpoint,
      () => {
        writeToStorage(
          key3d,
          homeWidget['3d']?.viewpoint
            ? homeWidget['3d']?.viewpoint.toJSON()
            : {},
          setOptions,
        );
      },
    );

    setWatchHomeWidgetInitialized(true);
  }, [homeWidget, watchHomeWidgetInitialized, setOptions]);
}

// Uses browser storage for holding the currently selected sample layer.
function useSamplesLayerStorage() {
  const key = 'tots_selected_sample_layer';
  const key2 = 'tots_selected_scenario';

  const { setOptions } = useContext(DialogContext);
  const {
    edits,
    layers,
    selectedScenario,
    setSelectedScenario,
    sketchLayer,
    setSketchLayer,
  } = useContext(SketchContext);

  // Retreives the selected sample layer (sketchLayer) from browser storage
  // when the app loads
  const [localSampleLayerInitialized, setLocalSampleLayerInitialized] =
    useState(false);
  useEffect(() => {
    if (layers.length === 0 || localSampleLayerInitialized) return;

    setLocalSampleLayerInitialized(true);

    // set the selected scenario first
    const scenarioId = readFromStorage(key2);
    const scenario = edits.edits.find(
      (item) => item.type === 'scenario' && item.layerId === scenarioId,
    );
    if (scenario) setSelectedScenario(scenario as ScenarioEditsType);

    // then set the layer
    const layerId = readFromStorage(key);
    if (!layerId) return;

    setSketchLayer(getLayerById(layers, layerId));
  }, [
    edits,
    layers,
    setSelectedScenario,
    setSketchLayer,
    localSampleLayerInitialized,
  ]);

  // Saves the selected sample layer (sketchLayer) to browser storage whenever it changes
  useEffect(() => {
    if (!localSampleLayerInitialized) return;

    const data = sketchLayer?.layerId ? sketchLayer.layerId : '';
    writeToStorage(key, data, setOptions);
  }, [sketchLayer, localSampleLayerInitialized, setOptions]);

  // Saves the selected scenario to browser storage whenever it changes
  useEffect(() => {
    if (!localSampleLayerInitialized) return;

    const data = selectedScenario?.layerId ? selectedScenario.layerId : '';
    writeToStorage(key2, data, setOptions);
  }, [selectedScenario, localSampleLayerInitialized, setOptions]);
}

// Uses browser storage for holding the currently selected contamination map layer.
function useContaminationMapStorage() {
  const key = 'tots_selected_contamination_layer';
  const { setOptions } = useContext(DialogContext);
  const { layers } = useContext(SketchContext);
  const {
    contaminationMap,
    setContaminationMap, //
  } = useContext(CalculateContext);

  // Retreives the selected contamination map from browser storage
  // when the app loads
  const [
    localContaminationLayerInitialized,
    setLocalContaminationLayerInitialized,
  ] = useState(false);
  useEffect(() => {
    if (layers.length === 0 || localContaminationLayerInitialized) return;

    setLocalContaminationLayerInitialized(true);

    const layerId = readFromStorage(key);
    if (!layerId) return;

    setContaminationMap(getLayerById(layers, layerId));
  }, [layers, setContaminationMap, localContaminationLayerInitialized]);

  // Saves the selected contamination map to browser storage whenever it changes
  useEffect(() => {
    if (!localContaminationLayerInitialized) return;

    const data = contaminationMap?.layerId ? contaminationMap.layerId : '';
    writeToStorage(key, data, setOptions);
  }, [contaminationMap, localContaminationLayerInitialized, setOptions]);
}

// Uses browser storage for holding the currently selected sampling mask layer.
function useGenerateRandomMaskStorage() {
  const key = 'tots_generate_random_mask_layer';
  const { setOptions } = useContext(DialogContext);
  const { layers } = useContext(SketchContext);
  const {
    aoiSketchLayer,
    setAoiSketchLayer, //
  } = useContext(SketchContext);

  // Retreives the selected sampling mask from browser storage
  // when the app loads
  const [localAoiLayerInitialized, setLocalAoiLayerInitialized] =
    useState(false);
  useEffect(() => {
    if (layers.length === 0 || localAoiLayerInitialized) return;

    setLocalAoiLayerInitialized(true);

    const layerId = readFromStorage(key);
    if (!layerId) return;

    setAoiSketchLayer(getLayerById(layers, layerId));
  }, [layers, setAoiSketchLayer, localAoiLayerInitialized]);

  // Saves the selected sampling mask to browser storage whenever it changes
  useEffect(() => {
    if (!localAoiLayerInitialized) return;

    const data = aoiSketchLayer?.layerId ? aoiSketchLayer.layerId : '';
    writeToStorage(key, data, setOptions);
  }, [aoiSketchLayer, localAoiLayerInitialized, setOptions]);
}

// Uses browser storage for holding the current calculate settings.
function useCalculateSettingsStorage() {
  const key = 'tots_calculate_settings';
  const { setOptions } = useContext(DialogContext);
  const {
    inputNumLabs,
    setInputNumLabs,
    inputNumLabHours,
    setInputNumLabHours,
    inputNumSamplingHours,
    setInputNumSamplingHours,
    inputNumSamplingPersonnel,
    setInputNumSamplingPersonnel,
    inputNumSamplingShifts,
    setInputNumSamplingShifts,
    inputNumSamplingTeams,
    setInputNumSamplingTeams,
    inputSamplingLaborCost,
    setInputSamplingLaborCost,
    inputSurfaceArea,
    setInputSurfaceArea,
  } = useContext(CalculateContext);

  type CalculateSettingsType = {
    numLabs: number;
    numLabHours: number;
    numSamplingHours: number;
    numSamplingPersonnel: number;
    numSamplingShifts: number;
    numSamplingTeams: number;
    samplingLaborCost: number;
    surfaceArea: number;
  };

  // Reads the calculate settings from browser storage.
  const [settingsInitialized, setSettingsInitialized] = useState(false);
  useEffect(() => {
    if (settingsInitialized) return;
    const settingsStr = readFromStorage(key);

    setSettingsInitialized(true);

    if (!settingsStr) return;
    const settings: CalculateSettingsType = JSON.parse(settingsStr);

    setInputNumLabs(settings.numLabs);
    setInputNumLabHours(settings.numLabHours);
    setInputNumSamplingHours(settings.numSamplingHours);
    setInputNumSamplingPersonnel(settings.numSamplingPersonnel);
    setInputNumSamplingShifts(settings.numSamplingShifts);
    setInputNumSamplingTeams(settings.numSamplingTeams);
    setInputSamplingLaborCost(settings.samplingLaborCost);
    setInputSurfaceArea(settings.surfaceArea);
  }, [
    setInputNumLabs,
    setInputNumLabHours,
    setInputNumSamplingHours,
    setInputNumSamplingPersonnel,
    setInputNumSamplingShifts,
    setInputNumSamplingTeams,
    setInputSamplingLaborCost,
    setInputSurfaceArea,
    settingsInitialized,
  ]);

  // Saves the calculate settings to browser storage
  useEffect(() => {
    const settings: CalculateSettingsType = {
      numLabs: inputNumLabs,
      numLabHours: inputNumLabHours,
      numSamplingHours: inputNumSamplingHours,
      numSamplingPersonnel: inputNumSamplingPersonnel,
      numSamplingShifts: inputNumSamplingShifts,
      numSamplingTeams: inputNumSamplingTeams,
      samplingLaborCost: inputSamplingLaborCost,
      surfaceArea: inputSurfaceArea,
    };

    writeToStorage(key, settings, setOptions);
  }, [
    inputNumLabs,
    inputNumLabHours,
    inputNumSamplingHours,
    inputNumSamplingPersonnel,
    inputNumSamplingShifts,
    inputNumSamplingTeams,
    inputSamplingLaborCost,
    inputSurfaceArea,
    setOptions,
  ]);
}

// Uses browser storage for holding the current tab and current tab's options.
function useCurrentTabSettings() {
  const key = 'tots_current_tab';

  type PanelSettingsType = {
    goTo: PanelValueType | '';
    goToOptions: GoToOptions;
  };

  const { setOptions } = useContext(DialogContext);
  const {
    goTo,
    setGoTo,
    goToOptions,
    setGoToOptions, //
  } = useContext(NavigationContext);

  // Retreives the current tab and current tab's options from browser storage
  const [
    localTabDataInitialized,
    setLocalTabDataInitialized, //
  ] = useState(false);
  useEffect(() => {
    if (localTabDataInitialized) return;

    setLocalTabDataInitialized(true);

    const dataStr = readFromStorage(key);
    if (!dataStr) return;

    const data: PanelSettingsType = JSON.parse(dataStr);

    setGoTo(data.goTo);
    setGoToOptions(data.goToOptions);
  }, [setGoTo, setGoToOptions, localTabDataInitialized]);

  // Saves the current tab and optiosn to browser storage whenever it changes
  useEffect(() => {
    if (!localTabDataInitialized) return;

    let data: PanelSettingsType = { goTo: '', goToOptions: null };

    // get the current value from storage, if it exists
    const dataStr = readFromStorage(key);
    if (dataStr) {
      data = JSON.parse(dataStr);
    }

    // Update the data values only if they have values.
    // This is because other components clear these once they have been applied
    // but the browser storage needs to hold onto it.
    if (goTo) data['goTo'] = goTo;
    if (goToOptions) data['goToOptions'] = goToOptions;

    // save to storage
    writeToStorage(key, data, setOptions);
  }, [goTo, goToOptions, localTabDataInitialized, setOptions]);
}

// Uses browser storage for holding the currently selected basemap.
function useBasemapStorage() {
  const key = 'tots_selected_basemap_layer';

  const { setOptions } = useContext(DialogContext);
  const { basemapWidget } = useContext(SketchContext);

  // Retreives the selected basemap from browser storage when the app loads
  const [
    localBasemapInitialized,
    setLocalBasemapInitialized, //
  ] = useState(false);
  const [
    watchHandler,
    setWatchHandler, //
  ] = useState<__esri.WatchHandle | null>(null);
  useEffect(() => {
    if (!basemapWidget || watchHandler || localBasemapInitialized) return;

    const portalId = readFromStorage(key);
    if (!portalId) {
      // early return since this field isn't in storage
      setLocalBasemapInitialized(true);
      return;
    }

    // create the watch handler for finding the selected basemap
    const newWatchHandle = basemapWidget.watch(
      'source.basemaps.length',
      (newValue) => {
        // wait for the basemaps to be populated
        if (newValue === 0) return;

        setLocalBasemapInitialized(true);

        // Search for the basemap with the matching portal id
        let selectedBasemap: __esri.Basemap | null = null;
        basemapWidget.source.basemaps.forEach((basemap) => {
          if (basemap.portalItem.id === portalId) selectedBasemap = basemap;
        });

        // Set the activeBasemap to the basemap that was found
        if (selectedBasemap) basemapWidget.activeBasemap = selectedBasemap;
      },
    );

    setWatchHandler(newWatchHandle);
  }, [basemapWidget, watchHandler, localBasemapInitialized]);

  // destroys the watch handler after initialization completes
  useEffect(() => {
    if (!watchHandler || !localBasemapInitialized) return;

    watchHandler.remove();
    setWatchHandler(null);
  }, [watchHandler, localBasemapInitialized]);

  // Saves the selected basemap to browser storage whenever it changes
  const [
    watchBasemapInitialized,
    setWatchBasemapInitialized, //
  ] = useState(false);
  useEffect(() => {
    if (!basemapWidget || !localBasemapInitialized || watchBasemapInitialized) {
      return;
    }

    basemapWidget.watch('activeBasemap.portalItem.id', (newValue) => {
      writeToStorage(key, newValue, setOptions);
    });

    setWatchBasemapInitialized(true);
  }, [
    basemapWidget,
    localBasemapInitialized,
    watchBasemapInitialized,
    setOptions,
  ]);
}

// Uses browser storage for holding the url layers that have been added.
function useUserDefinedSampleOptionsStorage() {
  const key = 'tots_user_defined_sample_options';
  const { setOptions } = useContext(DialogContext);
  const { userDefinedOptions, setUserDefinedOptions } =
    useContext(SketchContext);

  // Retreives url layers from browser storage when the app loads
  const [
    localUserDefinedSamplesInitialized,
    setLocalUserDefinedSamplesInitialized,
  ] = useState(false);
  useEffect(() => {
    if (!setUserDefinedOptions || localUserDefinedSamplesInitialized) return;

    setLocalUserDefinedSamplesInitialized(true);
    const userDefinedSamplesStr = readFromStorage(key);
    if (!userDefinedSamplesStr) return;

    const userDefinedSamples: SampleSelectType[] = JSON.parse(
      userDefinedSamplesStr,
    );

    setUserDefinedOptions(userDefinedSamples);
  }, [localUserDefinedSamplesInitialized, setUserDefinedOptions]);

  // Saves the url layers to browser storage everytime they change
  useEffect(() => {
    if (!localUserDefinedSamplesInitialized) return;
    writeToStorage(key, userDefinedOptions, setOptions);
  }, [userDefinedOptions, localUserDefinedSamplesInitialized, setOptions]);
}

// Uses browser storage for holding the url layers that have been added.
function useUserDefinedSampleAttributesStorage() {
  const key = 'tots_user_defined_sample_attributes';
  const sampleTypeContext = useSampleTypesContext();
  const { setOptions } = useContext(DialogContext);
  const {
    setSampleAttributes,
    userDefinedAttributes,
    setUserDefinedAttributes,
  } = useContext(SketchContext);

  // Retreives url layers from browser storage when the app loads
  const [
    localUserDefinedSamplesInitialized,
    setLocalUserDefinedSamplesInitialized,
  ] = useState(false);
  useEffect(() => {
    if (!setUserDefinedAttributes || localUserDefinedSamplesInitialized) return;

    setLocalUserDefinedSamplesInitialized(true);
    const userDefinedAttributesStr = readFromStorage(key);
    if (!userDefinedAttributesStr) return;

    // parse the storage value
    const userDefinedAttributesObj: UserDefinedAttributes = JSON.parse(
      userDefinedAttributesStr,
    );

    // set the state
    setUserDefinedAttributes(userDefinedAttributesObj);
  }, [
    localUserDefinedSamplesInitialized,
    setUserDefinedAttributes,
    sampleTypeContext,
    setSampleAttributes,
  ]);

  // add the user defined attributes to the global attributes
  useEffect(() => {
    // add the user defined attributes to the global attributes
    let newSampleAttributes: any = {};

    if (sampleTypeContext.status === 'success') {
      newSampleAttributes = { ...sampleTypeContext.data.sampleAttributes };
    }

    Object.keys(userDefinedAttributes.sampleTypes).forEach((key) => {
      newSampleAttributes[key] =
        userDefinedAttributes.sampleTypes[key].attributes;
    });

    // Update totsSampleAttributes variable on the window object. This is a workaround
    // to an issue where the sampleAttributes state variable is not available within esri
    // event handlers.
    (window as any).totsSampleAttributes = newSampleAttributes;

    setSampleAttributes(newSampleAttributes);
  }, [
    localUserDefinedSamplesInitialized,
    userDefinedAttributes,
    sampleTypeContext,
    setSampleAttributes,
  ]);

  // Saves the url layers to browser storage everytime they change
  useEffect(() => {
    if (!localUserDefinedSamplesInitialized) return;
    writeToStorage(key, userDefinedAttributes, setOptions);
  }, [userDefinedAttributes, localUserDefinedSamplesInitialized, setOptions]);
}

// Uses browser storage for holding the size and expand status of the bottom table.
function useTablePanelStorage() {
  const key = 'tots_table_panel';

  const { setOptions } = useContext(DialogContext);
  const {
    tablePanelExpanded,
    setTablePanelExpanded,
    tablePanelHeight,
    setTablePanelHeight,
  } = useContext(NavigationContext);

  // Retreives table info data from browser storage when the app loads
  const [tablePanelInitialized, setTablePanelInitialized] = useState(false);
  useEffect(() => {
    if (tablePanelInitialized) return;

    setTablePanelInitialized(true);

    const tablePanelStr = readFromStorage(key);
    if (!tablePanelStr) {
      // if no key in browser storage, leave as default and say initialized
      setTablePanelExpanded(false);
      setTablePanelHeight(200);
      return;
    }

    const tablePanel = JSON.parse(tablePanelStr);

    // save table panel info
    setTablePanelExpanded(tablePanel.expanded);
    setTablePanelHeight(tablePanel.height);
  }, [tablePanelInitialized, setTablePanelExpanded, setTablePanelHeight]);

  useEffect(() => {
    if (!tablePanelInitialized) return;

    const tablePanel: object = {
      expanded: tablePanelExpanded,
      height: tablePanelHeight,
    };
    writeToStorage(key, tablePanel, setOptions);
  }, [tablePanelExpanded, tablePanelHeight, tablePanelInitialized, setOptions]);
}

type SampleMetaDataType = {
  publishSampleTableMetaData: ServiceMetaDataType | null;
  sampleTableDescription: string;
  sampleTableName: string;
  selectedService: ServiceMetaDataType | null;
};

// Uses browser storage for holding the currently selected sample layer.
function usePublishStorage() {
  const key = 'tots_sample_type_selections';
  const key2 = 'tots_sample_table_metadata';
  const key3 = 'tots_publish_samples_mode';
  const key4 = 'tots_output_settings';

  const { setOptions } = useContext(DialogContext);
  const {
    publishSamplesMode,
    setPublishSamplesMode,
    publishSampleTableMetaData,
    setPublishSampleTableMetaData,
    sampleTableDescription,
    setSampleTableDescription,
    sampleTableName,
    setSampleTableName,
    sampleTypeSelections,
    setSampleTypeSelections,
    selectedService,
    setSelectedService,
    includePartialPlan,
    setIncludePartialPlan,
    includePartialPlanWebMap,
    setIncludePartialPlanWebMap,
    includePartialPlanWebScene,
    setIncludePartialPlanWebScene,
    includeCustomSampleTypes,
    setIncludeCustomSampleTypes,
    webMapReferenceLayerSelections,
    setWebMapReferenceLayerSelections,
    webSceneReferenceLayerSelections,
    setWebSceneReferenceLayerSelections,
  } = useContext(PublishContext);

  type OutputSettingsType = {
    includePartialPlan: boolean;
    includePartialPlanWebMap: boolean;
    includePartialPlanWebScene: boolean;
    includeCustomSampleTypes: boolean;
    webMapReferenceLayerSelections: any[];
    webSceneReferenceLayerSelections: any[];
  };

  // Retreives the selected sample layer (sketchLayer) from browser storage
  // when the app loads
  const [localSampleTypeInitialized, setLocalSampleTypeInitialized] =
    useState(false);
  useEffect(() => {
    if (localSampleTypeInitialized) return;

    setLocalSampleTypeInitialized(true);

    // set the selected scenario first
    const sampleSelectionsStr = readFromStorage(key);
    if (sampleSelectionsStr) {
      const sampleSelections = JSON.parse(sampleSelectionsStr);
      setSampleTypeSelections(sampleSelections as SampleTypeOptions);
    }

    // set the selected scenario first
    const sampleMetaDataStr = readFromStorage(key2);
    if (sampleMetaDataStr) {
      const sampleMetaData: SampleMetaDataType = JSON.parse(sampleMetaDataStr);
      setPublishSampleTableMetaData(sampleMetaData.publishSampleTableMetaData);
      setSampleTableDescription(sampleMetaData.sampleTableDescription);
      setSampleTableName(sampleMetaData.sampleTableName);
      setSelectedService(sampleMetaData.selectedService);
    }

    // set the selected scenario first
    const publishSamplesMode = readFromStorage(key3);
    if (publishSamplesMode !== null) {
      setPublishSamplesMode(publishSamplesMode as any);
    }

    // set the publish output settings
    const outputSettingsStr = readFromStorage(key4);
    if (outputSettingsStr !== null) {
      const outputSettings: OutputSettingsType = JSON.parse(outputSettingsStr);
      setIncludePartialPlan(outputSettings.includePartialPlan);
      setIncludePartialPlanWebMap(outputSettings.includePartialPlanWebMap);
      setIncludePartialPlanWebScene(outputSettings.includePartialPlanWebScene);
      setIncludeCustomSampleTypes(outputSettings.includeCustomSampleTypes);
      setWebMapReferenceLayerSelections(
        outputSettings.webMapReferenceLayerSelections,
      );
      setWebSceneReferenceLayerSelections(
        outputSettings.webSceneReferenceLayerSelections,
      );
    }
  }, [
    localSampleTypeInitialized,
    setIncludeCustomSampleTypes,
    setIncludePartialPlan,
    setIncludePartialPlanWebMap,
    setIncludePartialPlanWebScene,
    setPublishSamplesMode,
    setPublishSampleTableMetaData,
    setSampleTableDescription,
    setSampleTableName,
    setSampleTypeSelections,
    setSelectedService,
    setWebMapReferenceLayerSelections,
    setWebSceneReferenceLayerSelections,
  ]);

  // Saves the selected sample layer (sketchLayer) to browser storage whenever it changes
  useEffect(() => {
    if (!localSampleTypeInitialized) return;

    writeToStorage(key, sampleTypeSelections, setOptions);
  }, [sampleTypeSelections, localSampleTypeInitialized, setOptions]);

  // Saves the selected scenario to browser storage whenever it changes
  useEffect(() => {
    if (!localSampleTypeInitialized) return;

    const data = {
      publishSampleTableMetaData,
      sampleTableDescription,
      sampleTableName,
      selectedService,
    };
    writeToStorage(key2, data, setOptions);
  }, [
    localSampleTypeInitialized,
    publishSampleTableMetaData,
    sampleTableDescription,
    sampleTableName,
    selectedService,
    setOptions,
  ]);

  // Saves the selected scenario to browser storage whenever it changes
  useEffect(() => {
    if (!localSampleTypeInitialized) return;

    writeToStorage(key3, publishSamplesMode, setOptions);
  }, [publishSamplesMode, localSampleTypeInitialized, setOptions]);

  // Saves the publish output settings to browser storage whenever it changes
  useEffect(() => {
    if (!localSampleTypeInitialized) return;

    const settings: OutputSettingsType = {
      includePartialPlan,
      includePartialPlanWebMap,
      includePartialPlanWebScene,
      includeCustomSampleTypes,
      webMapReferenceLayerSelections,
      webSceneReferenceLayerSelections,
    };

    writeToStorage(key4, settings, setOptions);
  }, [
    includePartialPlan,
    includePartialPlanWebMap,
    includePartialPlanWebScene,
    includeCustomSampleTypes,
    localSampleTypeInitialized,
    setOptions,
    webMapReferenceLayerSelections,
    webSceneReferenceLayerSelections,
  ]);
}

// Uses browser storage for holding the display mode (points or polygons) selection.
function useDisplayModeStorage() {
  const key = 'tots_display_mode';

  const { setOptions } = useContext(DialogContext);
  const {
    displayDimensions,
    setDisplayDimensions,
    displayGeometryType,
    setDisplayGeometryType,
    terrain3dUseElevation,
    setTerrain3dUseElevation,
    terrain3dVisible,
    setTerrain3dVisible,
    viewUnderground3d,
    setViewUnderground3d,
  } = useContext(SketchContext);

  // Retreives display mode data from browser storage when the app loads
  const [localDisplayModeInitialized, setLocalDisplayModeInitialized] =
    useState(false);
  useEffect(() => {
    if (localDisplayModeInitialized) return;

    setLocalDisplayModeInitialized(true);

    const displayModeStr = readFromStorage(key);
    if (!displayModeStr) {
      setDisplayDimensions('2d');
      setDisplayGeometryType('polygons');
      setTerrain3dUseElevation(true);
      setTerrain3dVisible(true);
      setViewUnderground3d(false);
      return;
    }

    const displayMode = JSON.parse(displayModeStr);

    setDisplayDimensions(displayMode.dimensions);
    setDisplayGeometryType(displayMode.geometryType);
    setTerrain3dUseElevation(displayMode.terrain3dUseElevation);
    setTerrain3dVisible(displayMode.terrain3dVisible);
    setViewUnderground3d(displayMode.viewUnderground3d);
  }, [
    localDisplayModeInitialized,
    setDisplayDimensions,
    setDisplayGeometryType,
    setTerrain3dUseElevation,
    setTerrain3dVisible,
    setViewUnderground3d,
  ]);

  useEffect(() => {
    if (!localDisplayModeInitialized) return;

    const displayMode: object = {
      dimensions: displayDimensions,
      geometryType: displayGeometryType,
      terrain3dUseElevation,
      terrain3dVisible,
      viewUnderground3d,
    };
    writeToStorage(key, displayMode, setOptions);
  }, [
    displayDimensions,
    displayGeometryType,
    localDisplayModeInitialized,
    setOptions,
    terrain3dUseElevation,
    terrain3dVisible,
    viewUnderground3d,
  ]);
}

// Uses browser storage for holding the training mode selection.
function useDashboardPlanStorage() {
  const key = 'tots_dashboard_plan';

  const { hasCheckedSignInStatus, portal, signedIn } = useContext(
    AuthenticationContext,
  );
  const { setOptions } = useContext(DialogContext);
  const {
    dashboardProjects,
    selectedDashboardProject,
    setDashboardProjects,
    setSelectedDashboardProject,
  } = useContext(DashboardContext);

  // Retreives training mode data from browser storage when the app loads
  const [localTrainingModeInitialized, setLocalTrainingModeInitialized] =
    useState(false);
  useEffect(() => {
    if (!hasCheckedSignInStatus || !portal || localTrainingModeInitialized)
      return;

    setLocalTrainingModeInitialized(true);

    const trainingModeStr = readFromStorage(key);
    if (!trainingModeStr) return;

    const trainingMode = JSON.parse(trainingModeStr);
    setSelectedDashboardProject(trainingMode.selectedDashboardProject);
    setDashboardProjects(trainingMode.dashboardProjects);

    // TODO - Need to find a better way to do this. Will need to refactor refresh button code
    setTimeout(() => {
      const refreshButton = document.getElementById('dashboard-refresh-button');
      if (refreshButton) refreshButton.click();
    }, 500);
  }, [
    localTrainingModeInitialized,
    hasCheckedSignInStatus,
    portal,
    setDashboardProjects,
    setSelectedDashboardProject,
    signedIn,
  ]);

  useEffect(() => {
    if (!localTrainingModeInitialized) return;

    const dashboard: object = {
      dashboardProjects,
      selectedDashboardProject,
    };

    writeToStorage(key, dashboard, setOptions);
  }, [
    dashboardProjects,
    selectedDashboardProject,
    localTrainingModeInitialized,
    setOptions,
  ]);
}

// Uses browser storage for holding the training mode selection.
function usePlanSettingsStorage() {
  const key = 'tots_plan_settings';

  const { setOptions } = useContext(DialogContext);
  const { planSettings, setPlanSettings } = useContext(SketchContext);

  // Retreives training mode data from browser storage when the app loads
  const [localPlanSettingsInitialized, setLocalPlanSettingsInitialized] =
    useState(false);
  useEffect(() => {
    if (localPlanSettingsInitialized) return;

    setLocalPlanSettingsInitialized(true);

    const planSettingsStr = readFromStorage(key);
    if (!planSettingsStr) return;

    const planSettings = JSON.parse(planSettingsStr);
    setPlanSettings(planSettings);
  }, [localPlanSettingsInitialized, setPlanSettings]);

  useEffect(() => {
    if (!localPlanSettingsInitialized) return;

    writeToStorage(key, planSettings, setOptions);
  }, [planSettings, localPlanSettingsInitialized, setOptions]);
}

// Saves/Retrieves data to browser storage
export function useSessionStorage() {
  // useTrainingModeStorage();
  useGraphicColor();
  useEditsLayerStorage();
  useReferenceLayerStorage();
  useUrlLayerStorage();
  usePortalLayerStorage();
  useMapExtentStorage();
  useMapPositionStorage();
  useHomeWidgetStorage();
  useSamplesLayerStorage();
  useContaminationMapStorage();
  useGenerateRandomMaskStorage();
  useCalculateSettingsStorage();
  useCurrentTabSettings();
  useBasemapStorage();
  useUserDefinedSampleOptionsStorage();
  useUserDefinedSampleAttributesStorage();
  useTablePanelStorage();
  usePublishStorage();
  useDisplayModeStorage();
  useDashboardPlanStorage();
  usePlanSettingsStorage();
}
