/** @jsxImportSource @emotion/react */

import { v4 as uuidv4 } from 'uuid';
import AreaMeasurementAnalysis from '@arcgis/core/analysis/AreaMeasurementAnalysis';
import Collection from '@arcgis/core/core/Collection';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import Polygon from '@arcgis/core/geometry/Polygon';
import * as projection from '@arcgis/core/geometry/projection';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import { Dispatch, SetStateAction } from 'react';
// contexts
import { settingDefaults } from 'contexts/Calculate';
import { SampleTypes } from 'contexts/LookupFiles';
// utils
import {
  backupImagerySymbol,
  buildingColors,
  imageAnalysisSymbols,
} from 'utils/hooks';
// types
import { DefaultSymbolsType } from 'config/sampleAttributes';
import {
  EditsType,
  EditType,
  FeatureEditsType,
  LayerEditsType,
  ScenarioDeconEditsType,
  ScenarioEditsType,
} from 'types/Edits';
import { LayerType } from 'types/Layer';
import { AppType } from 'types/Navigation';
import {
  PolygonSymbol,
  SampleIssues,
  SampleIssuesOutput,
} from 'config/sampleAttributes';

const sketchSelectedClass = 'sketch-button-selected';

/**
 * Toggles the active status of sketch buttons.
 *
 * @param id of target sketch button
 * @returns whether or not button was made active or not
 */
export function activateSketchButton(id: string) {
  let wasSet = false;
  const sketchButtons = document.getElementsByClassName('sketch-button');
  for (let i = 0; i < sketchButtons.length; i++) {
    const sketchButton = sketchButtons[i];

    // make the button active if the id matches the provided id
    if (sketchButton.id === id) {
      // make the style of the button active
      if (!sketchButton.classList.contains(sketchSelectedClass)) {
        sketchButton.classList.add(sketchSelectedClass);
        wasSet = true;
      } else {
        // toggle the button off
        sketchButton.classList.remove(sketchSelectedClass);
        const activeElm = document?.activeElement as any;
        activeElm?.blur();
      }
      continue;
    }

    // remove the selected class from all other buttons
    if (sketchButton.classList.contains(sketchSelectedClass)) {
      sketchButton.classList.remove(sketchSelectedClass);
    }
  }

  return wasSet;
}

/**
 * Calculates the area of the provided graphic using a
 * spatial reference system based on where the sample is located.
 *
 * @param graphic The polygon to be converted
 * @returns The area of the provided graphic
 */
export async function calculateArea(
  graphic: __esri.Graphic,
  sceneView: __esri.SceneView | null,
  units: 'sqinches' | 'sqmeters' = 'sqmeters',
) {
  if (hasDifferingZ(graphic) && sceneView) {
    const areaMeasurement = new AreaMeasurementAnalysis({
      geometry: graphic.geometry,
      unit: 'square-meters',
    });

    // add to scene view
    sceneView.analyses.add(areaMeasurement);

    // retrieve measured results from analysis view
    const analysisView = (await sceneView.whenAnalysisView(
      areaMeasurement,
    )) as any; // any is workaround for type not having updating field
    await reactiveUtils.whenOnce(() => !analysisView.updating);
    const areaSM = analysisView.result.area.value;
    const areaSI = areaSM * 1550.0031000062;
    sceneView.analyses.remove(areaMeasurement);
    return units === 'sqinches' ? areaSI : areaSM;
  } else {
    await loadProjection();
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
    return geometryEngine.planarArea(
      projectedGeometry,
      units === 'sqinches' ? 109454 : 109404,
    );
  }
}

/**
 * Converts a polygon graphic to a point graphic.
 *
 * @param polygon The polygon to be converted
 * @returns A point graphic representation of the provided polygon
 */
export function convertToPoint(polygon: __esri.Graphic) {
  const symbol = getPointSymbol(polygon);

  // build the graphic
  return new Graphic({
    attributes: polygon.attributes,
    geometry: (polygon.geometry as any).centroid,
    popupTemplate: polygon.popupTemplate,
    symbol,
  });
}

/**
 * Converts an esri graphic object into a simpler object
 * for storing in the user's session storage.
 *
 * @param graphic The esri graphic to be stored
 * @returns simple graphic object with just attributes and geometry
 */
export function convertToSimpleGraphic(graphic: __esri.Graphic) {
  let geometry: __esri.Polygon | object = {};
  if (graphic?.geometry?.type === 'polygon') {
    geometry = graphic.geometry as __esri.Polygon;
  }
  if (graphic?.geometry?.type === 'point') {
    geometry = graphic.geometry as __esri.Point;
  }

  // currently we only have polygons
  // in the future we may need to add code to handle different geometry types
  return {
    attributes: graphic.attributes ? { ...graphic.attributes } : {},
    geometry,
  };
}

/**
 * Creates a square buffer around the center of the provided graphic,
 * where the width of the sqaure is the provided width.
 *
 * @param graphic The polygon to be converted
 */
export async function createBuffer(graphic: __esri.Graphic) {
  await loadProjection();
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
}

/**
 * Creates GraphicsLayers from the provided editsLayer. Layers
 * will be added to the newLayers. Layers will be added to the
 * parentLayer, if a parentLayer is provided.
 *
 * @param defaultSymbols Symbols for each sample type
 * @param editsLayer Edits Layer to create graphics layers from
 * @param getPopupTemplate Function for building popup templates
 * @param newLayers Array of layers to add the new layer to
 * @param parentLayer (Optional) The parent layer of the new layers
 * @returns
 */
export function createLayer({
  defaultSymbols,
  editsLayer,
  getPopupTemplate,
  newLayers,
  parentLayer = null,
}: {
  defaultSymbols: DefaultSymbolsType;
  editsLayer: LayerEditsType;
  getPopupTemplate: Function;
  newLayers: LayerType[];
  parentLayer?: __esri.GroupLayer | null;
}) {
  const isSamples =
    editsLayer.layerType === 'Samples' || editsLayer.layerType === 'VSP';

  const sketchLayer = new GraphicsLayer({
    title: editsLayer.label,
    id: editsLayer.uuid,
    visible: editsLayer.visible,
    listMode: editsLayer.listMode,
  });
  const pointsLayer = isSamples
    ? new GraphicsLayer({
        title: editsLayer.label,
        id: editsLayer.uuid + '-points',
        visible: false,
        listMode: 'hide',
      })
    : null;
  const hybridLayer = isSamples
    ? new GraphicsLayer({
        title: editsLayer.label,
        id: editsLayer.uuid + '-hybrid',
        visible: false,
        listMode: 'hide',
      })
    : null;

  const popupTemplate = getPopupTemplate(
    editsLayer.layerType,
    editsLayer.hasContaminationRan,
  );
  const polyFeatures: __esri.Graphic[] = [];
  const pointFeatures: __esri.Graphic[] = [];
  const hybridFeatures: __esri.Graphic[] = [];
  const idsUsed: string[] = [];
  const displayedFeatures: FeatureEditsType[] = [];

  // push the items from the adds array
  editsLayer.adds.forEach((item) => {
    displayedFeatures.push(item);
    idsUsed.push(item.attributes['PERMANENT_IDENTIFIER']);
  });

  // push the items from the updates array
  editsLayer.updates.forEach((item) => {
    displayedFeatures.push(item);
    idsUsed.push(item.attributes['PERMANENT_IDENTIFIER']);
  });

  // only push the ids of the deletes array to prevent drawing deleted items
  editsLayer.deletes.forEach((item) => {
    idsUsed.push(item.PERMANENT_IDENTIFIER);
  });

  // add graphics from AGOL that haven't been changed
  editsLayer.published.forEach((item) => {
    // don't re-add graphics that have already been added above
    if (idsUsed.includes(item.attributes['PERMANENT_IDENTIFIER'])) return;

    displayedFeatures.push(item);
  });

  // add graphics to the map
  displayedFeatures.forEach((graphic) => {
    let layerType = editsLayer.layerType;
    if (layerType === 'VSP') layerType = 'Samples';
    if (['Sampling Mask', 'Decon Mask'].includes(layerType))
      layerType = 'Area of Interest';

    // set the symbol styles based on sample/layer type
    let symbol = defaultSymbols.symbols[layerType] as any;
    if (defaultSymbols.symbols.hasOwnProperty(graphic.attributes.TYPEUUID)) {
      symbol = defaultSymbols.symbols[graphic.attributes.TYPEUUID];
    }
    if (layerType === 'AOI Assessed') {
      const occCls = graphic.attributes.OCC_CLS;
      symbol = new SimpleFillSymbol({
        color: buildingColors.hasOwnProperty(occCls)
          ? buildingColors[occCls]
          : buildingColors['Other'],
        outline: {
          color: [153, 153, 153, 64],
          width: 0.84,
        },
      });
    }
    if (layerType === 'Image Analysis') {
      const category = graphic.attributes.category;
      symbol = imageAnalysisSymbols.hasOwnProperty(category)
        ? (imageAnalysisSymbols as any)[category]
        : backupImagerySymbol;
    }

    const poly = new Graphic({
      attributes: { ...graphic.attributes },
      popupTemplate,
      symbol,
      geometry: new Polygon({
        spatialReference: {
          wkid: 3857,
        },
        rings: graphic.geometry.rings,
      }),
    });

    polyFeatures.push(poly);

    if (isSamples) {
      if (editsLayer.layerType !== 'Decon Mask')
        pointFeatures.push(convertToPoint(poly));
      hybridFeatures.push(
        poly.attributes.ShapeType === 'point'
          ? convertToPoint(poly)
          : poly.clone(),
      );
    }
  });
  sketchLayer.addMany(polyFeatures);
  if (isSamples && pointsLayer && hybridLayer) {
    pointsLayer.addMany(pointFeatures);
    hybridLayer.addMany(hybridFeatures);
  }

  newLayers.push({
    id: editsLayer.id,
    pointsId: editsLayer.pointsId,
    uuid: editsLayer.uuid,
    layerId: editsLayer.layerId,
    portalId: editsLayer.portalId,
    value: editsLayer.label,
    name: editsLayer.name,
    label: editsLayer.label,
    layerType: editsLayer.layerType,
    editType: 'add',
    addedFrom: editsLayer.addedFrom,
    status: editsLayer.status,
    visible: editsLayer.visible,
    listMode: editsLayer.listMode,
    sort: editsLayer.sort,
    geometryType: 'esriGeometryPolygon',
    sketchLayer,
    pointsLayer: isSamples ? pointsLayer : null,
    hybridLayer: isSamples ? hybridLayer : null,
    parentLayer,
  });

  if (isSamples && pointsLayer && hybridLayer)
    return [sketchLayer, pointsLayer, hybridLayer];
  else return [sketchLayer];
}

