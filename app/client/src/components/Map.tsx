/** @jsxImportSource @emotion/react */

import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { css } from '@emotion/react';
import Basemap from '@arcgis/core/Basemap';
import EsriMap from '@arcgis/core/Map';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import PortalItem from '@arcgis/core/portal/PortalItem';
import SceneView from '@arcgis/core/views/SceneView';
import Viewpoint from '@arcgis/core/Viewpoint';
import '@arcgis/map-components/components/arcgis-compass';
import '@arcgis/map-components/components/arcgis-home';
import '@arcgis/map-components/components/arcgis-map';
import '@arcgis/map-components/components/arcgis-measurement';
import '@arcgis/map-components/components/arcgis-navigation-toggle';
import '@arcgis/map-components/components/arcgis-scale-bar';
import '@arcgis/map-components/components/arcgis-scene';
import '@arcgis/map-components/components/arcgis-search';
import '@arcgis/map-components/components/arcgis-zoom';
// components
import MapMouseEvents from 'components/MapMouseEvents';
import MapSketchWidgets from 'components/MapSketchWidgets';
import MapWidgets from 'components/MapWidgets';
import MeasurementButtons from 'components/MeasurementButtons';
// contexts
import { SketchContext } from 'contexts/Sketch';
// utils
import { adoptEsriStyles } from 'utils/shadowDom';
import { getGraphicsArray } from 'utils/sketchUtils';
// types
import { PortalLayerType } from 'types/Layer';
import { AppType } from 'types/Navigation';

// the layers are ordered as follows:
// graphicsLayers (top)
// featureLayers
// otherLayers
// imageryLayers (bottom)
const sortBy = [
  'other',
  'imagery',
  'map-image',
  'file',
  'feature',
  'contaminationMapUpdated',
  'deconResults',
  'sketchedMask',
  'layer-aoi-analysis',
  'scenario-decon',
  'scenario',
  'graphics',
];

// gets a layer type value used for sorting
function getLayerType(
  layer: __esri.Layer,
  edits: any,
  portalLayers: PortalLayerType[],
) {
  const imageryTypes = ['imagery', 'imagery-tile', 'tile', 'vector-tile'];
  let type = 'other';

  let groupType = '';
  if (layer.type === 'group') {
    const groupLayer = layer as __esri.GroupLayer;
    groupLayer.layers.forEach((layer, index) => {
      if (groupType === 'combo') return;

      if (index === 0) {
        groupType = layer.type;
        return;
      }

      if (groupType !== layer.type) {
        groupType = 'combo';
      }
    });
  }

  if (layer.id === 'contaminationMapUpdated') {
    type = 'contaminationMapUpdated';
  } else if (layer.id === 'deconResults') {
    type = 'deconResults';
  } else if (layer.title === 'Sketched Decon Mask') {
    type = 'sketchedMask';
  } else if (layer.type === 'graphics' || groupType === 'graphics') {
    type = 'graphics';

    const out = edits.find((e) => e.layerId === layer.id);
    if (
      out &&
      ['scenario', 'scenario-decon', 'layer-aoi-analysis'].includes(
        out?.type ?? '',
      )
    )
      type = out.type as string;
  } else if (layer.type === 'feature' || groupType === 'feature') {
    const portalLayer = portalLayers.find(
      (l) => l.id === (layer as any)?.portalItem?.id,
    );
    if (
      portalLayer &&
      portalLayer.type === 'tots' &&
      portalLayer.categories.includes('contains-epa-tots-sample-layer')
    )
      type = 'scenario';
    else type = 'feature';
  } else if (layer.type === 'map-image') {
    type = 'map-image';
  } else if (['csv', 'geo-rss', 'kml', 'wms'].includes(layer.type)) {
    type = 'file';
  } else if (imageryTypes.includes(type) || imageryTypes.includes(groupType)) {
    type = 'imagery';
  }

  return type;
}

function sortMapLayers(
  map: __esri.Map,
  editsLayers: any,
  portalLayers: PortalLayerType[],
) {
  map.layers.sort((a: __esri.Layer, b: __esri.Layer) => {
    return (
      sortBy.indexOf(getLayerType(a, editsLayers, portalLayers)) -
      sortBy.indexOf(getLayerType(b, editsLayers, portalLayers))
    );
  });
}

