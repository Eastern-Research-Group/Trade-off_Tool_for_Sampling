/** @jsxImportSource @emotion/react */

import { useContext } from 'react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import { css } from '@emotion/react';
import IconDrawPolygon from '~icons/fa7-solid/draw-polygon';
// config
import { isDecon } from 'config/navigation';
// contexts
import { DialogContext } from 'contexts/Dialog';
import { SketchContext } from 'contexts/Sketch';
// types
import { AppType } from 'types/Navigation';
import { LayerTypeName } from 'types/Layer';
// utils
import { activateSketchButton, updateLayerEdits } from 'utils/sketchUtils';

// --- styles (Calculate) ---
const sketchAoiTextStyles = css`
  display: flex;
  gap: 0.25rem;
  align-items: center;
  svg {
    font-size: 20px;
    margin-right: 5px;
  }
`;

const sketchAoiButtonStyles = css`
  background-color: white;
  color: black;
  margin-bottom: 0.5rem;
  width: 100%;
  border: 1px solid #ccc;

  &:hover,
  &:focus {
    background-color: #e7f6f8;
    cursor: pointer;
  }
`;

// --- components ---

type Props = {
  className?: string;
  label?: string;
  buttonId?: string;
  sketchLayerType?: LayerTypeName;
  defaultAttributes?: { [key: string]: any };
  onContinue?: () => void;
  replaceGraphics?: boolean;
  sketchLayer?:
    | __esri.FeatureLayer
    | __esri.GraphicsLayer
    | __esri.GroupLayer
    | null;
};

function AoiSketchButton({
  className,
  label = 'Draw Staging Area Boundary',
  buttonId = 'staging-aoi',
  sketchLayerType = 'Staging Area Mask',
  defaultAttributes,
  onContinue,
  replaceGraphics = false,
  sketchLayer,
}: Props) {
  const { setOptions } = useContext(DialogContext);
  const {
    aoiSketchLayer,
    aoiSketchVM,
    defaultSymbols,
    displayDimensions,
    map,
    mapView,
    sceneView,
    setEdits,
    sketchVM,
  } = useContext(SketchContext);

  // Handle a user clicking the sketch AOI button. If an AOI is not selected from the
  // dropdown this will create an AOI layer. This also sets the sketchVM to use the
  // selected AOI and triggers a React useEffect to allow the user to sketch on the map.
  const sketchAoiButtonClick = () => {
    if (!map || !aoiSketchVM || !sceneView || !mapView) return;
    const appType: AppType = isDecon() ? 'decon' : 'sampling';

    function startSketch() {
      if (!aoiSketchVM) return;

      aoiSketchVM.polygonSymbol = defaultSymbols.symbols[
        sketchLayerType
      ] as any;

      // Let the create handler know which attributes to apply to new graphics.
      if (defaultAttributes) {
        (aoiSketchVM as any).totsDefaultAttributes = defaultAttributes;
      } else {
        (aoiSketchVM as any).totsDefaultAttributes = null;
      }

      // save changes from other sketchVM and disable to prevent
      // interference
      if (sketchVM) sketchVM[displayDimensions].cancel();

      // make the style of the button active
      const wasSet = activateSketchButton(buttonId);

      if (wasSet) {
        // let the user draw/place the shape
        aoiSketchVM.create('polygon');
      } else {
        aoiSketchVM.cancel();
      }
    }

    if (
      replaceGraphics &&
      aoiSketchLayer?.sketchLayer?.type === 'graphics' &&
      aoiSketchLayer.sketchLayer.graphics.length > 0
    ) {
      setOptions({
        title: 'Would you like to continue?',
        ariaLabel: 'Would you like to continue?',
        description:
          'Staging Area Boundary layers are only allowed to have one graphic. ' +
          'This operation will delete any graphics on the Staging Area Boundary. ' +
          'If you want to keep the graphic, click Cancel and add a new Staging Area Boundary Layer.',
        onContinue: () => {
          const deletedGraphics: __esri.Graphic[] =
            aoiSketchLayer?.sketchLayer?.type === 'graphics'
              ? aoiSketchLayer.sketchLayer.graphics.toArray()
              : [];

          if (aoiSketchLayer?.sketchLayer?.type === 'graphics')
            aoiSketchLayer.sketchLayer.graphics.removeAll();

          if (aoiSketchLayer && deletedGraphics.length > 0) {
            setEdits((edits) =>
              updateLayerEdits({
                appType,
                edits,
                layer: aoiSketchLayer,
                type: 'delete',
                changes: deletedGraphics,
              }),
            );
          }

          startSketch();

          if (onContinue) onContinue();
        },
      });
    } else {
      startSketch();
    }
  };

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
      id={buttonId}
      title={label}
      className={`sketch-button ${className}`}
      onClick={sketchAoiButtonClick}
      css={sketchAoiButtonStyles}
    >
      <span css={sketchAoiTextStyles}>
        <IconDrawPolygon /> <span>{label}</span>
      </span>
    </button>
  );
}

export default AoiSketchButton;