/**
 * Creates the edit template for sketchable layers.
 *
 * @param layerToEdit The layer object
 * @returns object representing the layer edit template
 */
export function createLayerEditTemplate(
  layerToEdit: LayerType,
  editType: EditType,
) {
  return {
    type: 'layer',
    id: layerToEdit.id,
    pointsId: layerToEdit.pointsId,
    uuid: layerToEdit.uuid,
    layerId: layerToEdit.sketchLayer.id,
    portalId: layerToEdit.portalId,
    name: layerToEdit.name,
    label: layerToEdit.label,
    layerType: layerToEdit.layerType,
    hasContaminationRan: false,
    addedFrom: layerToEdit.addedFrom,
    status: layerToEdit.status,
    editType,
    visible: layerToEdit.visible,
    listMode: layerToEdit.listMode,
    sort: layerToEdit.sort,
    adds: [],
    updates: [],
    deletes: [],
    published: [],
  } as LayerEditsType;
}

/**
 * Builds the default sample layer.
 *
 * @param name The name of the new layer
 * @param parentLayer (optional) The parent layer of the new layer
 * @returns LayerType The default sample layer
 */
export function createSampleLayer(
  isDecon = false,
  name: string = 'Default Sample Layer',
  parentLayer: __esri.GroupLayer | null = null,
) {
  let layerType = 'Samples';
  if (isDecon) {
    name = 'Area of Interest';
    layerType = 'Decon Mask';
  }

  const layerUuid = generateUUID();
  const graphicsLayer = new GraphicsLayer({
    id: layerUuid,
    title: name,
  });
  const pointsLayer = !isDecon
    ? new GraphicsLayer({
        id: layerUuid + '-points',
        title: name,
        visible: false,
        listMode: 'hide',
      })
    : null;
  const hybridLayer = !isDecon
    ? new GraphicsLayer({
        id: layerUuid + '-hybrid',
        title: name,
        visible: false,
        listMode: 'hide',
      })
    : null;

  return {
    id: -1,
    pointsId: -1,
    uuid: layerUuid,
    layerId: graphicsLayer.id,
    portalId: '',
    value: graphicsLayer.id,
    name,
    label: name,
    layerType,
    editType: 'add',
    visible: true,
    listMode: 'show',
    sort: 0,
    geometryType: 'esriGeometryPolygon',
    addedFrom: 'sketch',
    status: 'added',
    sketchLayer: graphicsLayer,
    pointsLayer,
    hybridLayer,
    parentLayer,
  } as LayerType;
}

/**
 * Makes all sketch buttons no longer active by removing
 * the sketch-button-selected class.
 */
export function deactivateButtons() {
  const buttons = document.querySelectorAll('.sketch-button');

  for (let i = 0; i < buttons.length; i++) {
    buttons[i].classList.remove('sketch-button-selected');
  }
}

/**
 * This function performs a deep copy, exluding functions,
 * of an object. This is mainly used for setting the edits
 * context variable.
 *
 * @param obj The object to copy.
 */