// --- styles (Map) ---
// Styles for esri's own markup live in utils/shadowDom.tsx, since the views
// render in a shadow root this doesn't reach.
const mapContainerStyles = (height: number) => {
  return css`
    position: relative;
    height: ${height}px;
    background-color: whitesmoke;
  `;
};

// A view whose container measures 0x0 never becomes ready, so the inactive view
// stays laid out until both are ready, then drops out of the render loop.
const viewStyles = (active: boolean, bothReady: boolean) => {
  const hidden = bothReady ? 'display: none;' : 'visibility: hidden;';
  return css`
    position: absolute;
    inset: 0;
    height: 100%;
    width: 100%;
    ${active ? '' : hidden}
  `;
};

// Slotted children each carry a bottom margin, which an empty container would still take up.
const sketchContainerStyles = css`
  display: contents;
`;

// Stable references so the map doesn't jump on every re-render.
const DEFAULT_CENTER = '-95, 37';
const DEFAULT_ZOOM = 3;
// The view autocasts this, filling in the remaining options.
const HIGHLIGHT_OPTIONS = {
  color: '#32C5FD',
  fillOpacity: 1,
} as __esri.HighlightOptionsProperties as __esri.HighlightOptions;

function configureViewPopup(view: __esri.MapView | __esri.SceneView) {
  if (view.popup) view.popup.defaultPopupTemplateEnabled = true;
}

// Builds the map shared by the 2d and 3d views.
function createTotsMap(appType: AppType) {
  const layers: __esri.Layer[] = [];
  if (appType === 'decon') {
    layers.push(
      ...[
        new GraphicsLayer({
          id: 'deconResults',
          title: 'Decontamination Results',
          visible: false,
          listMode: 'hide',
        }),
        new GraphicsLayer({
          id: 'contaminationMapUpdated',
          title: 'Contamination Map (Updated)',
          visible: false,
          listMode: 'hide',
        }),
      ],
    );
  }

  return new EsriMap({
    basemap: new Basemap({
      portalItem: new PortalItem({
        id: '22fb75c0fa5a4c88b8ca4c4b8ae5c90b',
      }),
    }),
    ground: 'world-elevation',
    layers,
  });
}

// --- components (Map) ---
type Props = {
  appType: AppType;
  height: number;
};

