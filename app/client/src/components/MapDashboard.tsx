/** @jsxImportSource @emotion/react */

import React, {
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { css } from '@emotion/react';
import EsriMap from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
// components
import MapMouseEvents from 'components/MapMouseEvents';
import MapWidgets from 'components/MapWidgets';
// contexts
import { SketchContext } from 'contexts/Sketch';

// --- styles (Map) ---
const mapStyles = (height: number) => {
  return css`
    height: ${height}px;
    background-color: whitesmoke;
    .esri-sketch__info-section,
    .esri-sketch__feature-count-badge {
      width: 100%;
    }
    .esri-sketch__info-section:last-of-type {
      display: none !important;
    }
  `;
};

// --- components (Map) ---
type Props = {
  height: number;
};

function Map({ height }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);

  const {
    mapDashboard,
    setMapDashboard,
    mapViewDashboard,
    setMapViewDashboard,
    sceneViewDashboard,
    setSceneViewDashboard,
    setSceneViewForAreaDashboard,
  } = useContext(SketchContext);

  // Creates the map and view
  useEffect(() => {
    if (!mapRef.current) return;
    if (mapViewDashboard || sceneViewDashboard) return;

    const newMap = new EsriMap({
      basemap: 'streets-vector',
      ground: 'world-elevation',
      layers: [],
    });
    setMapDashboard(newMap);

    const viewParams: any = {
      container: mapRef.current,
      map: newMap,
      center: [-95, 37],
      zoom: 3,
      popup: {
        defaultPopupTemplateEnabled: true,
        maxInlineActions: 5,
      },
      highlightOptions: {
        color: '#32C5FD',
        fillOpacity: 1,
      },
    };

    const view = new MapView(viewParams);

    setMapViewDashboard(view);

    viewParams.map = undefined as any;
    viewParams.container = undefined as any;
    const scene = new SceneView({
      ...viewParams,
      qualityProfile: 'high',
    });

    setSceneViewDashboard(scene);

    // Create a hidden scene view that is only for calculating
    // area of 3D geometry. This is to work around an issue
    // where area of 3D geometry could not be calculated when
    // 2D mode is selected.
    setSceneViewForAreaDashboard(
      new SceneView({
        container: 'hidden-scene-view',
        map: new EsriMap({
          ground: 'world-elevation',
          layers: [],
        }),
        qualityProfile: 'low',
      }),
    );
  }, [
    mapViewDashboard,
    sceneViewDashboard,
    setMapDashboard,
    setMapViewDashboard,
    setSceneViewDashboard,
    setSceneViewForAreaDashboard,
  ]);

  // Creates a watch event that is used for reordering the layers
  const [watchInitialized, setWatchInitialized] = useState(false);
  useEffect(() => {
    if (!mapDashboard || watchInitialized) return;

    // whenever layers are added, reorder them
    mapDashboard.layers.on('change', ({ added }) => {
      if (added.length === 0) return;

      // gets a layer type value used for sorting
      function getLayerType(layer: __esri.Layer) {
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

        if (layer.type === 'graphics' || groupType === 'graphics') {
          type = 'graphics';
        } else if (layer.type === 'feature' || groupType === 'feature') {
          type = 'feature';
        } else if (layer.type === 'map-image') {
          type = 'map-image';
        } else if (['csv', 'geo-rss', 'kml', 'wms'].includes(layer.type)) {
          type = 'file';
        } else if (
          imageryTypes.includes(type) ||
          imageryTypes.includes(groupType)
        ) {
          type = 'imagery';
        }

        return type;
      }

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
        'graphics',
      ];
      mapDashboard.layers.sort((a: __esri.Layer, b: __esri.Layer) => {
        return (
          sortBy.indexOf(getLayerType(a)) - sortBy.indexOf(getLayerType(b))
        );
      });
    });

    setWatchInitialized(true);
  }, [mapDashboard, watchInitialized]);

  return (
    <Fragment>
      <div ref={mapRef} css={mapStyles(height)} data-testid="tots-map">
        {mapViewDashboard && sceneViewDashboard && (
          <Fragment>
            <MapWidgets
              mapView={mapViewDashboard}
              sceneView={sceneViewDashboard}
            />
            <MapMouseEvents
              mapView={mapViewDashboard}
              sceneView={sceneViewDashboard}
            />
          </Fragment>
        )}
      </div>
      <div id="hidden-scene-view" className="sr-only" />
    </Fragment>
  );
}

export default Map;
