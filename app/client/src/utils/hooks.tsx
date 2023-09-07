/** @jsxImportSource @emotion/react */

import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import Collection from '@arcgis/core/core/Collection';
import CSVLayer from '@arcgis/core/layers/CSVLayer';
import Extent from '@arcgis/core/geometry/Extent';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Field from '@arcgis/core/layers/support/Field';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import * as geometryJsonUtils from '@arcgis/core/geometry/support/jsonUtils';
import GeoRSSLayer from '@arcgis/core/layers/GeoRSSLayer';
import Graphic from '@arcgis/core/Graphic';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import KMLLayer from '@arcgis/core/layers/KMLLayer';
import Layer from '@arcgis/core/layers/Layer';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import PortalItem from '@arcgis/core/portal/PortalItem';
import * as projection from '@arcgis/core/geometry/projection';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import * as rendererJsonUtils from '@arcgis/core/renderers/support/jsonUtils';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import Viewpoint from '@arcgis/core/Viewpoint';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import WMSLayer from '@arcgis/core/layers/WMSLayer';
// components
import MapPopup from 'components/MapPopup';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { DialogContext, AlertDialogOptions } from 'contexts/Dialog';
import { useLayerProps, useSampleTypesContext } from 'contexts/LookupFiles';
import { NavigationContext } from 'contexts/Navigation';
import { PublishContext } from 'contexts/Publish';
import { SketchContext } from 'contexts/Sketch';
// types
import {
  CalculateResultsType,
  CalculateResultsDataType,
} from 'types/CalculateResults';
import { EditsType, ScenarioEditsType, ServiceMetaDataType } from 'types/Edits';
import {
  FieldInfos,
  LayerType,
  LayerTypeName,
  PortalLayerType,
  UrlLayerType,
} from 'types/Layer';
import { SampleTypeOptions } from 'types/Publish';
// config
import { PanelValueType } from 'config/navigation';
// utils
import {
  createLayer,
  findLayerInEdits,
  handlePopupClick,
} from 'utils/sketchUtils';
import { GoToOptions } from 'types/Navigation';
import {
  SampleIssues,
  SampleIssuesOutput,
  SampleSelectType,
  UserDefinedAttributes,
} from 'config/sampleAttributes';

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

    window.logToGa('send', 'exception', {
      exDescription: `${key}:${message}`,
      exFatal: false,
    });
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
    (graphic: __esri.Graphic) => {
      if (!loadedProjection) return 'ERROR - Projection library not loaded';

      // convert the geometry to WGS84 for geometryEngine
      // Cast the geometry as a Polygon to avoid typescript errors on
      // accessing the centroid.
      const wgsGeometry = webMercatorUtils.webMercatorToGeographic(
        graphic.geometry,
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

// Runs sampling plan calculations whenever the
// samples change or the variables on the calculate tab
// change.
export function useCalculatePlan() {
  const { edits, layers, selectedScenario, setEdits, setSelectedScenario } =
    useContext(SketchContext);
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

  const { calculateArea, loadedProjection } = useGeometryTools();

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
    if (!loadedProjection) return;
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
    let totalAreaSquereMeter = 0;
    const calcGraphics: __esri.Graphic[] = [];
    layers.forEach((layer) => {
      if (
        layer.parentLayer?.id !== selectedScenario.layerId ||
        layer.sketchLayer.type !== 'graphics'
      ) {
        return;
      }

      layer.sketchLayer.graphics.forEach((graphic) => {
        const calcGraphic = graphic.clone();

        // calculate the area using the custom hook
        const areaSM = calculateArea(graphic);
        if (typeof areaSM !== 'number') {
          return;
        }

        // convert area to square feet
        const areaSF = areaSM;
        totalAreaSquereMeter = totalAreaSquereMeter + areaSF;

        // Get the number of reference surface areas that are in the actual area.
        // This is to prevent users from cheating the system by drawing larger shapes
        // then the reference surface area and it only getting counted as "1" sample.
        const { SA } = calcGraphic.attributes;
        let areaCount = 1;
        if (areaSM >= SA) {
          areaCount = Math.round(areaSM / SA);
        }

        // set the AA on the original graphic, so it is visible in the popup
        graphic.setAttribute('AA', Math.round(areaSM));
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
      });
    });

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
    setTotalArea(totalAreaSquereMeter);
  }, [calculateArea, edits, layers, loadedProjection, selectedScenario]);

  // perform non-geospatial calculations
  useEffect(() => {
    // exit early checks
    if (!selectedScenario) return;
    if (calcGraphics.length === 0 || totalArea === 0) {
      setCalculateResults({ status: 'none', panelOpen: false, data: null });
      return;
    }

    const i = totals.sa; // iteration max area
    const n = totals.ac; // number of iterations (total area / iteration max area)
    const s = totals.ttpk; // setup time (hrs)
    const r = totals.tta; // residence time (hrs)
    const tm = totals.ttc; // time per decon
    const sc = totals.mcps; // setup cost
    const cm = totals.tcps; // cost per square meter

    const totalTimeMinutes = n * (s + r + tm * i);
    const totalTime = totalTimeMinutes / 60 / 24;
    const totalCost = n * (sc + cm * i);

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
      'Total Number of User-Defined Decon Technologies': calcGraphics.length,

      // assign counts
      'Total Number of Decon Applications': totals.ac,
      'Total Decontamination Area': totalArea,
      'Total Setup Time': totals.ttpk,
      'Total Application Time': totals.ttc,
      'Total Residence Time': totals.tta,
      'Average Contamination Removal':
        (totals.lod_non / calcGraphics.length) * 100,
      'Total Setup Cost': totals.mcps,
      'Total Application Cost': totals.tcps,
      'Solid Waste Volume': totals.wvps,
      'Solid Waste Mass': totals.wwps,
      'Liquid Waste Volume': totals.alc,
      'Liquid Waste Mass': totals.amc,
      'Total Waste Volume': totals.wvps + totals.alc,
      'Total Waste Mass': totals.wwps + totals.amc,

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
      'Total Cost': totalCost,
      'Total Time': Math.round(totalTime * 10) / 10,
      // 'Limiting Time Factor': limitingFactor,
    };

    // display loading spinner for 1 second
    setCalculateResults((calculateResults: CalculateResultsType) => {
      return {
        status: 'success',
        panelOpen: calculateResults.panelOpen,
        data: resultObject,
      };
    });

    ///////////////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////// Old Stuff      /////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////

    // const {
    //   NUM_LABS: numLabs,
    //   NUM_LAB_HOURS: numLabHours,
    //   NUM_SAMPLING_HOURS: numSamplingHours,
    //   NUM_SAMPLING_PERSONNEL: numSamplingPersonnel,
    //   NUM_SAMPLING_SHIFTS: numSamplingShifts,
    //   NUM_SAMPLING_TEAMS: numSamplingTeams,
    //   SAMPLING_LABOR_COST: samplingLaborCost,
    //   SURFACE_AREA: surfaceArea,
    // } = selectedScenario.calculateSettings.current;

    // // calculate spatial items
    // let userSpecifiedAOI = null;
    // let percentAreaSampled = null;
    // if (surfaceArea > 0) {
    //   userSpecifiedAOI = surfaceArea;
    //   percentAreaSampled = (totalArea / surfaceArea) * 100;
    // }

    // // calculate the sampling items
    // const samplingTimeHours = totals.ttpk + totals.ttc;
    // const samplingHours =
    //   numSamplingTeams * numSamplingHours * numSamplingShifts;
    // const samplingPersonnelHoursPerDay = samplingHours * numSamplingPersonnel;
    // const samplingPersonnelLaborCost = samplingLaborCost / numSamplingPersonnel;
    // const timeCompleteSampling = (totals.ttc + totals.ttpk) / samplingHours;
    // const totalSamplingLaborCost =
    //   numSamplingTeams *
    //   numSamplingPersonnel *
    //   numSamplingHours *
    //   numSamplingShifts *
    //   samplingPersonnelLaborCost *
    //   timeCompleteSampling;

    // // calculate lab throughput
    // const totalLabHours = numLabs * numLabHours;
    // let labThroughput = totals.tta / totalLabHours;

    // // calculate total cost and time
    // const totalSamplingCost = totalSamplingLaborCost + totals.mcps;
    // const totalAnalysisCost = totals.alc + totals.amc;
    // // const totalCost = totalSamplingCost + totalAnalysisCost;
    // const totalCost = totalSamplingCost;

    // // Calculate total time. Note: Total Time is the greater of sample collection time or Analysis Total Time.
    // // If Analysis Time is equal to or greater than Sampling Total Time then the value reported is total Analysis Time Plus one day.
    // // The one day accounts for the time samples get collected and shipped to the lab on day one of the sampling response.
    // // let totalTime = timeCompleteSampling;
    // // if (labThroughput + 1 < timeCompleteSampling) {
    // //   totalTime = timeCompleteSampling;
    // // } else {
    // //   labThroughput += 1;
    // //   totalTime = labThroughput;
    // // }

    // // Get limiting time factor (will be undefined if they are equal)
    // let limitingFactor: CalculateResultsDataType['Limiting Time Factor'] = '';
    // if (timeCompleteSampling > labThroughput) {
    //   limitingFactor = 'Decon';
    // } else {
    //   limitingFactor = 'Analysis';
    // }

    // const resultObject: CalculateResultsDataType = {
    //   // assign input parameters
    //   'User Specified Number of Available Teams for Decon': numSamplingTeams,
    //   'User Specified Personnel per Decon Team': numSamplingPersonnel,
    //   'User Specified Decon Team Hours per Shift': numSamplingHours,
    //   'User Specified Decon Team Shifts per Day': numSamplingShifts,
    //   'User Specified Decon Team Labor Cost': samplingLaborCost,
    //   'User Specified Number of Available Labs for Analysis': numLabs,
    //   'User Specified Analysis Lab Hours per Day': numLabHours,
    //   'User Specified Surface Area': surfaceArea,
    //   'Total Number of User-Defined Decon Technologies': calcGraphics.length,

    //   // assign counts
    //   'Total Number of Decon Applications': totals.ac,
    //   'Total Sampled Area': totalArea,
    //   'Time to Prepare Kits': totals.ttpk,
    //   'Time to Collect': totals.ttc,
    //   'Decon Technology Material Cost': totals.mcps,
    //   'Time to Analyze': totals.tta,
    //   'Analysis Labor Cost': totals.alc,
    //   'Analysis Material Cost': totals.amc,
    //   'Waste Volume': totals.wvps,
    //   'Waste Weight': totals.wwps,

    //   // spatial items
    //   'User Specified Total AOI': userSpecifiedAOI,
    //   'Percent of Area Sampled': percentAreaSampled,

    //   // sampling
    //   'Total Required Decon Time': samplingTimeHours,
    //   'Decon Hours per Day': samplingHours,
    //   'Decon Personnel hours per Day': samplingPersonnelHoursPerDay,
    //   'Decon Personnel Labor Cost': samplingPersonnelLaborCost,
    //   'Time to Complete Decon': timeCompleteSampling,
    //   'Total Decon Labor Cost': totalSamplingLaborCost,
    //   'Total Decon Cost': totalSamplingCost,
    //   'Total Analysis Cost': totalAnalysisCost,

    //   // analysis
    //   'Time to Complete Analyses': labThroughput,

    //   //totals
    //   'Total Cost': totalCost,
    //   'Total Time': Math.round(totalTime * 10) / 10,
    //   'Limiting Time Factor': limitingFactor,
    // };

    // // display loading spinner for 1 second
    // setCalculateResults((calculateResults: CalculateResultsType) => {
    //   return {
    //     status: 'success',
    //     panelOpen: calculateResults.panelOpen,
    //     data: resultObject,
    //   };
    // });
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

// Allows using a dynamicPopup that has access to react state/context.
// This is primarily needed for sample popups.
export function useDynamicPopup() {
  const { edits, setEdits, layers } = useContext(SketchContext);
  const layerProps = useLayerProps();

  const getSampleTemplate = (feature: any, fieldInfos: FieldInfos) => {
    const content = (
      <MapPopup
        features={[feature]}
        edits={edits}
        setEdits={setEdits}
        layers={layers}
        fieldInfos={fieldInfos}
        layerProps={layerProps}
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
  ) {
    if (type === 'Sampling Mask') {
      const actions = new Collection<any>();
      actions.addMany([
        {
          title: 'Delete Decon Technology',
          id: 'delete',
          className: 'esri-icon-trash',
        },
      ]);

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
        { fieldName: 'TYPE', label: 'Decon Technology' },
        { fieldName: 'SA', label: 'Iteration Max Area (sq m)' },
        { fieldName: 'AA', label: 'Actual Surface Area (sq m)' },
        { fieldName: 'AC', label: 'Equivalent TODS Decon Applications' },
        { fieldName: 'Notes', label: 'Notes' },
        {
          fieldName: 'MCPS',
          label: 'Setup Cost ($/application)',
        },
        {
          fieldName: 'TCPS',
          label: 'Application Cost ($/sq m)',
        },
        {
          fieldName: 'TTPK',
          label: 'Setup Time (hrs)',
        },
        { fieldName: 'TTC', label: 'Application Time (hrs/sq m)' },
        { fieldName: 'TTA', label: 'Residence Time (hrs)' },
        // {
        //   fieldName: 'TTPS',
        //   label: 'Total Time per Decon Application (person hrs/application)',
        // },
        { fieldName: 'LOD_P', label: 'Log Reduction' },
        {
          fieldName: 'LOD_NON',
          label: 'Contamination Removal (%)',
        },
        { fieldName: 'WVPS', label: 'Solid Waste Volume (cu m/sq m)' },
        { fieldName: 'WWPS', label: 'Solid Waste Mass (kg/sq m)' },
        { fieldName: 'ALC', label: 'Liquid Waste Volume (cu m/sq m)' },
        { fieldName: 'AMC', label: 'Liquid Waste Mass (kg/sq m)' },
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
      actions.addMany([
        {
          title: 'Delete Decon',
          id: 'delete',
          className: 'esri-icon-trash',
        },
        {
          title: 'View In Table',
          id: 'table',
          className: 'esri-icon-table',
        },
      ]);

      return {
        title: '',
        content: (feature: any) => getSampleTemplate(feature, fieldInfos),
        actions,
      };
    }

    return {};
  };
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
  } = useContext(SketchContext);
  const getPopupTemplate = useDynamicPopup();

  // Retreives edit data from browser storage when the app loads
  useEffect(() => {
    if (
      !map ||
      !setEdits ||
      !setLayers ||
      !symbolsInitialized ||
      layersInitialized
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
        graphicsLayers.push(
          ...createLayer({
            defaultSymbols,
            editsLayer,
            getPopupTemplate,
            newLayers,
          }),
        );
      }
      // scenarios need to be added to a group layer first
      if (editsLayer.type === 'scenario') {
        const groupLayer = new GroupLayer({
          id: editsLayer.layerId,
          title: editsLayer.scenarioName,
          visible: editsLayer.visible,
          listMode: editsLayer.listMode,
        });

        // create the layers and add them to the group layer
        const scenarioLayers: __esri.GraphicsLayer[] = [];
        editsLayer.layers.forEach((layer) => {
          scenarioLayers.push(
            ...createLayer({
              defaultSymbols,
              editsLayer: layer,
              getPopupTemplate,
              newLayers,
              parentLayer: groupLayer,
            }),
          );
        });
        groupLayer.addMany(scenarioLayers);

        graphicsLayers.push(groupLayer);
      }
    });

    if (newLayers.length > 0) {
      setLayers([...layers, ...newLayers]);
      map.addMany(graphicsLayers);
    }

    setLayersInitialized(true);
  }, [
    defaultSymbols,
    setEdits,
    getPopupTemplate,
    setLayers,
    layers,
    layersInitialized,
    setLayersInitialized,
    map,
    symbolsInitialized,
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

      const layer = Layer.fromPortalItem({
        portalItem: new PortalItem({ id }),
      });
      map.add(layer);
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
      setDisplayGeometryType('points');
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
}
