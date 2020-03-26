/** @jsx jsx */

import React from 'react';
// contexts
import { useEsriModulesContext } from 'contexts/EsriModules';
import { CalculateContext } from 'contexts/Calculate';
import { SketchContext } from 'contexts/Sketch';
// types
import {
  CalculateResultsType,
  CalculateResultsDataType,
} from 'types/CalculateResults';
import { EditsType } from 'types/Edits';
import { LayerType, UrlLayerType } from 'types/Layer';
// config
import { polygonSymbol } from 'config/symbols';
// utils
import { getPopupTemplate } from 'utils/sketchUtils';

// Saves data to session storage
export function writeToStorage(key: string, data: string | object) {
  const itemSize = Math.round(JSON.stringify(data).length / 1024);

  try {
    if (typeof data === 'string') sessionStorage.setItem(key, data);
    else sessionStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    const storageSize = Math.round(
      JSON.stringify(sessionStorage).length / 1024,
    );
    const message = `LIMIT REACHED: New storage size would be ${itemSize}K up from ${storageSize}K already in storage`;
    alert(message);
    console.log(message);
    console.error(e);
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

// Uses browser storage for holding any editable layers.
function useEditsLayerStorage() {
  const key = 'tots_edits';
  const { Graphic, GraphicsLayer, Polygon } = useEsriModulesContext();
  const { edits, setEdits, layers, setLayers, map } = React.useContext(
    SketchContext,
  );

  // Retreives edit data from session storage when the app loads
  const [localStorageInitialized, setLocalStorageInitialized] = React.useState(
    false,
  );
  React.useEffect(() => {
    if (!map || !setEdits || !setLayers || localStorageInitialized) return;

    setLocalStorageInitialized(true);
    const editsStr = readFromStorage(key);
    if (!editsStr) return;

    const edits: EditsType = JSON.parse(editsStr);
    setEdits(edits);

    const newLayers: LayerType[] = [];
    const graphicsLayers: __esri.GraphicsLayer[] = [];
    edits.edits.forEach((editsLayer) => {
      const sketchLayer = new GraphicsLayer({
        title: editsLayer.name,
        id: editsLayer.layerId,
      });

      const features: __esri.Graphic[] = [];
      const displayedFeatures = [...editsLayer.adds, ...editsLayer.updates];
      // add graphics to the map
      displayedFeatures.forEach((graphic) => {
        features.push(
          new Graphic({
            attributes: graphic.attributes,
            symbol: polygonSymbol,
            geometry: new Polygon({
              spatialReference: {
                wkid: 3857,
              },
              rings: graphic.geometry.rings,
            }),
            popupTemplate: getPopupTemplate(editsLayer.layerType),
          }),
        );
      });
      sketchLayer.addMany(features);
      graphicsLayers.push(sketchLayer);

      newLayers.push({
        id: editsLayer.id,
        layerId: editsLayer.layerId,
        value: `${editsLayer.id} - ${editsLayer.name} - from session`,
        name: editsLayer.name,
        label: editsLayer.name,
        layerType: editsLayer.layerType,
        scenarioName: editsLayer.scenarioName,
        scenarioDescription: editsLayer.scenarioDescription,
        addedFrom: editsLayer.addedFrom,
        defaultVisibility: true,
        geometryType: 'esriGeometryPolygon',
        sketchLayer,
      });
    });

    if (newLayers.length > 0) {
      setLayers([...layers, ...newLayers]);
      map.addMany(graphicsLayers);
    }
  }, [
    Graphic,
    GraphicsLayer,
    Polygon,
    setEdits,
    setLayers,
    layers,
    localStorageInitialized,
    map,
  ]);

  // Saves the edits to session storage everytime they change
  React.useEffect(() => {
    if (!localStorageInitialized) return;
    writeToStorage(key, edits);
  }, [edits, localStorageInitialized]);
}

// Uses browser storage for holding the reference layers that have been added.
function useReferenceLayerStorage() {
  const key = 'tots_reference_layers';
  const {
    FeatureLayer,
    Field,
    geometryJsonUtils,
    rendererJsonUtils,
  } = useEsriModulesContext();
  const { map, referenceLayers, setReferenceLayers } = React.useContext(
    SketchContext,
  );

  // Retreives reference layers from session storage when the app loads
  const [
    localReferenceLayerInitialized,
    setLocalReferenceLayerInitialized,
  ] = React.useState(false);
  React.useEffect(() => {
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
  }, [
    FeatureLayer,
    Field,
    geometryJsonUtils,
    localReferenceLayerInitialized,
    map,
    rendererJsonUtils,
    setReferenceLayers,
  ]);

  // Saves the reference layers to session storage everytime they change
  React.useEffect(() => {
    if (!localReferenceLayerInitialized) return;
    writeToStorage(key, referenceLayers);
  }, [referenceLayers, localReferenceLayerInitialized]);
}

// Uses browser storage for holding the url layers that have been added.
function useUrlLayerStorage() {
  const key = 'tots_url_layers';
  const {
    CSVLayer,
    GeoRSSLayer,
    KMLLayer,
    Layer,
    WMSLayer,
  } = useEsriModulesContext();
  const { map, urlLayers, setUrlLayers } = React.useContext(SketchContext);

  // Retreives url layers from session storage when the app loads
  const [
    localUrlLayerInitialized,
    setLocalUrlLayerInitialized,
  ] = React.useState(false);
  React.useEffect(() => {
    if (!map || !setUrlLayers || localUrlLayerInitialized) return;

    setLocalUrlLayerInitialized(true);
    const urlLayersStr = readFromStorage(key);
    if (!urlLayersStr) return;

    const urlLayers: UrlLayerType[] = JSON.parse(urlLayersStr);

    // add the portal layers to the map
    urlLayers.forEach((urlLayer) => {
      const type = urlLayer.type;
      const url = urlLayer.url;

      let layer;
      if (type === 'ArcGIS') {
        layer = Layer.fromArcGISServerUrl({ url });
      }
      if (type === 'WMS') {
        layer = new WMSLayer({ url });
      }
      /* // not supported in 4.x js api
      if(type === 'WFS') {
        layer = new WFSLayer({ url });
      } */
      if (type === 'KML') {
        layer = new KMLLayer({ url });
      }
      if (type === 'GeoRSS') {
        layer = new GeoRSSLayer({ url });
      }
      if (type === 'CSV') {
        layer = new CSVLayer({ url });
      }

      // add the layer if isn't null
      if (layer) {
        map.add(layer);

        const urlLayer = { url, type };
        setUrlLayers([...urlLayers, urlLayer]);
      }
    });

    setUrlLayers(urlLayers);
  }, [
    // Esri Modules
    CSVLayer,
    GeoRSSLayer,
    KMLLayer,
    Layer,
    WMSLayer,

    localUrlLayerInitialized,
    map,
    setUrlLayers,
  ]);

  // Saves the url layers to session storage everytime they change
  React.useEffect(() => {
    if (!localUrlLayerInitialized) return;
    writeToStorage(key, urlLayers);
  }, [urlLayers, localUrlLayerInitialized]);
}

// Uses browser storage for holding the portal layers that have been added.
function usePortalLayerStorage() {
  const key = 'tots_portal_layers';
  const { Layer, PortalItem } = useEsriModulesContext();
  const { map, portalLayers, setPortalLayers } = React.useContext(
    SketchContext,
  );

  // Retreives portal layers from session storage when the app loads
  const [
    localPortalLayerInitialized,
    setLocalPortalLayerInitialized,
  ] = React.useState(false);
  React.useEffect(() => {
    if (!map || !setPortalLayers || localPortalLayerInitialized) return;

    setLocalPortalLayerInitialized(true);
    const portalLayersStr = readFromStorage(key);
    if (!portalLayersStr) return;

    const portalLayers = JSON.parse(portalLayersStr);

    // add the portal layers to the map
    portalLayers.forEach((layerId: string) => {
      const layer = Layer.fromPortalItem({
        portalItem: new PortalItem({
          id: layerId,
        }),
      });
      map.add(layer);
    });

    setPortalLayers(portalLayers);
  }, [
    Layer,
    PortalItem,
    localPortalLayerInitialized,
    map,
    portalLayers,
    setPortalLayers,
  ]);

  // Saves the portal layers to session storage everytime they change
  React.useEffect(() => {
    if (!localPortalLayerInitialized) return;
    writeToStorage(key, portalLayers);
  }, [portalLayers, localPortalLayerInitialized]);
}

// Uses browser storage for holding the map's view port extent.
function useMapPositionStorage() {
  const key = 'tots_map_extent';

  const { Extent, watchUtils } = useEsriModulesContext();
  const { mapView } = React.useContext(SketchContext);

  // Retreives the map position and zoom level from session storage when the app loads
  const [
    localMapPositionInitialized,
    setLocalMapPositionInitialized,
  ] = React.useState(false);
  React.useEffect(() => {
    if (!mapView || localMapPositionInitialized) return;

    setLocalMapPositionInitialized(true);

    const positionStr = readFromStorage(key);
    if (!positionStr) return;

    const extent = JSON.parse(positionStr) as any;
    mapView.extent = Extent.fromJSON(extent);

    setLocalMapPositionInitialized(true);
  }, [Extent, mapView, localMapPositionInitialized]);

  // Saves the home widget's viewpoint to session storage whenever it changes
  const [
    watchExtentInitialized,
    setWatchExtentInitialized, //
  ] = React.useState(false);
  React.useEffect(() => {
    if (!mapView || watchExtentInitialized) return;

    watchUtils.watch(mapView, 'extent', (newVal, oldVal, propName, target) => {
      writeToStorage(key, newVal.toJSON());
    });

    setWatchExtentInitialized(true);
  }, [
    watchUtils,
    mapView,
    watchExtentInitialized,
    localMapPositionInitialized,
  ]);
}

// Uses browser storage for holding the home widget's viewpoint.
function useHomeWidgetStorage() {
  const key = 'tots_home_viewpoint';

  const { Viewpoint, watchUtils } = useEsriModulesContext();
  const { homeWidget } = React.useContext(SketchContext);

  // Retreives the home widget viewpoint from session storage when the app loads
  const [
    localHomeWidgetInitialized,
    setLocalHomeWidgetInitialized,
  ] = React.useState(false);
  React.useEffect(() => {
    if (!homeWidget || localHomeWidgetInitialized) return;

    setLocalHomeWidgetInitialized(true);

    const viewpointStr = readFromStorage(key);

    if (viewpointStr) {
      const viewpoint = JSON.parse(viewpointStr) as any;
      homeWidget.viewpoint = Viewpoint.fromJSON(viewpoint);
    }
  }, [Viewpoint, homeWidget, localHomeWidgetInitialized]);

  // Saves the extent to session storage whenever it changes
  const [
    watchHomeWidgetInitialized,
    setWatchHomeWidgetInitialized, //
  ] = React.useState(false);
  React.useEffect(() => {
    if (!homeWidget || watchHomeWidgetInitialized) return;

    watchUtils.watch(
      homeWidget,
      'viewpoint',
      (newVal, oldVal, propName, target) => {
        writeToStorage(key, homeWidget.viewpoint.toJSON());
      },
    );

    setWatchHomeWidgetInitialized(true);
  }, [watchUtils, homeWidget, watchHomeWidgetInitialized]);
}

// Uses browser storage for holding the currently selected sample layer.
function useSamplesLayerStorage() {
  const key = 'tots_selected_sample_layer';

  const { layers, sketchLayer, setSketchLayer } = React.useContext(
    SketchContext,
  );

  // Retreives the selected sample layer (sketchLayer) from session storage
  // when the app loads
  const [
    localSampleLayerInitialized,
    setLocalSampleLayerInitialized,
  ] = React.useState(false);
  React.useEffect(() => {
    if (layers.length === 0 || localSampleLayerInitialized) return;

    setLocalSampleLayerInitialized(true);

    const layerId = readFromStorage(key);
    if (!layerId) return;

    setSketchLayer(getLayerById(layers, layerId));
  }, [layers, setSketchLayer, localSampleLayerInitialized]);

  // Saves the selected sample layer (sketchLayer) to session storage whenever it changes
  React.useEffect(() => {
    if (!localSampleLayerInitialized) return;

    const data = sketchLayer?.layerId ? sketchLayer.layerId : '';
    writeToStorage(key, data);
  }, [sketchLayer, localSampleLayerInitialized]);
}

// Uses browser storage for holding the currently selected contamination map layer.
function useContaminationMapStorage() {
  const key = 'tots_selected_contamination_layer';
  const { layers } = React.useContext(SketchContext);
  const {
    contaminationMap,
    setContaminationMap, //
  } = React.useContext(CalculateContext);

  // Retreives the selected contamination map from session storage
  // when the app loads
  const [
    localContaminationLayerInitialized,
    setLocalContaminationLayerInitialized,
  ] = React.useState(false);
  React.useEffect(() => {
    if (layers.length === 0 || localContaminationLayerInitialized) return;

    setLocalContaminationLayerInitialized(true);

    const layerId = readFromStorage(key);
    if (!layerId) return;

    setContaminationMap(getLayerById(layers, layerId));
  }, [layers, setContaminationMap, localContaminationLayerInitialized]);

  // Saves the selected contamination map to session storage whenever it changes
  React.useEffect(() => {
    if (!localContaminationLayerInitialized) return;

    const data = contaminationMap?.layerId ? contaminationMap.layerId : '';
    writeToStorage(key, data);
  }, [contaminationMap, localContaminationLayerInitialized]);
}

function useCalculateSettingsStorage() {
  const key = 'tots_calculate_settings';
  const {
    numLabs,
    setNumLabs,
    numLabHours,
    setNumLabHours,
    numSamplingHours,
    setNumSamplingHours,
    numSamplingPersonnel,
    setNumSamplingPersonnel,
    numSamplingShifts,
    setNumSamplingShifts,
    numSamplingTeams,
    setNumSamplingTeams,
    samplingLaborCost,
    setSamplingLaborCost,
    surfaceArea,
    setSurfaceArea,
  } = React.useContext(CalculateContext);

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

  // Reads the calculate settings from session storage.
  const [settingsInitialized, setSettingsInitialized] = React.useState(false);
  React.useEffect(() => {
    if (settingsInitialized) return;
    const settingsStr = readFromStorage(key);

    setSettingsInitialized(true);

    if (!settingsStr) return;
    const settings: CalculateSettingsType = JSON.parse(settingsStr);

    setNumLabs(settings.numLabs);
    setNumLabHours(settings.numLabHours);
    setNumSamplingHours(settings.numSamplingHours);
    setNumSamplingPersonnel(settings.numSamplingPersonnel);
    setNumSamplingShifts(settings.numSamplingShifts);
    setNumSamplingTeams(settings.numSamplingTeams);
    setSamplingLaborCost(settings.samplingLaborCost);
    setSurfaceArea(settings.surfaceArea);
  }, [
    setNumLabs,
    setNumLabHours,
    setNumSamplingHours,
    setNumSamplingPersonnel,
    setNumSamplingShifts,
    setNumSamplingTeams,
    setSamplingLaborCost,
    setSurfaceArea,
    settingsInitialized,
  ]);

  // Saves the calculate settings to session storage
  React.useEffect(() => {
    const settings: CalculateSettingsType = {
      numLabs,
      numLabHours,
      numSamplingHours,
      numSamplingPersonnel,
      numSamplingShifts,
      numSamplingTeams,
      samplingLaborCost,
      surfaceArea,
    };

    writeToStorage(key, settings);
  }, [
    numLabs,
    numLabHours,
    numSamplingHours,
    numSamplingPersonnel,
    numSamplingShifts,
    numSamplingTeams,
    samplingLaborCost,
    surfaceArea,
  ]);
}

// Saves/Retrieves data to session storage
export function useSessionStorage() {
  useEditsLayerStorage();
  useReferenceLayerStorage();
  useUrlLayerStorage();
  usePortalLayerStorage();
  useMapPositionStorage();
  useHomeWidgetStorage();
  useSamplesLayerStorage();
  useContaminationMapStorage();
  useCalculateSettingsStorage();
}

// Runs sampling plan calculations whenever the
// samples change or the variables on the calculate tab
// change.
export function useCalculatePlan() {
  const {
    geometryEngine,
    Polygon,
    projection,
    webMercatorUtils,
  } = useEsriModulesContext();
  const { edits, sketchLayer } = React.useContext(SketchContext);
  const {
    numLabs,
    numLabHours,
    numSamplingHours,
    numSamplingPersonnel,
    numSamplingShifts,
    numSamplingTeams,
    samplingLaborCost,
    surfaceArea,
    setCalculateResults,
  } = React.useContext(CalculateContext);

  // Load the esri projection module. This needs
  // to happen before the projection module will work.
  const [
    loadedProjection,
    setLoadedProjection, //
  ] = React.useState<__esri.projection | null>(null);
  React.useEffect(() => {
    projection.load().then(() => {
      setLoadedProjection(projection);
    });
  });

  // Reset the calculateResults context variable, whenever anything
  // changes that will cause a re-calculation.
  React.useEffect(() => {
    if (
      !sketchLayer?.sketchLayer ||
      sketchLayer.sketchLayer.type !== 'graphics' ||
      sketchLayer.sketchLayer.graphics.length === 0
    ) {
      setCalculateResults({ status: 'none', panelOpen: false, data: null });
      return;
    }

    setCalculateResults((calculateResults: CalculateResultsType) => {
      return {
        status: 'fetching',
        panelOpen: calculateResults.panelOpen,
        data: null,
      };
    });
  }, [
    edits,
    sketchLayer,
    numLabs,
    numLabHours,
    numSamplingHours,
    numSamplingPersonnel,
    numSamplingShifts,
    numSamplingTeams,
    samplingLaborCost,
    surfaceArea,
    setCalculateResults,
  ]);

  const [calcGraphics, setCalcGraphics] = React.useState<__esri.Graphic[]>([]);
  const [totals, setTotals] = React.useState({
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
  const [totalArea, setTotalArea] = React.useState(0);

  // perform geospatial calculatations
  React.useEffect(() => {
    // exit early checks
    if (!loadedProjection) return;
    if (!sketchLayer?.sketchLayer || edits.count === 0) return;
    if (sketchLayer.sketchLayer.type !== 'graphics') return;

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

    // caluclate the area for graphics
    let totalAreaSquereFeet = 0;
    const calcGraphics: __esri.Graphic[] = [];
    sketchLayer.sketchLayer.graphics.forEach((graphic) => {
      const calcGraphic = graphic.clone();

      // convert the geometry to WGS84 for geometryEngine
      const wgsGeometry = webMercatorUtils.webMercatorToGeographic(
        graphic.geometry,
      );

      // get the polygon object
      const geometry = geometryEngine.simplify(wgsGeometry) as __esri.Polygon;
      if (!geometry) return;

      const polygon = new Polygon({ rings: geometry.rings });

      // calulate the area
      const areaSI = geometryEngine.geodesicArea(polygon, 109454);
      calcGraphic.attributes.AA = areaSI;

      // convert area to square inches
      const areaSF = areaSI * 0.00694444;
      totalAreaSquereFeet = totalAreaSquereFeet + areaSF;

      // calculate AC
      const { SA, AA } = calcGraphic.attributes;
      if (AA < SA) {
        calcGraphic.attributes.AC = 1;
      } else {
        calcGraphic.attributes.AC = Math.round(AA / SA);
      }

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
        AC,
      } = calcGraphic.attributes;
      calcGraphic.attributes.TTPK = TTPK * AC;
      calcGraphic.attributes.TTC = TTC * AC;
      calcGraphic.attributes.TTA = TTA * AC;
      calcGraphic.attributes.TTPS = TTPS * AC;
      calcGraphic.attributes.MCPS = MCPS * AC;
      calcGraphic.attributes.TCPS = TCPS * AC;
      calcGraphic.attributes.WVPS = WVPS * AC;
      calcGraphic.attributes.WWPS = WWPS * AC;
      calcGraphic.attributes.ALC = ALC * AC;
      calcGraphic.attributes.AMC = AMC * AC;

      if (TTPK) {
        ttpk = ttpk + Number(TTPK * AC);
      }
      if (TTC) {
        ttc = ttc + Number(TTC * AC);
      }
      if (TTA) {
        tta = tta + Number(TTA * AC);
      }
      if (TTPS) {
        ttps = ttps + Number(TTPS * AC);
      }
      if (LOD_P) {
        lod_p = lod_p + Number(LOD_P);
      }
      if (LOD_NON) {
        lod_non = lod_non + Number(LOD_NON);
      }
      if (MCPS) {
        mcps = mcps + Number(MCPS * AC);
      }
      if (TCPS) {
        tcps = tcps + Number(TCPS * AC);
      }
      if (WVPS) {
        wvps = wvps + Number(WVPS * AC);
      }
      if (WWPS) {
        wwps = wwps + Number(WWPS * AC);
      }
      if (SA) {
        sa = sa + Number(SA);
      }
      if (ALC) {
        alc = alc + Number(ALC * AC);
      }
      if (AMC) {
        amc = amc + Number(AMC * AC);
      }
      if (AC) {
        ac = ac + Number(AC);
      }

      calcGraphics.push(calcGraphic);
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
    setTotalArea(totalAreaSquereFeet);
  }, [
    // esri modules
    geometryEngine,
    loadedProjection,
    Polygon,
    webMercatorUtils,

    // TOTS items
    edits,
    sketchLayer,
  ]);

  // perform non-geospatial calculations
  React.useEffect(() => {
    // exit early checks
    if (calcGraphics.length === 0 || totalArea === 0) return;

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
    const labThroughput = totals.tta / totalLabHours;

    // calculate total cost and time
    const totalCost =
      totalSamplingLaborCost + totals.mcps + totals.alc + totals.amc;

    // Calculate total time. Note: Total Time is the greater of sample collection time or Analysis Total Time.
    // If Analysis Time is equal to or greater than Sampling Total Time then the value reported is total Analysis Time Plus one day.
    // The one day accounts for the time samples get collected and shipped to the lab on day one of the sampling response.
    let totalTime = 0;
    if (labThroughput < timeCompleteSampling) {
      totalTime = timeCompleteSampling;
    } else {
      totalTime = labThroughput + 1;
    }

    // Get limiting time factor (will be undefined if they are equal)
    let limitingFactor: CalculateResultsDataType['Limiting Time Factor'] = '';
    if (timeCompleteSampling > labThroughput) {
      limitingFactor = 'Sampling';
    }
    if (timeCompleteSampling < labThroughput) {
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
      'Total Number of User-Defined Samples': calcGraphics.length,

      // assign counts
      'Total Number of Samples': totals.ac,
      'Total Sampled Area': totalArea,
      'Time to Prepare Kits': totals.ttpk,
      'Time to Collect': totals.ttc,
      'Material Cost': totals.mcps,
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

      // analysis
      'Time to Complete Analyses': labThroughput,

      //totals
      'Total Cost': totalCost,
      'Total Time': totalTime,
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
  }, [
    calcGraphics,
    totals,
    totalArea,
    numLabs,
    numLabHours,
    numSamplingHours,
    numSamplingPersonnel,
    numSamplingShifts,
    numSamplingTeams,
    samplingLaborCost,
    surfaceArea,
    setCalculateResults,
  ]);
}
