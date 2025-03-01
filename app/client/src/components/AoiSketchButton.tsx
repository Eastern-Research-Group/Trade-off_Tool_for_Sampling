/** @jsxImportSource @emotion/react */

import { useContext, useEffect } from 'react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import { css } from '@emotion/react';
// contexts
import { SketchContext } from 'contexts/Sketch';
// utils
import {
  activateSketchButton,
  getDefaultSamplingMaskLayer,
} from 'utils/sketchUtils';

// --- styles (Calculate) ---
const sketchAoiTextStyles = css`
  display: flex;
  justify-content: space-between;
  align-items: center;

  i {
    font-size: 20px;
    margin-right: 5px;
  }
`;

const sketchAoiButtonStyles = css`
  background-color: white;
  color: black;
  margin-bottom: 0.5rem;

  &:hover,
  &:focus {
    background-color: #e7f6f8;
    cursor: pointer;
  }
`;

// --- components ---

const BUTTON_ID = 'decon-mask';

type Props = {
  className?: string;
  sketchLayer?:
    | __esri.FeatureLayer
    | __esri.GraphicsLayer
    | __esri.GroupLayer
    | null;
};

function AoiButton({ className, sketchLayer }: Props) {
  const {
    aoiSketchLayer,
    aoiSketchVM,
    displayDimensions,
    layers,
    layersInitialized,
    map,
    mapView,
    sceneView,
    setAoiSketchLayer,
    setLayers,
    sketchVM,
  } = useContext(SketchContext);

  window.totsLayers = layers;

  // Handle a user clicking the sketch AOI button. If an AOI is not selected from the
  // dropdown this will create an AOI layer. This also sets the sketchVM to use the
  // selected AOI and triggers a React useEffect to allow the user to sketch on the map.
  const sketchAoiButtonClick = () => {
    if (!map || !aoiSketchVM || !sceneView || !mapView) return;

    // save changes from other sketchVM and disable to prevent
    // interference
    if (sketchVM) sketchVM[displayDimensions].cancel();

    // make the style of the button active
    const wasSet = activateSketchButton(BUTTON_ID);

    if (wasSet) {
      // let the user draw/place the shape
      aoiSketchVM.create('polygon');
    } else {
      aoiSketchVM.cancel();
    }
  };

  // Initializes the aoi layer for performance reasons
  useEffect(() => {
    if (!map || !layersInitialized || aoiSketchLayer) return;

    const maskLayer = layers.find((l) => l.name === 'Sketched Sampling Mask');
    if (maskLayer) {
      setAoiSketchLayer(maskLayer);
      return;
    }

    const newAoiSketchLayer = getDefaultSamplingMaskLayer();
    const sketchLayer = newAoiSketchLayer.sketchLayer;
    if (sketchLayer) map.add(sketchLayer);

    // add the layer to the map
    setLayers((layers) => {
      const newLayers = [...layers, newAoiSketchLayer];
      return newLayers;
    });

    // set the active sketch layer
    setAoiSketchLayer(newAoiSketchLayer);
  }, [
    map,
    aoiSketchLayer,
    layers,
    setAoiSketchLayer,
    layersInitialized,
    setLayers,
  ]);

  // Set the sketch VM layer to the aoi sketch layer.
  const targetLayer = sketchLayer ?? aoiSketchLayer?.sketchLayer;
  if (
    targetLayer instanceof GraphicsLayer &&
    aoiSketchVM &&
    aoiSketchVM.layer !== targetLayer
  ) {
    aoiSketchVM.layer = targetLayer;
  }

  return (
    <button
      id={BUTTON_ID}
      title="Draw Decon Mask"
      className={`sketch-button ${className}`}
      onClick={() => {
        if (!aoiSketchLayer) return;

        sketchAoiButtonClick();
      }}
      css={sketchAoiButtonStyles}
    >
      <span css={sketchAoiTextStyles}>
        <i className="fas fa-draw-polygon" /> <span>Draw Area of Interest</span>
      </span>
    </button>
  );
}

export default AoiButton;
