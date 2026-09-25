/** @jsxImportSource @emotion/react */

import { useContext, useEffect, useState } from 'react';
import Handles from '@arcgis/core/core/Handles';
// contexts
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';

// --- components (MapWidgets) ---
type Props = {
  map: __esri.Map;
  mapView: __esri.MapView;
  sceneView: __esri.SceneView;
};

function MapWidgets({ map, mapView, sceneView }: Props) {
  const { trainingMode } = useContext(NavigationContext);
  const {
    edits,
    selectedSampleIds,
    selectedScenario,
    displayGeometryType,
    layers,
    displayDimensions,
  } = useContext(SketchContext);

  // Gets the graphics to be highlighted and highlights them
  const [handles] = useState(new Handles());
  useEffect(() => {
    if (
      !map ||
      !selectedScenario ||
      selectedScenario.type !== 'scenario' ||
      selectedScenario.layers.length === 0
    ) {
      return;
    }

    const group = 'contamination-highlights-group';
    try {
      handles.remove(group);
    } catch (e) {
      console.error(e);
    }

    // find the group layer
    const groupLayer = map.findLayerById(
      selectedScenario.layerId,
    ) as __esri.GroupLayer;

    // Get any graphics that have a contam value
    if (trainingMode && groupLayer) {
      groupLayer.layers.forEach((layer) => {
        if (layer.type !== 'graphics') return;

        const highlightGraphics: __esri.Graphic[] = [];
        const tempLayer = layer as __esri.GraphicsLayer;
        tempLayer.graphics.forEach((graphic) => {
          if (graphic.attributes.CONTAMVAL) {
            highlightGraphics.push(graphic);
          }
        });

        // Highlight the graphics with a contam value
        if (highlightGraphics.length === 0) return;

        const view = displayDimensions === '3d' ? sceneView : mapView;
        view.whenLayerView(tempLayer).then((layerView) => {
          const handle = layerView.highlight(highlightGraphics);
          handles.add(handle, group);
        });
      });
    }
  }, [
    displayDimensions,
    map,
    handles,
    edits,
    selectedScenario,
    mapView,
    sceneView,
    trainingMode,
  ]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const group = 'highlights-group';
    try {
      handles.remove(group);
    } catch (e) {
      console.error(e);
    }

    // Highlights graphics on the provided layer that matches the provided
    // list of uuids.
    function highlightGraphics(
      layer: __esri.GraphicsLayer | __esri.FeatureLayer | null,
      uuids: any,
    ) {
      if (!layer) return;

      const itemsToHighlight: __esri.Graphic[] = [];
      const tempLayer = layer as __esri.GraphicsLayer;
      tempLayer.graphics.forEach((graphic) => {
        if (uuids.includes(graphic.attributes.PERMANENT_IDENTIFIER)) {
          itemsToHighlight.push(graphic);
        }
      });

      // Highlight the graphics with a contam value
      if (itemsToHighlight.length === 0) return;

      const view = displayDimensions === '3d' ? sceneView : mapView;
      view
        .whenLayerView(tempLayer)
        .then((layerView) => {
          const handle = layerView.highlight(itemsToHighlight);
          handles.add(handle, group);
        })
        .catch((err) => console.error(err));
    }

    // this is for highlighting a tots sample in the decon app
    if (
      selectedSampleIds.length === 1 &&
      selectedSampleIds[0]?.graphic?.layer?.type === 'feature'
    ) {
      const graphic = selectedSampleIds[0].graphic;
      const tempLayer = graphic.layer as __esri.FeatureLayer;
      const itemsToHighlight: __esri.Graphic[] = [graphic];
      const view = displayDimensions === '3d' ? sceneView : mapView;
      view
        .whenLayerView(tempLayer)
        .then((layerView) => {
          const handle = layerView.highlight(itemsToHighlight);
          handles.add(handle, group);
        })
        .catch((err) => console.error(err));
      return;
    }

    const samples: any = {};
    selectedSampleIds.forEach((sample) => {
      const key =
        sample.DECISIONUNITUUID ?? sample.graphic?.layer?.id ?? 'aoi-assessed';
      if (!Object.prototype.hasOwnProperty.call(samples, key)) {
        samples[key] = [sample.PERMANENT_IDENTIFIER];
      } else {
        samples[key].push(sample.PERMANENT_IDENTIFIER);
      }
    });

    Object.keys(samples).forEach((layerUuid) => {
      // find the layer
      const sampleUuids = samples[layerUuid];
      const layer = layers.find((layer) => layer.uuid === layerUuid);

      if (!layer) return;

      if (layer.sketchLayer?.type !== 'group')
        highlightGraphics(layer.sketchLayer, sampleUuids);
      highlightGraphics(layer.pointsLayer, sampleUuids);
      highlightGraphics(layer.hybridLayer, sampleUuids);
    });
  }, [
    map,
    handles,
    layers,
    mapView,
    sceneView,
    selectedSampleIds,
    displayDimensions,
    displayGeometryType,
  ]);

  return null;
}

export default MapWidgets;
