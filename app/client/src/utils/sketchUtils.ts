/** @jsxImportSource @emotion/react */

import { v4 as uuidv4 } from 'uuid';
import AreaMeasurementAnalysis from '@arcgis/core/analysis/AreaMeasurementAnalysis';
import Collection from '@arcgis/core/core/Collection';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Polygon from '@arcgis/core/geometry/Polygon';
import * as projection from '@arcgis/core/geometry/projection';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import { Dispatch, SetStateAction } from 'react';
// types
import {
  CalculateResultsTotsBaseType,
  CalculateResultsTotsDataType,
} from 'types/CalculateResults';
import {
  CalculateSettingsBaseType,
  EditsType,
  EditType,
  FeatureEditsType,
  LayerEditsType,
  ScenarioEditsType,
} from 'types/Edits';
import { LayerType } from 'types/Layer';
import { DefaultSymbolsType } from 'config/sampleAttributes';
// config
import { PolygonSymbol } from 'config/sampleAttributes';

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
  edits: (ScenarioEditsType | LayerEditsType)[],
  layerId: string,
) {
  // find the layer in the edits using it's id and name
  let scenarioIndex = -1;
  let layerIndex = -1;
  edits.forEach((edit, scenarioIdx) => {
    if (edit.type === 'layer' && edit.layerId === layerId) {
      // the desired item is a layer
      layerIndex = scenarioIdx;
    } else if (edit.type === 'scenario' && edit.layerId === layerId) {
      // the desired item is a scenario
      scenarioIndex = scenarioIdx;
    } else if (edit.type === 'scenario') {
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
  let editsScenario: ScenarioEditsType | null = null;
  if (scenarioIndex > -1) {
    editsScenario = edits[scenarioIndex] as ScenarioEditsType;
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
 * Calculates the area of the provided graphic using a
 * spatial reference system based on where the sample is located.
 *
 * @param graphic The polygon to be converted
 * @returns The area of the provided graphic
 */
async function calculateArea(
  graphic: __esri.Graphic,
  sceneView: __esri.SceneView | null,
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
    return areaSI;
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
    return geometryEngine.planarArea(projectedGeometry, 109454);
  }
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
 * Calculates details of plan for provided layers.
 *
 * @param layers Layers to calculate plan details on
 * @param sceneViewForArea SceneView for performing area calculations on
 * @param calculateSettings Calculate settings parameters
 * @returns status of calculations and calculation results
 */
export async function calculatePlan(
  layers: __esri.GraphicsLayer[],
  sceneViewForArea: __esri.SceneView,
  calculateSettings: CalculateSettingsBaseType,
): Promise<CalculateResultsTotsBaseType> {
  const { calcGraphics, totals, totalArea } = await calculatePlanGeospatial(
    layers,
    sceneViewForArea,
  );

  if (calcGraphics.length === 0 || totalArea === 0) {
    return { status: 'none', data: null };
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
  } = calculateSettings;

  // calculate spatial items
  let userSpecifiedAOI = null;
  let percentAreaSampled = null;
  if (surfaceArea > 0) {
    userSpecifiedAOI = surfaceArea;
    percentAreaSampled = (totalArea / surfaceArea) * 100;
  }

  // calculate the sampling items
  const samplingTimeHours = totals.ttpk + totals.ttc;
  const samplingHours = numSamplingTeams * numSamplingHours * numSamplingShifts;
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
  let limitingFactor: CalculateResultsTotsDataType['Limiting Time Factor'] = '';
  if (timeCompleteSampling > labThroughput) {
    limitingFactor = 'Sampling';
  } else {
    limitingFactor = 'Analysis';
  }

  const resultObject: CalculateResultsTotsDataType = {
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

  return {
    status: 'success',
    data: resultObject,
  };
}

/**
 * Performs geospatial calculations for provided layers.
 *
 * @param layers Layers to calculate plan details on
 * @param sceneViewForArea SceneView for performing area calculations on
 * @returns graphics used in calculations, totals and total area
 */
async function calculatePlanGeospatial(
  layers: __esri.GraphicsLayer[],
  sceneViewForArea: __esri.SceneView,
) {
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
    for (const graphic of layer.graphics.toArray()) {
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

  const totals = {
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
  };
  const totalArea = totalAreaSquereFeet;

  return {
    calcGraphics,
    totals,
    totalArea,
  };
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
  edits,
  scenario,
  layer,
  type,
  changes,
  hasContaminationRan = false,
}: {
  edits: EditsType;
  scenario?: ScenarioEditsType | null;
  layer: LayerType;
  type: EditType;
  changes?: __esri.Collection<__esri.Graphic>;
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
      editsScenario.visible = layer.visible;
      // editsScenario.listMode = layer.listMode;
      if (editsScenario.status === 'published') editsScenario.status = 'edited';
    }

    editsLayer.visible = layer.visible;
    editsLayer.listMode = layer.listMode;
    editsLayer.name = layer.name;
    editsLayer.label = layer.name;

    // if the status is published, set the status to edited to allow re-publishing
    if (layer.status === 'published') layer.status = 'edited';
    if (editsLayer.status === 'published') editsLayer.status = 'edited';
  }

  editsLayer.editType = type;

  // set the hasContaminationRan value (default is false)
  if (editsScenario) editsScenario.hasContaminationRan = hasContaminationRan;
  editsLayer.hasContaminationRan = hasContaminationRan;

  if (changes) {
    // Add new graphics
    if (type === 'add') {
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
 * Generates a unique identifier (uuid) in uppercase.
 *
 * @returns string - A unique identifier (uuid).
 */
export function generateUUID() {
  return '{' + uuidv4().toUpperCase() + '}';
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
 * Builds the default sample layer.
 *
 * @param name The name of the new layer
 * @param parentLayer (optional) The parent layer of the new layer
 * @returns LayerType The default sample layer
 */
export function createSampleLayer(
  name: string = 'Area of Interest',
  parentLayer: __esri.GroupLayer | null = null,
) {
  const layerUuid = generateUUID();
  const graphicsLayer = new GraphicsLayer({
    id: layerUuid,
    title: 'AOI Layer',
    visible: true,
    listMode: 'show',
  });
  const pointsLayer = new GraphicsLayer({
    id: layerUuid + '-points',
    title: name,
    visible: false,
    listMode: 'hide',
  });
  const hybridLayer = new GraphicsLayer({
    id: layerUuid + '-hybrid',
    title: name,
    visible: false,
    listMode: 'hide',
  });

  return {
    id: -1,
    pointsId: -1,
    uuid: layerUuid,
    layerId: graphicsLayer.id,
    portalId: '',
    value: graphicsLayer.id,
    name,
    label: name,
    layerType: 'Samples',
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
 * Builds the default sampling mask layer.
 *
 * @returns LayerType The default sampling mask layer
 */
export function getDefaultSamplingMaskLayer() {
  const layerUuid = generateUUID();
  const graphicsLayer = new GraphicsLayer({
    id: layerUuid,
    title: 'Sketched Decon Mask',
    listMode: 'show',
  });

  return {
    id: -1,
    pointsId: -1,
    uuid: layerUuid,
    layerId: layerUuid,
    portalId: '',
    value: 'sketchAoi',
    name: 'Sketched Decon Mask',
    label: 'Sketched Decon Mask',
    layerType: 'Sampling Mask',
    scenarioName: '',
    scenarioDescription: '',
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
    parentLayer: null,
  } as LayerType;
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
 * Gets an array of layers, included in the provided edits parameter,
 * that can be used with the sketch widget. The search will look in
 * child layers of scenarios as well.
 *
 * @param layers - The layers to search in.
 * @param edits - The edits to search in.
 */
export function getSketchableLayers(
  layers: LayerType[],
  edits: (ScenarioEditsType | LayerEditsType)[],
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
 *
 * @param edits Edits to search through for scenarios.
 * @param layers Layers to search through if there are no scenarios.
 * @param selectedScenario
 * @param sketchLayer
 */
export function getNextScenarioLayer(
  edits: EditsType,
  layers: LayerType[],
  selectedScenario: ScenarioEditsType | null,
  sketchLayer: LayerType | null,
) {
  let nextScenario: ScenarioEditsType | null = null;
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
    (layer) => layer.name === 'Area of Interest',
  );

  return {
    nextScenario,
    nextLayer,
    defaultLayerIndex,
  };
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
      Header: 'Building ID',
      accessor: 'bid',
      width: 0,
      show: false,
    },
    {
      Header: 'ID',
      accessor: 'fd_id',
      width: 0,
      show: false,
    },
    {
      Header: 'Layer',
      accessor: 'layerName',
      width: baseColumnWidth,
    },
    {
      Header: 'Building Type',
      accessor: 'bldgtype',
      width: baseColumnWidth,
    },
    {
      Header: 'Census Block FIPS',
      accessor: 'cbfips',
      width: mediumColumnWidth,
    },
    {
      Header: 'Flood Zone (2021)',
      accessor: 'firmzone',
      width: baseColumnWidth,
    },
    {
      Header: 'Foundation Height (feet)',
      accessor: 'found_ht',
      width: baseColumnWidth,
    },
    {
      Header: 'Foundation Type',
      accessor: 'found_type',
      width: baseColumnWidth,
    },
    {
      Header: 'Footprint ID',
      accessor: 'ftprntid',
      width: baseColumnWidth,
    },
    {
      Header: 'Footprint Source',
      accessor: 'ftprntsrc',
      width: baseColumnWidth,
    },
    {
      Header: 'Ground Elevation (feet)',
      accessor: 'ground_elv',
      width: baseColumnWidth,
    },
    {
      Header: 'Ground Elevation (meters)',
      accessor: 'ground_elv_m',
      width: baseColumnWidth,
    },
    {
      Header: 'Median Year Built',
      accessor: 'med_yr_blt',
      width: baseColumnWidth,
    },
    {
      Header: 'Number of Stories',
      accessor: 'num_story',
      width: baseColumnWidth,
    },
    {
      Header: 'Percent Over 65 Disabled',
      accessor: 'o65disable',
      width: baseColumnWidth,
    },
    {
      Header: 'Occupancy Type',
      accessor: 'occtype',
      width: baseColumnWidth,
    },
    {
      Header: 'Population Night Over 65',
      accessor: 'pop2amo65',
      width: baseColumnWidth,
    },
    {
      Header: 'Population Night Under 65',
      accessor: 'pop2amu65',
      width: baseColumnWidth,
    },
    {
      Header: 'Population Day Over 65',
      accessor: 'pop2pmo65',
      width: baseColumnWidth,
    },
    {
      Header: 'Population Day Under 65',
      accessor: 'pop2pmu65',
      width: baseColumnWidth,
    },
    {
      Header: 'Source',
      accessor: 'source',
      width: baseColumnWidth,
    },
    // {
    //   Header: 'Square Feet',
    //   accessor: 'sqft',
    //   width: baseColumnWidth,
    // },
    {
      Header: 'Structure Damage Category',
      accessor: 'st_damcat',
      width: baseColumnWidth,
    },
    {
      Header: 'Students',
      accessor: 'students',
      width: baseColumnWidth,
    },
    {
      Header: 'Percent Under 65 Disabled',
      accessor: 'u65disable',
      width: baseColumnWidth,
    },
    {
      Header: 'Value of Contents',
      accessor: 'val_cont',
      width: baseColumnWidth,
    },
    {
      Header: 'Value of Structure',
      accessor: 'val_struct',
      width: baseColumnWidth,
    },
    {
      Header: 'Value of Vehicles',
      accessor: 'vale_vehic',
      width: baseColumnWidth,
    },
    {
      Header: 'X',
      accessor: 'x',
      width: baseColumnWidth,
    },
    {
      Header: 'Y',
      accessor: 'y',
      width: baseColumnWidth,
    },
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
  if (polygon.symbol.type.includes('-3d')) {
    point = getPointSymbol3d(polygon, symbolColor);
  } else {
    point = getPointSymbol2d(polygon, symbolColor);
  }

  return point;
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
    geometry: (polygon.geometry as any)?.centroid,
    popupTemplate: polygon.popupTemplate,
    symbol,
  });
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
  const sketchLayer = new GraphicsLayer({
    title: editsLayer.label,
    id: editsLayer.uuid,
    visible: editsLayer.visible,
    listMode: editsLayer.listMode,
  });
  // const pointsLayer = new GraphicsLayer({
  //   title: editsLayer.label,
  //   id: editsLayer.uuid + '-points',
  //   visible: false,
  //   listMode: 'hide',
  // });
  // const hybridLayer = new GraphicsLayer({
  //   title: editsLayer.label,
  //   id: editsLayer.uuid + '-hybrid',
  //   visible: false,
  //   listMode: 'hide',
  // });

  const popupTemplate = getPopupTemplate(
    editsLayer.layerType,
    editsLayer.hasContaminationRan,
  );
  const polyFeatures: __esri.Graphic[] = [];
  // const pointFeatures: __esri.Graphic[] = [];
  // const hybridFeatures: __esri.Graphic[] = [];
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
    if (layerType === 'Samples') layerType = 'Area of Interest';
    if (layerType === 'Sampling Mask') layerType = 'Area of Interest';

    // set the symbol styles based on sample/layer type
    let symbol = defaultSymbols.symbols[layerType] as any;
    // if (defaultSymbols.symbols.hasOwnProperty(graphic.attributes.TYPEUUID)) {
    //   symbol = defaultSymbols.symbols[graphic.attributes.TYPEUUID];
    // }

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
    // if (layerType === 'Samples') {
    //   pointFeatures.push(convertToPoint(poly));
    //   hybridFeatures.push(
    //     poly.attributes.ShapeType === 'point'
    //       ? convertToPoint(poly)
    //       : poly.clone(),
    //   );
    // }
  });
  sketchLayer.addMany(polyFeatures);
  // if (editsLayer.layerType === 'Samples' || editsLayer.layerType === 'VSP') {
  //   pointsLayer.addMany(pointFeatures);
  //   hybridLayer.addMany(hybridFeatures);
  // }

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
    pointsLayer: null,
    hybridLayer: null,
    parentLayer,
  });

  return [sketchLayer]; //, pointsLayer, hybridLayer];
}

/**
 * Gets the elevation layer from the map. This can be
 * used for querying the elevation of points on the map.
 *
 * @param map The map object
 * @returns Elevation layer
 */
export function getElevationLayer(map: __esri.Map) {
  return map.ground.layers.find((l) => l.id === 'worldElevation');
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
        edits: editsCopy,
        layer: newLayer,
        type: 'add',
        changes,
      });

      // remove the graphics from the old layer
      editsCopy = updateLayerEdits({
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