function Map({ appType, height }: Props) {
  const mapElRef = useRef<HTMLArcgisMapElement | null>(null);
  const sceneElRef = useRef<HTMLArcgisSceneElement | null>(null);

  const {
    aoiSketchLayer,
    autoZoom,
    displayDimensions,
    edits,
    homeWidget,
    map,
    mapView,
    portalLayers,
    sceneView,
    sceneViewForArea,
    sketchLayer,
    setHomeWidget,
    setMap,
    setMapView,
    setSceneView,
    setSceneViewForArea,
  } = useContext(SketchContext);

  // Creates the map shared by both views.
  useEffect(() => {
    if (map) return;

    setMap(createTotsMap(appType));
  }, [appType, map, setMap]);

  // Create a hidden scene view that is only for calculating
  // area of 3D geometry. This is to work around an issue
  // where area of 3D geometry could not be calculated when
  // 2D mode is selected.
  useEffect(() => {
    if (sceneViewForArea) return;

    setSceneViewForArea(
      new SceneView({
        container: 'hidden-scene-view',
        map: new EsriMap({
          ground: 'world-elevation',
          layers: [],
        }),
        qualityProfile: 'low',
      }),
    );
  }, [sceneViewForArea, setSceneViewForArea]);

  // The view exists on the element long before it is ready.
  // Publish it now so the widgets can attach while it loads.
  const initMapEl = useCallback(
    (el: HTMLArcgisMapElement | null) => {
      mapElRef.current = el;
      if (el) setMapView(el.view);
    },
    [setMapView],
  );

  const initSceneEl = useCallback(
    (el: HTMLArcgisSceneElement | null) => {
      sceneElRef.current = el;
      if (el) setSceneView(el.view);
    },
    [setSceneView],
  );

  const [mapViewReady, setMapViewReady] = useState(false);
  const [sceneViewReady, setSceneViewReady] = useState(false);
  const bothReady = mapViewReady && sceneViewReady;

  const [measurement2d, setMeasurement2d] =
    useState<HTMLArcgisMeasurementElement | null>(null);
  const [measurement3d, setMeasurement3d] =
    useState<HTMLArcgisMeasurementElement | null>(null);
  // MapSketchWidgets owns the sketch widget, but it belongs in the view.
  const [sketchContainer, setSketchContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [home2d, setHome2d] = useState<HTMLArcgisHomeElement | null>(null);
  const [home3d, setHome3d] = useState<HTMLArcgisHomeElement | null>(null);

  // Starts over when switching dimensions
  const [prevDisplayDimensions, setPrevDisplayDimensions] =
    useState(displayDimensions);
  if (displayDimensions !== prevDisplayDimensions) {
    setPrevDisplayDimensions(displayDimensions);
    measurement2d?.clear();
    measurement3d?.clear();
  }

  useEffect(() => {
    if (!home2d || !home3d || homeWidget) return;

    setHomeWidget({ '2d': home2d, '3d': home3d });
  }, [home2d, home3d, homeWidget]);

  const initMeasurement2d = useCallback(
    (el: HTMLArcgisMeasurementElement | null) => {
      setMeasurement2d(el);
      // Wraps a core widget in a shadow root of its own, which needs the theme as well.
      el?.componentOnReady().then(() => adoptEsriStyles(el.shadowRoot));
    },
    [],
  );

  const initMeasurement3d = useCallback(
    (el: HTMLArcgisMeasurementElement | null) => {
      setMeasurement3d(el);
      // Wraps a core widget in a shadow root of its own, which needs the theme as well.
      el?.componentOnReady().then(() => adoptEsriStyles(el.shadowRoot));
    },
    [],
  );

  const handleMapViewReady = useCallback(() => {
    const el = mapElRef.current;
    if (!el?.view?.ready) return; // ignore the not-ready edge

    adoptEsriStyles(el.shadowRoot);
    configureViewPopup(el.view);
    setMapViewReady(true);
  }, []);

  const handleSceneViewReady = useCallback(() => {
    const el = sceneElRef.current;
    if (!el?.view?.ready) return; // ignore the not-ready edge

    adoptEsriStyles(el.shadowRoot);
    configureViewPopup(el.view);
    setSceneViewReady(true);
  }, []);

  // Destroying a view destroys its map, and both views share one, so hand the
  // map back first.
  useEffect(() => {
    return function cleanup() {
      [mapElRef.current, sceneElRef.current].forEach((el) => {
        if (!el) return;

        el.view.map = null as any;
        el.destroy();
      });

      setMapView(null);
      setSceneView(null);
    };
  }, [setMapView, setSceneView]);

  // Carries the camera position across when switching dimensions.
  // Key this off the dimension actually changing.
  const lastDimensions = useRef(displayDimensions);
  useEffect(() => {
    if (!mapView || !sceneView) return;
    if (lastDimensions.current === displayDimensions) return;

    lastDimensions.current = displayDimensions;

    if (displayDimensions === '2d') {
      if (sceneView.viewpoint) mapView.viewpoint = sceneView.viewpoint.clone();
    } else {
      if (mapView.viewpoint) sceneView.viewpoint = mapView.viewpoint.clone();
      if (sceneView.camera) {
        const camera = sceneView.camera.clone();
        camera.tilt = 0.5;
        sceneView.camera = camera;
      }
    }
  }, [displayDimensions, mapView, sceneView]);

  // Creates a watch event that is used for reordering the layers
  const [watchInitialized, setWatchInitialized] = useState(false);
  useEffect(() => {
    if (!map || watchInitialized) return;

    // whenever layers are added, reorder them
    map.layers.on('change', ({ added }) => {
      if (added.length === 0) return;
      sortMapLayers(map, window.totsEditsLayers, window.totsPortalLayers);
    });

    setWatchInitialized(true);
  }, [map, watchInitialized]);

  useEffect(() => {
    if (!map) return;
    sortMapLayers(map, edits.edits, portalLayers);
  }, [edits, map, portalLayers]);

  // Zooms to the graphics whenever the sketchLayer changes
  useEffect(() => {
    if (!map || !mapView || !sceneView || !homeWidget || !autoZoom) return;
    if (!sketchLayer?.sketchLayer) return;

    const zoomGraphics = getGraphicsArray([sketchLayer, aoiSketchLayer]);

    if (zoomGraphics.length > 0) {
      const view = displayDimensions === '3d' ? sceneView : mapView;
      view.goTo(zoomGraphics).then(() => {
        // set map zoom and home widget's viewpoint
        homeWidget['2d'].viewpoint = new Viewpoint({
          targetGeometry: view.extent,
        });
        homeWidget['3d'].viewpoint = new Viewpoint({
          targetGeometry: view.extent,
        });
      });
    }
  }, [
    autoZoom,
    displayDimensions,
    map,
    mapView,
    aoiSketchLayer,
    sceneView,
    sketchLayer,
    homeWidget,
  ]);

  return (
    <Fragment>
      <div css={mapContainerStyles(height)} data-testid="tots-map">
        {map && (
          <Fragment>
            <arcgis-map
              autoDestroyDisabled={true}
              center={DEFAULT_CENTER}
              css={viewStyles(displayDimensions === '2d', bothReady)}
              highlightOptions={HIGHLIGHT_OPTIONS}
              map={map}
              ref={initMapEl}
              spatialReferenceLocked={true}
              zoom={DEFAULT_ZOOM}
              onarcgisViewReadyChange={handleMapViewReady}
            >
              {/* the top corners lay out top to bottom */}
              <arcgis-search
                label="Search"
                popupDisabled={true}
                slot="top-right"
              />
              {/* MapSketchWidgets renders the sketch widget in here, so that it
              stacks with the components rather than in the view's own ui */}
              <div
                css={sketchContainerStyles}
                ref={setSketchContainer}
                slot="top-right"
              />
              <div slot="top-right">
                <MeasurementButtons
                  displayDimensions="2d"
                  measurementWidget={measurement2d}
                />
              </div>
              <arcgis-home ref={setHome2d} slot="top-right" />
              <arcgis-zoom slot="top-right" />

              {/* the bottom corners lay out in reverse */}
              <arcgis-measurement
                areaUnit="imperial"
                linearUnit="imperial"
                ref={initMeasurement2d}
                slot="bottom-right"
              />
              <arcgis-scale-bar slot="bottom-right" unit="dual" />
            </arcgis-map>
            <arcgis-scene
              autoDestroyDisabled={true}
              center={DEFAULT_CENTER}
              css={viewStyles(displayDimensions === '3d', bothReady)}
              highlightOptions={HIGHLIGHT_OPTIONS}
              map={map}
              qualityProfile="high"
              ref={initSceneEl}
              zoom={DEFAULT_ZOOM}
              onarcgisViewReadyChange={handleSceneViewReady}
            >
              <arcgis-search
                label="Search"
                popupDisabled={true}
                slot="top-right"
              />
              <div slot="top-right">
                <MeasurementButtons
                  displayDimensions="3d"
                  measurementWidget={measurement3d}
                />
              </div>
              <arcgis-home ref={setHome3d} slot="top-right" />
              <arcgis-zoom slot="top-right" />
              <arcgis-navigation-toggle slot="top-right" />
              <arcgis-compass slot="top-right" />

              <arcgis-measurement
                areaUnit="imperial"
                linearUnit="imperial"
                ref={initMeasurement3d}
                slot="bottom-right"
              />
            </arcgis-scene>
          </Fragment>
        )}
        {map && mapView && sceneView && (
          <Fragment>
            <MapWidgets map={map} mapView={mapView} sceneView={sceneView} />
            <MapSketchWidgets
              appType={appType}
              mapView={mapView}
              sceneView={sceneView}
              sketchContainer={sketchContainer}
            />
            <MapMouseEvents
              appType={appType}
              mapView={mapView}
              sceneView={sceneView}
            />
          </Fragment>
        )}
      </div>
      <div id="hidden-scene-view" className="sr-only" />
    </Fragment>
  );
}

export default Map;
