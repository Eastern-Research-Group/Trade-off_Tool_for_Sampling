/** @jsxImportSource @emotion/react */

import {
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from 'react';
import CSVLayer from '@arcgis/core/layers/CSVLayer';
import Extent from '@arcgis/core/geometry/Extent';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Field from '@arcgis/core/layers/support/Field';
import * as geometryJsonUtils from '@arcgis/core/geometry/support/jsonUtils';
import GeoRSSLayer from '@arcgis/core/layers/GeoRSSLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import KMLLayer from '@arcgis/core/layers/KMLLayer';
import Layer from '@arcgis/core/layers/Layer';
import PortalItem from '@arcgis/core/portal/PortalItem';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import * as rendererJsonUtils from '@arcgis/core/renderers/support/jsonUtils';
import Viewpoint from '@arcgis/core/Viewpoint';
import WMSLayer from '@arcgis/core/layers/WMSLayer';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { DialogContext, AlertDialogOptions } from 'contexts/Dialog';
import { LookupFilesContext } from 'contexts/LookupFiles';
import { NavigationContext } from 'contexts/Navigation';
import { PublishContext } from 'contexts/Publish';
import { SketchContext } from 'contexts/Sketch';
// types
import { EditsType, ScenarioEditsType, ServiceMetaDataType } from 'types/Edits';
import { LayerType, PortalLayerType, UrlLayerType } from 'types/Layer';
import { AppType, GoToOptions } from 'types/Navigation';
import { SampleTypeOptions } from 'types/Publish';
// config
import { PanelValueType } from 'config/navigation';
import {
  SampleSelectType,
  UserDefinedAttributes,
} from 'config/sampleAttributes';
// utils
import { useDynamicPopup } from 'utils/hooks';
import { createLayer } from 'utils/sketchUtils';

let appKey = 'tots';

function getFullKey(key: string) {
  return `${appKey}_${key}`;
}

// Saves data to session storage
export async function writeToStorage(
  key: string,
  data: string | boolean | object,
  setOptions: Dispatch<SetStateAction<AlertDialogOptions | null>>,
) {
  const fullKey = getFullKey(key);
  const itemSize = Math.round(JSON.stringify(data).length / 1024);

  try {
    if (typeof data === 'string') sessionStorage.setItem(fullKey, data);
    else sessionStorage.setItem(fullKey, JSON.stringify(data));
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

    window.logErrorToGa(`${fullKey}:${message}`);
  }
}

// Reads data from session storage
export function readFromStorage(key: string) {
  const fullKey = getFullKey(key);
  return sessionStorage.getItem(fullKey);
}

// Finds the layer by the layer id
function getLayerById(layers: LayerType[], id: string) {
  const index = layers.findIndex((layer) => layer.layerId === id);
  return layers[index];
}

// Saves/Retrieves data to browser storage
export function useSessionStorage(appType: AppType) {
  appKey = appType === 'decon' ? 'tods' : 'tots';

  // remove stuff for other app if necessary
  const removalKey = appType === 'decon' ? 'tots' : 'tods';
  Object.keys(sessionStorage)
    .filter((key) => key.includes(`${removalKey}_`))
    .forEach((key) => delete sessionStorage[key]);

  const useAppSpecific =
    appType === 'decon' ? useSessionStorageDecon : useSessionStorageSampling;

  useAppSpecific();
  useGraphicColor();
  useEditsLayerStorage(appType);
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
  useBasemapStorage2d();
  useBasemapStorage3d();
  useUserDefinedSampleOptionsStorage();
  useUserDefinedSampleAttributesStorage();
  useTablePanelStorage();
  usePublishStorage();
  useDisplayModeStorage();
  useGsgFileStorage();
}

function useSessionStorageDecon() {
  usePlanSettingsStorage();
}

function useSessionStorageSampling() {
  useTrainingModeStorage();
}

// Uses browser storage for holding graphics color.
function useGraphicColor() {
  const key = 'polygon_symbol';

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

// Uses browser storage for holding the training mode selection.
function useTrainingModeStorage() {
  const key = 'training_mode';

  const { setOptions } = useContext(DialogContext);
  const { trainingMode, setTrainingMode } = useContext(NavigationContext);

  // Retreives training mode data from browser storage when the app loads
  const [localTrainingModeInitialized, setLocalTrainingModeInitialized] =
    useState(false);
  useEffect(() => {
    if (localTrainingModeInitialized) return;

    setLocalTrainingModeInitialized(true);

    const trainingModeStr = readFromStorage(key);
    if (!trainingModeStr) return;

    const trainingMode = JSON.parse(trainingModeStr);
    setTrainingMode(trainingMode);
  }, [localTrainingModeInitialized, setTrainingMode]);

  useEffect(() => {
    if (!localTrainingModeInitialized) return;

    writeToStorage(key, trainingMode, setOptions);
  }, [trainingMode, localTrainingModeInitialized, setOptions]);
}

// Uses browser storage for holding any editable layers.
function useEditsLayerStorage(appType: AppType) {
  const key = 'edits';
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
  const getPopupTemplate = useDynamicPopup(appType);

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
  const key = 'reference_layers';
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
  const key = 'url_layers';
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
  const key = 'portal_layers';
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
  const key2d = 'map_2d_extent';
  const key3d = 'map_3d_extent';

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
  const key = 'map_scene_position';

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
  const key2d = 'home_2d_viewpoint';
  const key3d = 'home_3d_viewpoint';

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
  const key = 'selected_sample_layer';
  const key2 = 'selected_scenario';

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
  const key = 'selected_contamination_layer';
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
  const key = 'generate_random_mask_layer';
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
  const key = 'calculate_settings';
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
  const key = 'current_tab';

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
function useBasemapStorage2d() {
  const key = 'selected_basemap_layer_2d';

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
    const newWatchHandle = basemapWidget['2d'].watch(
      'source.basemaps.length',
      (newValue) => {
        // wait for the basemaps to be populated
        if (newValue === 0) return;

        setLocalBasemapInitialized(true);

        // Search for the basemap with the matching portal id
        let selectedBasemap: __esri.Basemap | null = null;
        basemapWidget['2d'].source.basemaps.forEach((basemap) => {
          if (basemap.portalItem.id === portalId) selectedBasemap = basemap;
        });

        // Set the activeBasemap to the basemap that was found
        if (selectedBasemap)
          basemapWidget['2d'].activeBasemap = selectedBasemap;
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

    basemapWidget['2d'].watch('activeBasemap.portalItem.id', (newValue) => {
      if (!newValue) return;
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

// Uses browser storage for holding the currently selected basemap.
function useBasemapStorage3d() {
  const key = 'selected_basemap_layer_3d';

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
    const newWatchHandle = basemapWidget['3d'].watch(
      'source.basemaps.length',
      (newValue) => {
        // wait for the basemaps to be populated
        if (newValue === 0) return;

        setLocalBasemapInitialized(true);

        // Search for the basemap with the matching portal id
        let selectedBasemap: __esri.Basemap | null = null;
        basemapWidget['3d'].source.basemaps.forEach((basemap) => {
          if (basemap.portalItem.id === portalId) selectedBasemap = basemap;
        });

        // Set the activeBasemap to the basemap that was found
        if (selectedBasemap)
          basemapWidget['3d'].activeBasemap = selectedBasemap;
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

    basemapWidget['3d'].watch('activeBasemap.portalItem.id', (newValue) => {
      if (!newValue) return;
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
  const key = 'user_defined_sample_options';
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
  const key = 'user_defined_sample_attributes';
  const { setOptions } = useContext(DialogContext);
  const { sampleTypes } = useContext(LookupFilesContext);
  const {
    setSampleAttributes,
    setSampleAttributesDecon,
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
    sampleTypes,
    setSampleAttributes,
    setSampleAttributesDecon,
  ]);

  // add the user defined attributes to the global attributes
  useEffect(() => {
    let newSampleAttributes: any = {};

    if (sampleTypes) newSampleAttributes = { ...sampleTypes.sampleAttributes };

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
    sampleTypes,
    setSampleAttributes,
  ]);

  // add the user defined attributes to the global attributes
  useEffect(() => {
    let newDeconAttributes: any = {};

    if (sampleTypes) newDeconAttributes = { ...sampleTypes.deconAttributes };

    Object.keys(userDefinedAttributes.sampleTypes).forEach((key) => {
      newDeconAttributes[key] =
        userDefinedAttributes.sampleTypes[key].attributes;
    });

    // Update totsDeconAttributes variable on the window object. This is a workaround
    // to an issue where the deconAttributes state variable is not available within esri
    // event handlers.
    (window as any).totsDeconAttributes = newDeconAttributes;

    setSampleAttributesDecon(newDeconAttributes);
  }, [
    localUserDefinedSamplesInitialized,
    userDefinedAttributes,
    sampleTypes,
    setSampleAttributesDecon,
  ]);

  // Saves the url layers to browser storage everytime they change
  useEffect(() => {
    if (!localUserDefinedSamplesInitialized) return;
    writeToStorage(key, userDefinedAttributes, setOptions);
  }, [userDefinedAttributes, localUserDefinedSamplesInitialized, setOptions]);
}

// Uses browser storage for holding the size and expand status of the bottom table.
function useTablePanelStorage() {
  const key = 'table_panel';

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
  const key = 'sample_type_selections';
  const key2 = 'sample_table_metadata';
  const key3 = 'publish_samples_mode';
  const key4 = 'output_settings';

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
  const key = 'display_mode';

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

// Uses browser storage for holding the training mode selection.
function usePlanSettingsStorage() {
  const key = 'plan_settings';

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

// Uses browser storage for holding the gsg files.
function useGsgFileStorage() {
  const key = 'gsg_files';

  const { setOptions } = useContext(DialogContext);
  const { gsgFiles, setGsgFiles } = useContext(SketchContext);

  // Retreives training mode data from browser storage when the app loads
  const [localInitialized, setLocalInitialized] = useState(false);
  useEffect(() => {
    if (localInitialized) return;

    setLocalInitialized(true);

    const gsgFilesStr = readFromStorage(key);
    if (!gsgFilesStr) return;

    const gsgFiles = JSON.parse(gsgFilesStr);
    setGsgFiles(gsgFiles);
  }, [localInitialized, setGsgFiles]);

  useEffect(() => {
    if (!localInitialized) return;
    writeToStorage(key, gsgFiles, setOptions);
  }, [gsgFiles, localInitialized, setOptions]);
}