export function deepCopyObject(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * This function attempts to find the layer in edits.
 *
 * @param edits All of the sketch edits that have occurred
 * @param layerToFind The layer to find within the edits object
 * @returns the layer that was found in the edits object
 */
export function findLayerInEdits(
  edits: (ScenarioEditsType | ScenarioDeconEditsType | LayerEditsType)[],
  layerId: string,
) {
  // find the layer in the edits using it's id and name
  let scenarioIndex = -1;
  let layerIndex = -1;
  edits.forEach((edit, scenarioIdx) => {
    if (edit.type === 'layer' && edit.layerId === layerId) {
      // the desired item is a layer
      layerIndex = scenarioIdx;
    } else if (
      ['scenario', 'scenario-decon'].includes(edit.type) &&
      edit.layerId === layerId
    ) {
      // the desired item is a scenario
      scenarioIndex = scenarioIdx;
    } else if (edit.type === 'scenario' || edit.type === 'scenario-decon') {
      // search for the layer in scenarios
      edit.layers.forEach((layer, layerIdx) => {
        if (layer.layerId === layerId) {
          scenarioIndex = scenarioIdx;
          layerIndex = layerIdx;
        }
      });
    }
  });

  // get the scenario if the index was found
  let editsScenario: ScenarioEditsType | ScenarioDeconEditsType | null = null;
  if (scenarioIndex > -1) {
    editsScenario = edits[scenarioIndex] as
      | ScenarioEditsType
      | ScenarioDeconEditsType;
  }

  // get the layer if the index was found
  let editsLayer: LayerEditsType | null = null;
  if (editsScenario && layerIndex > -1) {
    // the layer is nested in a scenario
    editsLayer = editsScenario.layers[layerIndex];
  } else {
    // the layer is unlinked and at the root
    editsLayer = edits[layerIndex] as LayerEditsType;
  }

  return {
    scenarioIndex,
    layerIndex,
    editsScenario,
    editsLayer,
  };
}

/**
 * Generates a unique identifier (uuid) in uppercase.
 *
 * @returns string - A unique identifier (uuid).
 */
export function generateUUID() {
  return '{' + uuidv4().toUpperCase() + '}';
}

/**
 * Finds the center of the provided geometry
 *
 * @param geometry Geometry to get the center of
 * @returns Coordinates of the center of provided geometry
 */
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

/**
 * Gets a timestamp for the current date time formatted as
 * YYYY/MM/DD hh:mm:ss.s
 *
 * @returns a formatted timestamp of the current date/time
 */
export function getCurrentDateTime() {
  const currentdate = new Date();
  return (
    currentdate.getFullYear() +
    '/' +
    String(currentdate.getMonth() + 1).padStart(2, '0') +
    '/' +
    String(currentdate.getDate()).padStart(2, '0') +
    ' ' +
    String(currentdate.getHours()).padStart(2, '0') +
    ':' +
    String(currentdate.getMinutes()).padStart(2, '0') +
    ':' +
    String(currentdate.getSeconds()).padStart(2, '0') +
    '.' +
    currentdate.getMilliseconds()
  );
}

/**
 * Builds the default sampling mask layer.
 *
 * @returns LayerType The default sampling mask layer
 */
export function getDefaultSamplingMaskLayer() {
  const layerUuid = generateUUID();
  const graphicsLayer = new GraphicsLayer({
    id: layerUuid,
    title: 'Sketched Sampling Mask',
    listMode: 'hide',
  });

  return {
    id: -1,
    pointsId: -1,
    uuid: layerUuid,
    layerId: layerUuid,
    portalId: '',
    value: 'sketchAoi',
    name: 'Sketched Sampling Mask',
    label: 'Sketched Sampling Mask',
    layerType: 'Sampling Mask',
    scenarioName: '',
    scenarioDescription: '',
    editType: 'add',
    visible: true,
    listMode: 'hide',
    sort: 0,
    geometryType: 'esriGeometryPolygon',
    addedFrom: 'sketch',
    status: 'added',
    sketchLayer: graphicsLayer,
    pointsLayer: null,
    hybridLayer: null,
    parentLayer: null,
  } as LayerType;
}

/**
 * Gets the elevation layer from the map. This can be
 * used for querying the elevation of points on the map.
 *
 * @param map The map object
 * @returns Elevation layer
 */
export function getElevationLayer(map: __esri.Map) {
  return map.ground.layers.find(
    (l) => l.id === 'worldElevation',
  ) as __esri.ElevationLayer;
}

/**
 * Takes the graphics from the provided array of layers and
 * combines them in to a single array of graphics. Helpful
 * for zooming to multiple graphics layers.
 *
 * @param Layers - The layers to get a combined graphics array from.
 * @returns extent - The extent of the graphics layers
 */
export function getGraphicsArray(layers: (LayerType | null)[]) {
  let zoomGraphics: __esri.Graphic[] = [];
  layers.forEach((layer) => {
    if (layer?.sketchLayer?.type === 'graphics') {
      zoomGraphics = zoomGraphics.concat(layer.sketchLayer.graphics.toArray());
    }
  });

  return zoomGraphics;
}

/**
 *
 * @param edits Edits to search through for scenarios.
 * @param layers Layers to search through if there are no scenarios.
 * @param selectedScenario
 * @param sketchLayer
 */
export function getNextScenarioLayer(
  edits: EditsType,
  layers: LayerType[],
  selectedScenario: ScenarioEditsType | ScenarioDeconEditsType | null,
  sketchLayer: LayerType | null,
) {
  let nextScenario: ScenarioEditsType | ScenarioDeconEditsType | null = null;
  let nextLayer: LayerType | null = null;

  // determine which scenario to get layers for and
  // select a scenario if necessary
  const scenarios = getScenarios(edits);
  let layerEdits = edits.edits;
  if (selectedScenario) {
    // get the layers for the selected scenario
    layerEdits = selectedScenario.layers;
  }
  if (!selectedScenario && scenarios.length > 0) {
    // select the first availble scenario and get it's layers
    nextScenario = scenarios[0];
    layerEdits = scenarios[0].layers;
  }

  // get the first layer that can be used for sketching and return
  const sketchableLayers = getSketchableLayers(layers, layerEdits);
  if (!sketchLayer && sketchableLayers.length > 0) {
    // select the first availble sample layer. This will be
    // an unlinked layer if there is no selected scenario or
    // the selected scenario has no layers
    nextLayer = sketchableLayers[0];
  }

  const defaultLayerIndex = sketchableLayers.findIndex(
    (layer) => layer.name === 'Default Sample Layer',
  );

  return {
    nextScenario,
    nextLayer,
    defaultLayerIndex,
  };
}

/**
 * Gets a point symbol representation of the provided polygon.
 *
 * @param polygon The polygon to be converted
 * @returns A point symbol representation of the provided polygon
 */
export function getPointSymbol(
  polygon: __esri.Graphic,
  symbolColor: PolygonSymbol | null = null,
) {
  let point;
  if (polygon.symbol?.type?.includes('-3d')) {
    point = getPointSymbol3d(polygon, symbolColor);
  } else {
    point = getPointSymbol2d(polygon, symbolColor);
  }

  return point;
}

/**
 * Gets a point symbol representation of the provided polygon for 2d.
 *
 * @param polygon The polygon to be converted
 * @returns A point symbol representation of the provided polygon
 */
function getPointSymbol2d(
  polygon: __esri.Graphic,
  symbolColor: PolygonSymbol | null = null,
) {
  // get the point shape style (i.e. circle, triangle, etc.)
  let style = 'circle';
  let path = null;
  if (polygon.attributes?.POINT_STYLE) {
    // custom shape type
    if (polygon.attributes.POINT_STYLE.includes('path|')) {
      style = 'path';
      path = polygon.attributes.POINT_STYLE.split('|')[1];
    } else {
      style = polygon.attributes.POINT_STYLE;
    }
  }

  // build the symbol
  const symbol: any = {
    type: 'simple-marker',
    color: symbolColor ? symbolColor.color : polygon.symbol.color,
    outline: symbolColor
      ? symbolColor.outline
      : (polygon.symbol as any).outline,
    style: style,
  };
  if (path) symbol.path = path;

  return symbol;
}

/**
 * Gets a point symbol representation of the provided polygon for 3d.
 *
 * @param polygon The polygon to be converted
 * @returns A point symbol representation of the provided polygon
 */
function getPointSymbol3d(
  polygon: __esri.Graphic,
  symbolColor: PolygonSymbol | null = null,
) {
  // mapping 2d builtin shapes to 3d builtin shapes
  const shapeMapping: any = {
    circle: 'circle',
    cross: 'cross',
    diamond: 'kite',
    square: 'square',
    triangle: 'triangle',
    x: 'x',
  };

  // get the point shape style (i.e. circle, triangle, etc.)
  let style = 'circle';
  let path = null;
  if (polygon.attributes?.POINT_STYLE) {
    // custom shape type
    if (polygon.attributes.POINT_STYLE.includes('path|')) {
      style = 'path';

      // TODO need to figure out how to handle this
      path = polygon.attributes.POINT_STYLE.split('|')[1];
    } else {
      style = shapeMapping[polygon.attributes.POINT_STYLE];
    }
  }

  // build the symbol
  const symbol: any = {
    type: 'point-3d',
    symbolLayers: [
      {
        type: 'icon',
        // size:
        material: {
          color: symbolColor
            ? symbolColor.color
            : (polygon.symbol as any).symbolLayers.items[0].material.color,
        },
        outline: symbolColor
          ? {
              ...symbolColor.outline,
              size: symbolColor.outline.width,
            }
          : (polygon.symbol as any).symbolLayers.items[0].outline,
      },
    ],
  };

  if (path) symbol.path = path;
  else symbol.symbolLayers[0].resource = { primitive: style };

  return symbol;
}

/**
 * Gets the sample columns to include on the expandable table.
 *
 * @param tableWidth Used to determine how wide the columns should be.
 * @param includeContaminationFields Says whether or not to include the contamination columns or not.
 * @param useEqualWidth Forces the table to use equal width columns.
 */
export function getSampleTableColumns({
  tableWidth,
  includeContaminationFields,
  useEqualWidth = false,
}: {
  tableWidth: number;
  includeContaminationFields: boolean;
  useEqualWidth?: boolean;
}) {
  const baseColumnWidth = 100;
  const mediumColumnWidth = 140;
  const largeColumnWidth = 160;

  // add the base columns
  let columns: any[] = [
    {
      Header: 'PERMANENT_IDENTIFIER',
      accessor: 'PERMANENT_IDENTIFIER',
      width: 0,
      show: false,
    },
    {
      Header: 'DECISIONUNITUUID',
      accessor: 'DECISIONUNITUUID',
      width: 0,
      show: false,
    },
    {
      Header: 'Layer',
      accessor: 'DECISIONUNIT',
      width: largeColumnWidth,
    },
    {
      Header: 'Sample Type',
      accessor: 'TYPE',
      width: mediumColumnWidth,
    },
    {
      Header: 'Reference Surface Area (sq inch)',
      accessor: 'SA',
      width: baseColumnWidth,
    },
    {
      Header: 'Actual Surface Area (sq inch)',
      accessor: 'AA',
      width: baseColumnWidth,
    },
    {
      Header: 'Equivalent TOTS Samples',
      accessor: 'AC',
      width: baseColumnWidth,
    },
    // {
    //   Header: 'Total Cost Per Sample (Labor + Material + Waste)',
    //   accessor: 'TCPS',
    //   width: baseColumnWidth,
    // },
    {
      Header: 'Notes',
      accessor: 'Notes',
      width: largeColumnWidth,
    },
    {
      Header: 'Analysis Labor Cost ($)',
      accessor: 'ALC',
      width: baseColumnWidth,
    },
    {
      Header: 'Analysis Material Cost ($)',
      accessor: 'AMC',
      width: baseColumnWidth,
    },
    {
      Header: 'Sampling Material Cost ($/sample)',
      accessor: 'MCPS',
      width: baseColumnWidth,
    },
    {
      Header: 'Time to Prepare Kits (person hrs/sample)',
      accessor: 'TTPK',
      width: baseColumnWidth,
    },
    {
      Header: 'Time to Collect (person hrs/sample)',
      accessor: 'TTC',
      width: baseColumnWidth,
    },
    {
      Header: 'Time to Analyze (person hrs/sample)',
      accessor: 'TTA',
      width: baseColumnWidth,
    },
    // {
    //   Header: 'Total Time per Sample (person hrs/sample)',
    //   accessor: 'TTPS',
    //   width: baseColumnWidth,
    // },
    {
      Header: 'Limit of Detection (CFU) Porous',
      accessor: 'LOD_P',
      width: baseColumnWidth,
    },
    {
      Header: 'Limit of Detection (CFU) Nonporous',
      accessor: 'LOD_NON',
      width: baseColumnWidth,
    },
    {
      Header: 'Waste Volume (L/sample)',
      accessor: 'WVPS',
      width: baseColumnWidth,
    },
    {
      Header: 'Waste Weight (lbs/sample)',
      accessor: 'WWPS',
      width: baseColumnWidth,
    },
  ];

  // add the contamination hits columns, if necessary
  if (includeContaminationFields) {
    columns = [
      ...columns,
      {
        Header: 'Contamination Type',
        accessor: 'CONTAMTYPE',
        width: largeColumnWidth,
      },
      {
        Header: 'Activity',
        accessor: 'CONTAMVAL',
        width: baseColumnWidth,
      },
      {
        Header: 'Unit of Measure',
        accessor: 'CONTAMUNIT',
        width: baseColumnWidth,
      },
    ];
  }

  if (useEqualWidth) {
    // set the column widths
    const numColumns = columns.filter(
      (col) => typeof col.show !== 'boolean' || col.show,
    ).length;
    const columnWidth = tableWidth > 0 ? tableWidth / numColumns - 1 : 0;
    columns = columns.map((col) => {
      return {
        ...col,
        width: col.show === 'boolean' && !col.show ? 0 : columnWidth,
      };
    });
  }

  return columns;
}

/**
 * Gets the building info columns to include on the expandable table.
 *
 * @param tableWidth Used to determine how wide the columns should be.
 * @param useEqualWidth Forces the table to use equal width columns.
 */
export function getBuildingTableColumns({
  tableWidth,
  useEqualWidth = false,
}: {
  tableWidth: number;
  useEqualWidth?: boolean;
}) {
  const baseColumnWidth = 100;
  const mediumColumnWidth = 140;
  const largeColumnWidth = 160;

  // add the base columns
  let columns: any[] = [
    {
      Header: 'Building ID',
      accessor: 'BUILD_ID',
      width: 0,
      show: false,
    },
    {
      Header: 'Object ID',
      accessor: 'OBJECTID',
      width: 0,
      show: false,
    },
    {
      Header: 'UUID',
      accessor: 'UUID',
      width: 0,
      show: false,
    },
    {
      Header: 'Layer',
      accessor: 'layerName',
      width: baseColumnWidth,
    },
    {
      Header: 'Building Occupancy Classification',
      accessor: 'OCC_CLS',
      width: baseColumnWidth,
    },
    {
      Header: 'Primary Occupancy',
      accessor: 'PRIM_OCC',
      width: mediumColumnWidth,
    },
    {
      Header: 'Secondary Occupancy',
      accessor: 'SEC_OCC',
      width: baseColumnWidth,
    },
    {
      Header: 'Address',
      accessor: 'PROP_ADDR',
      width: baseColumnWidth,
    },
    {
      Header: 'City',
      accessor: 'PROP_CITY',
      width: baseColumnWidth,
    },
    {
      Header: 'State',
      accessor: 'PROP_ST',
      width: baseColumnWidth,
    },
    {
      Header: 'ZIP Code',
      accessor: 'PROP_ZIP',
      width: baseColumnWidth,
    },
    {
      Header: 'Outbuilding or Non-Primary Structure',
      accessor: 'OUTBLDG',
      width: baseColumnWidth,
    },
    {
      Header: 'Height (meters)',
      accessor: 'HEIGHT',
      width: baseColumnWidth,
    },
    {
      Header: 'Square Meters',
      accessor: 'SQMETERS',
      width: baseColumnWidth,
    },
    {
      Header: 'Square Feet',
      accessor: 'SQFEET',
      width: baseColumnWidth,
    },
    {
      Header: 'Highest Ground Elevation (meters)',
      accessor: 'H_ADJ_ELEV',
      width: baseColumnWidth,
    },
    {
      Header: 'Lowest Ground Elevation (meters)',
      accessor: 'L_ADJ_ELEV',
      width: baseColumnWidth,
    },
    {
      Header: 'County FIPS',
      accessor: 'FIPS',
      width: baseColumnWidth,
    },
    {
      Header: 'Census Tract Identifier',
      accessor: 'CENSUSCODE',
      width: baseColumnWidth,
    },
    {
      Header: 'Production Date',
      accessor: 'PROD_DATE',
      width: baseColumnWidth,
    },
    {
      Header: 'Source',
      accessor: 'SOURCE',
      width: baseColumnWidth,
    },
    {
      Header: 'USNG Coordinates',
      accessor: 'USNG',
      width: baseColumnWidth,
    },
    {
      Header: 'Longitude',
      accessor: 'LONGITUDE',
      width: baseColumnWidth,
    },
    {
      Header: 'Latitude',
      accessor: 'LATITUDE',
      width: baseColumnWidth,
    },
    {
      Header: 'Image Name',
      accessor: 'IMAGE_NAME',
      width: baseColumnWidth,
    },
    {
      Header: 'Image Date',
      accessor: 'IMAGE_DATE',
      width: baseColumnWidth,
    },
    {
      Header: 'Building Outline Validation Methodology',
      accessor: 'VAL_METHOD',
      width: baseColumnWidth,
    },
    {
      Header: 'Remarks',
      accessor: 'REMARKS',
      width: baseColumnWidth,
    },
    {
      Header: 'State FIPS',
      accessor: 'STATE_FIPS',
      width: baseColumnWidth,
    },
    {
      Header: 'Footprint Area (square meters)',
      accessor: 'footprintSqM',
      width: baseColumnWidth,
    },
    {
      Header: 'Floors Area (square meters)',
      accessor: 'floorsSqM',
      width: baseColumnWidth,
    },
    {
      Header: 'Total Area (square meters)',
      accessor: 'totalSqM',
      width: baseColumnWidth,
    },
    {
      Header: 'Ext Walls Area (square meters)',
      accessor: 'extWallsSqM',
      width: baseColumnWidth,
    },
    {
      Header: 'Int Walls Area (square meters)',
      accessor: 'intWallsSqM',
      width: baseColumnWidth,
    },
    {
      Header: 'Roof Area (square meters)',
      accessor: 'roofSqM',
      width: baseColumnWidth,
    },
    {
      Header: 'Footprint Area (square feet)',
      accessor: 'footprintSqFt',
      width: baseColumnWidth,
    },
    {
      Header: 'Floors Area (square feet)',
      accessor: 'floorsSqFt',
      width: baseColumnWidth,
    },
    {
      Header: 'Total Area (square feet)',
      accessor: 'totalSqFt',
      width: baseColumnWidth,
    },
    {
      Header: 'Ext Walls Area (square feet)',
      accessor: 'extWallsSqFt',
      width: baseColumnWidth,
    },
    {
      Header: 'Int Walls Area (square feet)',
      accessor: 'intWallsSqFt',
      width: baseColumnWidth,
    },
    {
      Header: 'Roof Area (square feet)',
      accessor: 'roofSqFt',
      width: baseColumnWidth,
    },
  ];

  if (window.location.search.includes('devMode=true')) {
    columns.push({
      Header: 'Contamination Type',
      accessor: 'CONTAMTYPE',
      width: largeColumnWidth,
    });
    columns.push({
      Header: 'Activity',
      accessor: 'CONTAMVAL',
      width: baseColumnWidth,
    });
    columns.push({
      Header: 'Unit of Measure',
      accessor: 'CONTAMUNIT',
      width: baseColumnWidth,
    });
  }

  if (useEqualWidth) {
    // set the column widths
    const numColumns = columns.filter(
      (col) => typeof col.show !== 'boolean' || col.show,
    ).length;
    const columnWidth = tableWidth > 0 ? tableWidth / numColumns - 1 : 0;
    columns = columns.map((col) => {
      return {
        ...col,
        width: col.show === 'boolean' && !col.show ? 0 : columnWidth,
      };
    });
  }

  return columns;
}

/**
 * Searches the edits storage variable to find all available
 * scenarios.
 *
 * @param edits The edits context variable to search through.
 */
export function getScenarios(edits: EditsType) {
  return edits.edits.filter(
    (item) => item.type === 'scenario',
  ) as ScenarioEditsType[];
}

/**
 * Searches the edits storage variable to find all available
 * scenarios.
 *
 * @param edits The edits context variable to search through.
 */
export function getScenariosDecon(edits: EditsType) {
  return edits.edits.filter(
    (item) => item.type === 'scenario-decon',
  ) as ScenarioDeconEditsType[];
}

/**
 * Creates a simple popup that contains all of the attributes on the
 * graphic.
 *
 * @param attributes Attributes to be placed in the popup content
 * @returns the json object to pass to the Esri PopupTemplate constructor.
 */
export function getSimplePopupTemplate(attributes: any) {
  return {
    title: '',
    content: [
      {
        type: 'fields',
        fieldInfos: Object.keys(attributes).map((key) => {
          return { fieldName: key, label: key };
        }),
      },
    ],
  };
}

/**
 * Gets an array of layers, included in the provided edits parameter,
 * that can be used with the sketch widget. The search will look in
 * child layers of scenarios as well.
 *
 * @param layers - The layers to search in.
 * @param edits - The edits to search in.
 */
export function getSketchableLayers(
  layers: LayerType[],
  edits: (ScenarioEditsType | ScenarioDeconEditsType | LayerEditsType)[],
) {
  return layers.filter(
    (layer) =>
      (layer.layerType === 'Samples' || layer.layerType === 'VSP') &&
      edits &&
      edits.findIndex(
        (editsLayer) =>
          editsLayer.type === 'layer' && editsLayer.layerId === layer.layerId,
      ) > -1,
  ) as LayerType[];
}

/**
 * Gets the z value from the provided graphic.
 *
 * @param graphic Graphic to get z value from.
 * @returns z value of the graphic
 */
export function getZValue(graphic: __esri.Graphic) {
  let z: number = 0;
  if (!graphic) return z;

  // get the z value from a point
  const point = graphic.geometry as __esri.Point;
  if (graphic.geometry.type === 'point') {
    z = point.z;
    return z;
  }

  if (graphic.geometry.type !== 'polygon') return 0;
  const poly = graphic.geometry as __esri.Polygon;

  // update the z value of the polygon if necessary
  const firstCoordinate = poly.rings?.[0]?.[0];
  if (firstCoordinate.length === 3) z = firstCoordinate[2];

  return z;
}

/**
 * Handles saving changes to samples from the popups.
 *
 * @param edits Edits to be updated.
 * @param setEdits React state setter for edits.
 * @param layers Layers to search through if there are no scenarios.
 * @param features Features to save changes too from the Popups.
 * @param type Type of change either Save or Move.
 * @param newLayer The new layer to move samples to. Only for "Move" type
 */
export function handlePopupClick(
  appType: AppType,
  edits: EditsType,
  setEdits: Dispatch<SetStateAction<EditsType>>,
  layers: LayerType[],
  features: any[],
  type: string,
  newLayer: LayerType | null = null,
) {
  if (features?.length > 0 && !features[0].graphic) return;

  // set the clicked button as active until the drawing is complete
  deactivateButtons();

  let editsCopy: EditsType = edits;

  // find the layer
  features.forEach((feature) => {
    const changes = new Collection<__esri.Graphic>();
    const tempGraphic = feature.graphic;
    const tempLayer = tempGraphic.layer as __esri.GraphicsLayer;
    const tempSketchLayer = layers.find(
      (layer) =>
        layer.layerId ===
        tempLayer.id.replace('-points', '').replace('-hybrid', ''),
    );
    if (!tempSketchLayer || tempSketchLayer.sketchLayer.type !== 'graphics') {
      return;
    }

    // find the graphic
    const graphic: __esri.Graphic = tempSketchLayer.sketchLayer.graphics.find(
      (item) =>
        item.attributes.PERMANENT_IDENTIFIER ===
        tempGraphic.attributes.PERMANENT_IDENTIFIER,
    );
    graphic.attributes = tempGraphic.attributes;

    const pointGraphic: __esri.Graphic | undefined =
      tempSketchLayer.pointsLayer?.graphics.find(
        (item) =>
          item.attributes.PERMANENT_IDENTIFIER ===
          graphic.attributes.PERMANENT_IDENTIFIER,
      );
    if (pointGraphic) pointGraphic.attributes = tempGraphic.attributes;

    const hybridGraphic: __esri.Graphic | undefined =
      tempSketchLayer.hybridLayer?.graphics.find(
        (item) =>
          item.attributes.PERMANENT_IDENTIFIER ===
          graphic.attributes.PERMANENT_IDENTIFIER,
      );
    if (hybridGraphic) hybridGraphic.attributes = tempGraphic.attributes;

    if (type === 'Save') {
      changes.add(graphic);

      // make a copy of the edits context variable
      editsCopy = updateLayerEdits({
        appType,
        edits: editsCopy,
        layer: tempSketchLayer,
        type: 'update',
        changes,
      });
    }
    if (type === 'Move' && newLayer) {
      const clonedGraphic = graphic.clone();
      setGeometryZValues(
        clonedGraphic.geometry as __esri.Point | __esri.Polygon,
        getZValue(feature.graphic),
      );

      // get items from sketch view model
      graphic.attributes.DECISIONUNITUUID = newLayer.uuid;
      graphic.attributes.DECISIONUNIT = newLayer.label;
      changes.add(clonedGraphic);

      // add the graphics to move to the new layer
      editsCopy = updateLayerEdits({
        appType,
        edits: editsCopy,
        layer: newLayer,
        type: 'add',
        changes,
      });

      // remove the graphics from the old layer
      editsCopy = updateLayerEdits({
        appType,
        edits: editsCopy,
        layer: tempSketchLayer,
        type: 'delete',
        changes,
      });

      // move between layers on map
      const tempNewLayer = newLayer.sketchLayer as __esri.GraphicsLayer;
      tempNewLayer.addMany(changes.toArray());
      tempSketchLayer.sketchLayer.remove(graphic);

      feature.graphic.layer = newLayer.sketchLayer;

      if (pointGraphic && tempSketchLayer.pointsLayer) {
        const clonedPointGraphic = pointGraphic.clone();
        setGeometryZValues(
          clonedPointGraphic.geometry as __esri.Point | __esri.Polygon,
          getZValue(feature.graphic),
        );

        clonedPointGraphic.attributes.DECISIONUNIT = newLayer.label;
        clonedPointGraphic.attributes.DECISIONUNITUUID = newLayer.uuid;

        const tempNewPointsLayer = newLayer.pointsLayer as __esri.GraphicsLayer;
        tempNewPointsLayer.add(clonedPointGraphic);
        tempSketchLayer.pointsLayer.remove(pointGraphic);
      }

      if (hybridGraphic && tempSketchLayer.hybridLayer) {
        const clonedHybridGraphic = hybridGraphic.clone();
        setGeometryZValues(
          clonedHybridGraphic.geometry as __esri.Point | __esri.Polygon,
          getZValue(feature.graphic),
        );

        hybridGraphic.attributes.DECISIONUNIT = newLayer.label;
        hybridGraphic.attributes.DECISIONUNITUUID = newLayer.uuid;

        const tempNewHybridLayer = newLayer.hybridLayer as __esri.GraphicsLayer;
        tempNewHybridLayer.add(clonedHybridGraphic);
        tempSketchLayer.hybridLayer.remove(hybridGraphic);
      }
    } else if (type === 'Update') {
      const clonedGraphic = graphic.clone();
      setGeometryZValues(
        clonedGraphic.geometry as __esri.Point | __esri.Polygon,
        getZValue(feature.graphic),
      );
      changes.add(clonedGraphic);

      // add the graphics to move to the new layer
      editsCopy = updateLayerEdits({
        appType,
        edits: editsCopy,
        layer: tempSketchLayer,
        type: 'update',
        changes,
      });

      // move between layers on map
      const tempNewLayer = tempSketchLayer.sketchLayer as __esri.GraphicsLayer;
      tempNewLayer.addMany(changes.toArray());
      tempSketchLayer.sketchLayer.remove(graphic);

      feature.graphic.layer = tempSketchLayer.sketchLayer;

      if (pointGraphic && tempSketchLayer.pointsLayer) {
        const clonedPointGraphic = pointGraphic.clone();
        setGeometryZValues(
          clonedPointGraphic.geometry as __esri.Point | __esri.Polygon,
          getZValue(feature.graphic),
        );
        tempSketchLayer.pointsLayer.add(clonedPointGraphic);
        tempSketchLayer.pointsLayer.remove(pointGraphic);
      }

      if (hybridGraphic && tempSketchLayer.hybridLayer) {
        const clonedHybridGraphic = hybridGraphic.clone();
        setGeometryZValues(
          clonedHybridGraphic.geometry as __esri.Point | __esri.Polygon,
          getZValue(feature.graphic),
        );
        tempSketchLayer.hybridLayer.add(clonedHybridGraphic);
        tempSketchLayer.hybridLayer.remove(hybridGraphic);
      }
    }
  });

  setEdits(editsCopy);
}

/**
 * Checks if all z values of the provided graphic are the same or not.
 *
 * @param graphic Graphic to get z value from.
 * @returns false if all z values are the same and true if any are different
 */
export function hasDifferingZ(graphic: __esri.Graphic) {
  if (!graphic || !graphic.geometry || graphic.geometry.type !== 'polygon')
    return false;

  const poly = graphic.geometry as __esri.Polygon;
  const firstCoordinate = poly.rings?.[0]?.[0];
  if (!firstCoordinate || firstCoordinate.length < 3) return false;

  const firstZ = firstCoordinate[2];
  let differentZ = false;
  poly.rings.forEach((ring) => {
    ring.forEach((coord) => {
      if (coord[2] !== firstZ) {
        differentZ = true;
      }
    });
  });

  return differentZ;
}

let loadedProjection: __esri.projection | null = null;
/**
 * Load the esri projection module. This needs
 * to happen before the projection module will work.
 */
async function loadProjection() {
  if (loadedProjection) return;
  await projection.load();
  loadedProjection = projection;
}

/**
 * Removes z values from the provided graphic. This is primarily
 * for calling the gp server.
 *
 * @param graphic Graphic to remove z values from.
 * @returns z value of the graphic that was removed
 */
export function removeZValues(graphic: __esri.Graphic) {
  let z: number = 0;

  // update the z value of the point if necessary
  const point = graphic.geometry as __esri.Point;
  if (graphic.geometry.type === 'point') {
    z = point.z;
    (point as any).z = undefined;
    point.hasZ = false;
    return z;
  }

  if (graphic.geometry.type !== 'polygon') return 0;
  const poly = graphic.geometry as __esri.Polygon;

  // update the z value of the polygon if necessary
  const firstCoordinate = poly.rings?.[0]?.[0];
  if (firstCoordinate.length === 3) z = firstCoordinate[2];

  const newRings: number[][][] = [];
  poly.rings.forEach((ring) => {
    const newCoords: number[][] = [];
    ring.forEach((coord) => {
      if (coord.length === 2) {
        newCoords.push(coord);
      } else {
        newCoords.push([coord[0], coord[1]]);
      }
    });
    newRings.push(newCoords);
  });
  poly.rings = newRings;
  poly.hasZ = false;

  return z;
}

/**
 * Validates that the area of samples is within tolerance and that sample
 * attributes match up with the predefined attributes.
 *
 * @param sampleTypes
 * @param graphics Array of graphics to validate
 * @param isFullGraphic If false, use default attributes when building sample
 * @param hasAllAttributes If true, validates all attributes against defaults
 * @returns Object detailing any issues found
 */
export async function sampleValidation(
  sampleTypes: SampleTypes | null,
  sceneView: __esri.SceneView | null,
  graphics: __esri.Graphic[],
  isFullGraphic: boolean = false,
  hasAllAttributes: boolean = true,
) {
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

  // Calculates area and checks if the sample area is within the allowable
  // tolerance of the reference surface area (SA) value
  async function performAreaToleranceCheck(graphic: __esri.Graphic) {
    // Get the area of the sample
    const area = await calculateArea(graphic, sceneView);
    if (typeof area !== 'number') return;

    // check that area is within allowable tolerance
    const difference = area - graphic.attributes.SA;
    sampleWithIssues.difference = difference;
    if (Math.abs(difference) > (sampleTypes?.areaTolerance ?? 1)) {
      areaOutOfTolerance = true;
      sampleWithIssues.areaOutOfTolerance = true;
    }
  }

  for (const simpleGraphic of graphics) {
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

    // Check if the sample is a predefined type or not
    if (
      sampleTypes?.sampleAttributes.hasOwnProperty(graphic.attributes.TYPEUUID)
    ) {
      await performAreaToleranceCheck(graphic);

      // check sample attributes against predefined attributes
      const predefinedAttributes: any =
        sampleTypes.sampleAttributes[graphic.attributes.TYPEUUID];
      for (const key in predefinedAttributes) {
        if (!sampleTypes.attributesToCheck.includes(key)) continue;
        if (!hasAllAttributes && !graphic.attributes.hasOwnProperty(key))
          continue;
        if (
          graphic.attributes.hasOwnProperty(key) &&
          predefinedAttributes[key] === graphic.attributes[key]
        ) {
          continue;
        }

        attributeMismatch = true;
        sampleWithIssues.attributeMismatch = true;
        sampleWithIssues.attributesWithMismatch.push(key);
      }
    } else {
      // Check area tolerance of user defined sample types
      if (graphic?.attributes?.SA) {
        await performAreaToleranceCheck(graphic);
      }
    }

    if (
      sampleWithIssues.areaOutOfTolerance ||
      sampleWithIssues.attributeMismatch
    ) {
      samplesWithIssues.push(sampleWithIssues);
    }
  }

  const output: SampleIssuesOutput = {
    areaOutOfTolerance,
    attributeMismatch,
    samplesWithIssues,
  };
  if (window.location.search.includes('devMode=true')) {
    console.log('sampleValidation: ', output);
  }

  return output;
}

/**
 * Updates the z value of the provided geometry.
 *
 * @param geometry geometry to set the z value on
 * @param z The z value to apply to the geometry
 */
export function setGeometryZValues(
  geometry: __esri.Polygon | __esri.Point,
  z: number,
) {
  if (geometry.type === 'point') geometry.z = z;
  else setPolygonZValues(geometry, z);
}

/**
 * Adds z value to every coordinate in a polygon, if necessary.
 *
 * @param poly Polygon to add z value to
 * @param z The value for z
 */
export function setPolygonZValues(poly: __esri.Polygon, z: number) {
  const newRings: number[][][] = [];
  poly.rings.forEach((ring) => {
    const newCoords: number[][] = [];
    ring.forEach((coord) => {
      if (coord.length === 2) {
        newCoords.push([...coord, z]);
      } else if (coord.length === 3) {
        newCoords.push([coord[0], coord[1], z]);
      } else {
        newCoords.push(coord);
      }
    });
    newRings.push(newCoords);
  });
  poly.rings = newRings;
  poly.hasZ = true;
}

/**
 * Sets the z values for a point or polygon. If the zRefParam
 * is provided the z value will be the elevation at that coordinate,
 * otherwise the z value will be the centroid of the geometry.
 *
 * @param map Map used for getting the elevation of a coordinate
 * @param graphic Graphic to add z value to
 * @param zRefParam (Optional) Point to use for getting the z value from
 * @param elevationSampler (Optional) Elevation sampler
 */
export async function setZValues({
  map,
  graphic,
  zRefParam = null,
  elevationSampler = null,
  zOverride = null,
}: {
  map: __esri.Map;
  graphic: __esri.Graphic;
  zRefParam?: __esri.Point | null;
  elevationSampler?: __esri.ElevationSampler | null;
  zOverride?: number | null;
}) {
  // get the elevation layer
  const elevationLayer = getElevationLayer(map);

  async function getZAtPoint(point: __esri.Point) {
    if (!elevationLayer && !elevationSampler) return 0;

    let geometry: __esri.Geometry;
    if (elevationSampler) {
      geometry = elevationSampler.queryElevation(point);
    } else {
      geometry = (await elevationLayer.queryElevation(point)).geometry;
    }

    return (geometry as __esri.Point).z;
  }

  // update the z value of the point if necessary
  const point = graphic.geometry as __esri.Point;
  if (graphic.geometry.type === 'point' && !point.z) {
    point.z = zOverride ?? (await getZAtPoint(point));
    return;
  }

  if (graphic.geometry.type !== 'polygon') return;
  const poly = graphic.geometry as __esri.Polygon;

  const zRef: __esri.Point = zRefParam ? zRefParam : poly.centroid;

  // update the z value of the polygon if necessary
  const firstCoordinate = poly.rings?.[0]?.[0];
  if (
    graphic.geometry.type === 'polygon' &&
    zRef &&
    (!poly.hasZ || firstCoordinate?.length === 2)
  ) {
    if (elevationLayer && firstCoordinate.length === 2) {
      const z = zOverride ?? (await getZAtPoint(zRef));
      setPolygonZValues(poly, z);
    } else if (firstCoordinate?.length === 3) {
      poly.hasZ = true;
    } else {
      setPolygonZValues(poly, zOverride ?? 0);
    }
  }
}

/**
 * Updates the edits object with the provided changes.
 *
 * @param edits The edits object to save the changes to.
 * @param scenario Used for adding a layer to a scenario.
 * @param layer The layer the changes pertain to
 * @param type The type of update being performed (add, update, delete, arcgis, or properties)
 * @param changes An object representing the changes being saved
 * @param hasContaminationRan Keeps track of whether or not contamination has ran for this layer
 */
export function updateLayerEdits({
  appType,
  edits,
  scenario,
  layer,
  type,
  changes,
  hasContaminationRan = false,
}: {
  appType: AppType;
  edits: EditsType;
  scenario?: ScenarioEditsType | ScenarioDeconEditsType | null;
  layer: LayerType;
  type: EditType;
  changes?: __esri.Collection<__esri.Graphic> | __esri.Graphic[];
  hasContaminationRan?: boolean;
}) {
  // make a copy of the edits context variable
  const editsCopy = deepCopyObject(edits) as EditsType;

  // find the layer's edit structure
  let { editsScenario, editsLayer } = findLayerInEdits(
    editsCopy.edits,
    layer.layerId,
  );
  if (scenario) {
    // find the provided scenario
    editsScenario = findLayerInEdits(
      editsCopy.edits,
      scenario.layerId,
    ).editsScenario;
  }

  // if it was not found create the edit template for this layer and
  // add it to the copy of edits
  if (!editsLayer) {
    editsLayer = createLayerEditTemplate(layer, type);

    // add the layer to a scenario if a scenario was found,
    // otherwise add the layer to the root of edits.
    if (editsScenario) {
      editsScenario.layers.push(editsLayer);
      if (editsScenario.status === 'published') editsScenario.status = 'edited';
    } else {
      editsCopy.edits.push(editsLayer);
    }
  } else if (scenario && editsScenario && type === 'move') {
    editsLayer.visible = true;
    editsLayer.adds = [...editsLayer.adds, ...editsLayer.updates];
    editsLayer.updates = [];
    editsLayer.published.forEach((edit) => {
      const indx = editsLayer.adds.findIndex(
        (x) =>
          x.attributes.PERMANENT_IDENTIFIER ===
          edit.attributes.PERMANENT_IDENTIFIER,
      );
      if (indx === -1) editsLayer.adds.push(edit);
    });
    editsLayer.published = [];
    editsLayer.deletes = [];
    editsScenario.layers.push(editsLayer);
    if (editsScenario.status === 'published') editsScenario.status = 'edited';
    editsCopy.edits = editsCopy.edits.filter(
      (edit) => edit.layerId !== editsLayer.layerId,
    );
  } else {
    // handle property changes
    if (editsScenario) {
      if (appType === 'sampling') {
        editsScenario.visible = layer.visible;
        editsScenario.listMode = layer.listMode;
      }
      if (editsScenario.status === 'published') editsScenario.status = 'edited';
    }

    editsLayer.visible = layer.sketchLayer.visible;
    editsLayer.listMode = layer.listMode;
    editsLayer.name = layer.name;
    editsLayer.label = layer.name;

    // if the status is published, set the status to edited to allow re-publishing
    if (layer.status === 'published') layer.status = 'edited';
    if (editsLayer.status === 'published') editsLayer.status = 'edited';
  }

  editsLayer.editType = type;

  // set the hasContaminationRan value (default is false)
  if (editsScenario?.type === 'scenario')
    editsScenario.hasContaminationRan = hasContaminationRan;
  editsLayer.hasContaminationRan = hasContaminationRan;

  if (changes) {
    if (type === 'replace') editsLayer.adds = [];

    // Add new graphics
    if (['add', 'replace'].includes(type)) {
      changes.forEach((change) => {
        const formattedChange = convertToSimpleGraphic(change);
        editsLayer.adds.push(formattedChange);
      });
    }

    // Add published graphics from arcgis
    if (type === 'arcgis') {
      changes.forEach((change) => {
        const formattedChange = convertToSimpleGraphic(change);
        editsLayer.published.push(formattedChange);
      });
    }

    // Apply the updates
    if (type === 'update') {
      changes.forEach((change) => {
        // all updates should have a graphicid
        if (!change?.attributes?.PERMANENT_IDENTIFIER) return;

        // attempt to find the graphic in edits.adds
        const addChangeIndex = editsLayer.adds.findIndex(
          (graphic) =>
            graphic.attributes.PERMANENT_IDENTIFIER ===
            change.attributes.PERMANENT_IDENTIFIER,
        );
        if (addChangeIndex > -1) {
          // Update the added item  and exit
          const formattedChange = convertToSimpleGraphic(change);
          editsLayer.adds[addChangeIndex] = formattedChange;

          return; // essentially a break on the forEach loop
        }

        // attempt to find the graphic in edits
        const existingChangeIndex = editsLayer.updates.findIndex(
          (graphic) =>
            graphic.attributes.PERMANENT_IDENTIFIER ===
            change.attributes.PERMANENT_IDENTIFIER,
        );

        // update the existing change, otherwise add the change to the updates
        const formattedChange = convertToSimpleGraphic(change);
        if (existingChangeIndex > -1) {
          editsLayer.updates[existingChangeIndex] = formattedChange;
        } else {
          editsLayer.updates.push(formattedChange);
        }
      });
    }

    // Append any deletes of items that have already been published
    if (type === 'delete') {
      // if this graphic is in the adds array, just delete it from the
      // adds array, since it hasn't been published yet
      changes.forEach((change) => {
        // attempt to find this id in adds
        const addChangeIndex = editsLayer.adds.findIndex(
          (graphic) =>
            graphic.attributes.PERMANENT_IDENTIFIER ===
            change.attributes.PERMANENT_IDENTIFIER,
        );
        if (addChangeIndex > -1) {
          // remove from adds and don't add to deletes
          editsLayer.adds = editsLayer.adds.filter(
            (graphic) =>
              graphic.attributes.PERMANENT_IDENTIFIER !==
              change.attributes.PERMANENT_IDENTIFIER,
          );

          return; // essentially a break on the forEach loop
        }

        // if the objectid is in the update list, remove it
        // attempt to find the graphic in edits
        editsLayer.updates = editsLayer.updates.filter(
          (graphic) =>
            graphic.attributes.PERMANENT_IDENTIFIER !==
            change.attributes.PERMANENT_IDENTIFIER,
        );

        // add the objectids to delete to the deletes array
        editsLayer.deletes.push({
          PERMANENT_IDENTIFIER: change.attributes.PERMANENT_IDENTIFIER,
          GLOBALID: change.attributes.GLOBALID,
          DECISIONUNITUUID: '',
        });
      });
    }
  }

  editsCopy.count = editsCopy.count + 1;

  return editsCopy;
}

/**
 * Updates the symbols of all of the graphics within the provided
 * graphics layers with the provided defaultSymbols.
 *
 * @param layers - The layers to update. FeatureLayers will be ignored.
 * @param defaultSymbols - The new default symbols.
 */
export function updatePointSymbol(
  layers: LayerType[],
  defaultSymbols: DefaultSymbolsType,
) {
  layers.forEach((layer) => {
    if (
      layer.pointsLayer?.type !== 'graphics' ||
      layer.hybridLayer?.type !== 'graphics'
    )
      return;

    layer.pointsLayer.graphics.forEach((graphic) => {
      if (graphic.geometry.type !== 'point') return;

      let layerType = layer.layerType;
      if (layerType === 'VSP') layerType = 'Samples';
      if (layerType === 'Sampling Mask') layerType = 'Area of Interest';

      // set the symbol based on sample/layer type
      let udtSymbol: PolygonSymbol | null = null;
      udtSymbol = defaultSymbols.symbols[layerType] as any;
      if (defaultSymbols.symbols.hasOwnProperty(graphic.attributes.TYPEUUID)) {
        udtSymbol = defaultSymbols.symbols[graphic.attributes.TYPEUUID] as any;
      }

      graphic.symbol = getPointSymbol(graphic, udtSymbol);
    });

    layer.hybridLayer.graphics.forEach((graphic) => {
      if (graphic.geometry.type !== 'point') return;

      let layerType = layer.layerType;
      if (layerType === 'VSP') layerType = 'Samples';
      if (layerType === 'Sampling Mask') layerType = 'Area of Interest';

      // set the symbol based on sample/layer type
      let udtSymbol: PolygonSymbol | null = null;
      udtSymbol = defaultSymbols.symbols[layerType] as any;
      if (defaultSymbols.symbols.hasOwnProperty(graphic.attributes.TYPEUUID)) {
        udtSymbol = defaultSymbols.symbols[graphic.attributes.TYPEUUID] as any;
      }

      graphic.symbol = getPointSymbol(graphic, udtSymbol);
    });
  });
}

/**
 * Updates the symbols of all of the graphics within the provided
 * graphics layers with the provided defaultSymbols.
 *
 * @param layers - The layers to update. FeatureLayers will be ignored.
 * @param defaultSymbols - The new default symbols.
 */
export function updatePolygonSymbol(
  layers: LayerType[],
  defaultSymbols: DefaultSymbolsType,
) {
  layers.forEach((layer) => {
    if (layer.sketchLayer.type !== 'graphics') return;

    layer.sketchLayer.graphics.forEach((graphic) => {
      if (graphic.geometry.type !== 'polygon') return;

      let layerType = layer.layerType;
      if (layerType === 'VSP') layerType = 'Samples';
      if (layerType === 'Sampling Mask') layerType = 'Area of Interest';

      // set the symbol based on sample/layer type
      graphic.symbol = defaultSymbols.symbols[layerType] as any;
      if (defaultSymbols.symbols.hasOwnProperty(graphic.attributes.TYPEUUID)) {
        graphic.symbol = defaultSymbols.symbols[
          graphic.attributes.TYPEUUID
        ] as any;
      }
    });
  });
}

export function createScenarioDecon(
  defaultDeconSelections: any[],
  scenarioName: string = 'Default Decon Scenario',
  scenarioDescription: string = '',
) {
  // create a new group layer for the scenario
  const groupLayer = new GroupLayer({
    title: scenarioName,
  });

  const layerUuidImageAnalysis = generateUUID();
  const graphicsLayerImageAnalysis = new GraphicsLayer({
    id: layerUuidImageAnalysis,
    title: 'Imagery Analysis Results',
    listMode: 'show',
  });

  const layerUuid = generateUUID();
  const graphicsLayer = new GraphicsLayer({
    id: layerUuid,
    title: 'AOI Assessment',
    listMode: 'show',
  });

  const newLayers: LayerEditsType[] = [];
  let tempSketchLayer: LayerType | null = null;
  let tempAssessedAoiLayer: LayerType | null = null;
  let tempImageAnalysisLayer: LayerType | null = null;

  tempAssessedAoiLayer = {
    id: -1,
    pointsId: -1,
    uuid: layerUuid,
    layerId: layerUuid,
    portalId: '',
    value: 'aoiAssessed',
    name: 'AOI Assessment',
    label: 'AOI Assessment',
    layerType: 'AOI Assessed',
    editType: 'add',
    visible: true,
    listMode: 'show',
    sort: 0,
    geometryType: 'esriGeometryPolygon',
    addedFrom: 'sketch',
    status: 'added',
    sketchLayer: graphicsLayer,
    pointsLayer: null,
    hybridLayer: null,
    parentLayer: groupLayer,
  } as LayerType;

  tempImageAnalysisLayer = {
    id: -1,
    pointsId: -1,
    uuid: layerUuidImageAnalysis,
    layerId: layerUuidImageAnalysis,
    portalId: '',
    value: 'aoiAssessed',
    name: 'Imagery Analysis Results',
    label: 'Imagery Analysis Results',
    layerType: 'Image Analysis',
    editType: 'add',
    visible: true,
    listMode: 'show',
    sort: 0,
    geometryType: 'esriGeometryPolygon',
    addedFrom: 'sketch',
    status: 'added',
    sketchLayer: graphicsLayerImageAnalysis,
    pointsLayer: null,
    hybridLayer: null,
    parentLayer: groupLayer,
  } as LayerType;

  if (newLayers.length === 0) {
    // no sketchable layers were available, create one
    tempSketchLayer = createSampleLayer(true, undefined, groupLayer);
    newLayers.push(createLayerEditTemplate(tempImageAnalysisLayer, 'add'));
    newLayers.push(createLayerEditTemplate(tempAssessedAoiLayer, 'add'));
    newLayers.push(createLayerEditTemplate(tempSketchLayer, 'add'));
  } else {
    newLayers.push(createLayerEditTemplate(tempImageAnalysisLayer, 'add'));
    newLayers.push(createLayerEditTemplate(tempAssessedAoiLayer, 'add'));
  }

  // create the scenario to be added to edits
  return {
    graphicsLayerImageAnalysis,
    graphicsLayer,
    groupLayer,
    layers: newLayers,
    sketchLayer: tempSketchLayer,
    scenario: {
      type: 'scenario-decon',
      id: -1,
      layerId: groupLayer.id,
      portalId: '',
      name: scenarioName,
      label: scenarioName,
      value: groupLayer.id,
      layerType: 'Decon',
      addedFrom: 'sketch',
      status: 'added',
      editType: 'add',
      visible: true,
      listMode: 'show',
      scenarioName: scenarioName,
      scenarioDescription: scenarioDescription,
      layers: newLayers,
      table: null,
      referenceLayersTable: {
        id: -1,
        referenceLayers: [],
      },
      customAttributes: [],
      deconTechSelections: defaultDeconSelections,
      deconSummaryResults: {
        summary: {
          totalAoiSqM: 0,
          totalBuildingFootprintSqM: 0,
          totalBuildingFloorsSqM: 0,
          totalBuildingSqM: 0,
          totalBuildingExtWallsSqM: 0,
          totalBuildingIntWallsSqM: 0,
          totalBuildingRoofSqM: 0,
        },
        aoiPercentages: {
          asphalt: 0,
          concrete: 0,
          soil: 0,
        },
        calculateResults: null,
      },
      aoiSummary: {
        area: 0,
        buildingFootprint: 0,
      },
      deconLayerResults: {
        cost: 0,
        time: 0,
        wasteVolume: 0,
        wasteMass: 0,
        resultsTable: [],
      },
      calculateSettings: { current: settingDefaults },
      importedAoiLayer: null,
      aoiLayerMode: 'draw',
      gsgFile: null,
    } as ScenarioDeconEditsType,
    tempAssessedAoiLayer,
    tempImageAnalysisLayer,
  };
}

/**
 * Sets renderer for TOTS layers being pulled into TODS. The renderer
 * color codes the samples based on the contamination value.
 *
 * @param layer - layer to set renderer on
 * @param isPoints - Are graphics points or polygons
 */
function setRenderer(layer: __esri.FeatureLayer, isPoints: boolean = false) {
  const type = isPoints ? 'simple-marker' : 'simple-fill';

  // 1,000,000 | 10,000,000 | 100,000,000
  layer.renderer = {
    type: 'class-breaks',
    field: 'CONTAMVAL',
    defaultSymbol: {
      type,
      color: [150, 150, 150, 0.2],
      outline: {
        color: [150, 150, 150],
        width: 2,
      },
    },
    classBreakInfos: [
      {
        minValue: 1,
        maxValue: 1_000_000,
        symbol: {
          type,
          color: [255, 255, 0, 0.7],
          outline: {
            color: [255, 255, 0],
            width: 2,
          },
        },
      },
      {
        minValue: 1_000_001,
        maxValue: 10_000_000,
        symbol: {
          type,
          color: [255, 165, 0, 0.7],
          outline: {
            color: [255, 165, 0],
            width: 2,
          },
        },
      },
      {
        minValue: 10_000_001,
        maxValue: Number.MAX_SAFE_INTEGER,
        symbol: {
          type,
          color: [255, 0, 0, 0.7],
          outline: {
            color: [255, 0, 0],
            width: 2,
          },
        },
      },
    ],
  } as any;
}

/**
 * Waits for layer and sub layers to load.
 *
 * @param layer - layer to wait for load
 * @returns - true if successfully loaded, false if failed
 */
function loadLayer(layer: __esri.Layer) {
  return new Promise((resolve, reject) => {
    // setup the watch event to see when the layer finishes loading
    if (layer.loadStatus === 'loaded') resolve(true);
    if (layer.loadStatus === 'failed') reject(false);

    const watcher = reactiveUtils.watch(
      () => layer.loadStatus,
      () => {
        // set the status based on the load status
        if (layer.loadStatus === 'loaded') {
          watcher.remove();
          resolve(true);
        } else if (layer.loadStatus === 'failed') {
          watcher.remove();
          reject(false);
        }
      },
    );
  });
}

/**
 * Waits for layers to load and sets renderers for TOTS layers
 * being pulled into TODS.
 *
 * @param layer - layer to set renderer on
 */
export async function applyRendererForTotsLayer(layer: __esri.Layer) {
  await loadLayer(layer);

  if (layer.type === 'feature') {
    setRenderer(layer as __esri.FeatureLayer);
  }
  if (layer.type === 'group') {
    for (const l of (layer as __esri.GroupLayer).layers) {
      await loadLayer(l);
      setRenderer(l as __esri.FeatureLayer, l.title.includes('-points'));
    }
  }

  layer.visible = true;
}
