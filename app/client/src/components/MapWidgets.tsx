/** @jsxImportSource @emotion/react */

import { useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { css } from '@emotion/react';
import Handles from '@arcgis/core/core/Handles';
import Home from '@arcgis/core/widgets/Home';
import Locate from '@arcgis/core/widgets/Locate';
import Measurement from '@arcgis/core/widgets/Measurement';
import ScaleBar from '@arcgis/core/widgets/ScaleBar';
// contexts
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';

// Replaces the prevClassName with nextClassName for all elements with
// prevClassName on the DOM.
function replaceClassName(prevClassName: string, nextClassName: string) {
  // timeout is necessary to handle race condition of loading indicator classname vs prevClassName
  setTimeout(() => {
    // get all elements with prevClassName and replace it with nextClassName
    const elms: HTMLCollectionOf<Element> =
      document.getElementsByClassName(prevClassName);
    for (let i = 0; i < elms.length; i++) {
      const el = elms[i];
      el.className = el.className.replace(prevClassName, nextClassName);
    }
  }, 100);
}

const buttonSharedStyles = css`
  margin: 8.5px;
  font-size: 15px;
  text-align: center;
  vertical-align: middle;
`;

const buttonStyle = css`
  ${buttonSharedStyles}
  background-color: white;
  color: #6e6e6e;
`;

const buttonActiveStyle = css`
  ${buttonSharedStyles}
  background-color: #999696;
  color: black;
`;

const buttonHoverStyle = css`
  ${buttonSharedStyles}
  background-color: #f0f0f0;
  color: black;
  cursor: pointer;
`;

const divSharedStyles = css`
  height: 32px;
  width: 32px;
`;

const divStyle = css`
  ${divSharedStyles}
  background-color: white;
`;

const divActiveStyle = css`
  ${divSharedStyles}
  background-color: #999696;
  color: black;

  &:focus {
    outline: none;
  }
`;

const divHoverStyle = css`
  ${divSharedStyles}
  background-color: #f0f0f0;
  cursor: pointer;
`;

const measurementContainerStyles = css`
  display: flex;
  gap: 5px;
`;

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
    homeWidget,
    setHomeWidget,
    selectedSampleIds,
    selectedScenario,
    displayGeometryType,
    layers,
    displayDimensions,
  } = useContext(SketchContext);

  // Creates and adds the home widget to the map.
  // Also moves the zoom widget to the top-right
  useEffect(() => {
    if (!mapView || !sceneView || !setHomeWidget || homeWidget) return;

    const widget2d = new Home({ view: mapView });
    mapView.ui.add(widget2d, { position: 'top-right', index: 1 });

    const widget3d = new Home({ view: sceneView });
    sceneView.ui.add(widget3d, { position: 'top-right', index: 1 });

    setHomeWidget({
      '2d': widget2d,
      '3d': widget3d,
    });
  }, [mapView, homeWidget, setHomeWidget, sceneView]);

  // Initialize the measurement widget
  const [measurementWidget, setMeasurementWidget] =
    useState<Measurement | null>(null);
  useEffect(() => {
    if (!mapView || !sceneView || measurementWidget) return;

    const widget = new Measurement({
      areaUnit: 'imperial',
      linearUnit: 'imperial',
      view: mapView,
    });

    setMeasurementWidget(widget);
  }, [displayDimensions, mapView, measurementWidget, sceneView]);

  // Display the measurement widget on the screen
  useEffect(() => {
    if (!mapView || !sceneView || !measurementWidget) return;

    // sync the measurement widget settings to 2d/3d
    measurementWidget.clear();
    measurementWidget.view = displayDimensions === '3d' ? sceneView : mapView;
    if (displayDimensions === '3d') {
      mapView.ui.remove(measurementWidget);
      sceneView.ui.add(measurementWidget, {
        position: 'bottom-right',
        index: 0,
      });
    } else {
      sceneView.ui.remove(measurementWidget);
      mapView.ui.add(measurementWidget, { position: 'bottom-right', index: 0 });
    }

    // add measurement widget to 2d view
    const node2d = document.createElement('div');
    mapView.ui.add(node2d, { position: 'top-right', index: 0 });
    createRoot(node2d).render(
      <CustomMeasurementWidget
        displayDimensions={displayDimensions}
        measurementWidget={measurementWidget}
      />,
    );

    // add measurement widget to 3d view
    const node3d = document.createElement('div');
    sceneView.ui.add(node3d, { position: 'top-right', index: 0 });
    createRoot(node3d).render(
      <CustomMeasurementWidget
        displayDimensions={displayDimensions}
        measurementWidget={measurementWidget}
      />,
    );

    return function cleanup() {
      mapView?.ui.remove(node2d);
      sceneView?.ui.remove(node3d);
    };
  }, [displayDimensions, mapView, measurementWidget, sceneView]);

  // Creates and adds the scale bar widget to the map
  const [scaleBar, setScaleBar] = useState<__esri.ScaleBar | null>(null);
  useEffect(() => {
    if (!mapView || scaleBar) return;

    const newScaleBar = new ScaleBar({
      view: mapView,
      unit: 'dual',
    });
    mapView.ui.add(newScaleBar, { position: 'bottom-right', index: 1 });
    setScaleBar(newScaleBar);
  }, [mapView, scaleBar]);

  // Creates and adds the locate widget to the map.
  const [
    locateWidget,
    setLocateWidget, //
  ] = useState<__esri.Locate | null>(null);
  useEffect(() => {
    if (!mapView || locateWidget) return;

    function buildWidget(view: __esri.MapView | __esri.SceneView) {
      const widget = new Locate({ view });

      // show the locate icon on success
      widget.on('locate', (event) => {
        replaceClassName('esri-icon-error2', 'esri-icon-locate');
      });

      // show the error icon on failure
      widget.on('locate-error', (event) => {
        replaceClassName('esri-icon-locate', 'esri-icon-error2');
      });

      return widget;
    }

    const widget2d = buildWidget(mapView);
    mapView.ui.add(widget2d, { position: 'top-right', index: 2 });
    mapView.ui.move('zoom', { position: 'top-right', index: 3 });

    const widget3d = buildWidget(sceneView);
    sceneView.ui.add(widget3d, { position: 'top-right', index: 2 });
    sceneView.ui.move('zoom', { position: 'top-right', index: 3 });
    sceneView.ui.move('navigation-toggle', { position: 'top-right', index: 4 });
    sceneView.ui.move('compass', { position: 'top-right', index: 5 });

    setLocateWidget(widget2d);
  }, [mapView, sceneView, locateWidget]);

  // Gets the graphics to be highlighted and highlights them
  const [handles] = useState(new Handles());
  useEffect(() => {
    if (!map || !selectedScenario || selectedScenario.layers.length === 0) {
      return;
    }

    const group = 'contamination-highlights-group';
    try {
      handles.remove(group);
    } catch (e) {}

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
    } catch (e) {}

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

    const samples: any = {};
    selectedSampleIds.forEach((sample) => {
      if (!samples.hasOwnProperty(sample.DECISIONUNITUUID)) {
        samples[sample.DECISIONUNITUUID] = [sample.PERMANENT_IDENTIFIER];
      } else {
        samples[sample.DECISIONUNITUUID].push(sample.PERMANENT_IDENTIFIER);
      }
    });

    Object.keys(samples).forEach((layerUuid) => {
      // find the layer
      const sampleUuids = samples[layerUuid];
      const layer = layers.find((layer) => layer.uuid === layerUuid);

      if (!layer) return;

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

type CustomWidgetButtonProps = {
  active: boolean;
  iconClass: string;
  onClick: Function;
  title: string;
};

function CustomWidgetButton({
  active,
  iconClass,
  onClick,
  title,
}: CustomWidgetButtonProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      title={title}
      css={active ? divActiveStyle : hover ? divHoverStyle : divStyle}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onClick={() => onClick()}
      onKeyDown={() => onClick()}
      role="button"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className={iconClass}
        css={
          active ? buttonActiveStyle : hover ? buttonHoverStyle : buttonStyle
        }
      />
    </div>
  );
}

type CustomMeasurementWidgetProps = {
  displayDimensions: '2d' | '3d';
  measurementWidget: Measurement;
};

function CustomMeasurementWidget({
  displayDimensions,
  measurementWidget,
}: CustomMeasurementWidgetProps) {
  const [activeTool, setActiveTool] = useState<'area' | 'distance' | null>(
    null,
  );

  return (
    <div css={measurementContainerStyles}>
      <CustomWidgetButton
        active={activeTool === 'distance'}
        iconClass="esri-icon esri-icon-measure-line"
        title="Distance Measurement Tool"
        onClick={() => {
          setActiveTool('distance');

          measurementWidget.activeTool =
            displayDimensions === '2d' ? 'distance' : 'direct-line';
        }}
      />
      <CustomWidgetButton
        active={activeTool === 'area'}
        iconClass="esri-icon esri-icon-measure-area"
        title="Area Measurement Tool"
        onClick={() => {
          setActiveTool('area');
          measurementWidget.activeTool = 'area';
        }}
      />
      <CustomWidgetButton
        active={false}
        iconClass="esri-icon esri-icon-close"
        title="Clear Measurements"
        onClick={() => {
          setActiveTool(null);
          measurementWidget.clear();
        }}
      />
    </div>
  );
}

export default MapWidgets;
