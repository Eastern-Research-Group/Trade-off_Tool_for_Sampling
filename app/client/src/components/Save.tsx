/** @jsxImportSource @emotion/react */

import { useContext } from 'react';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import { css } from '@emotion/react';
import { AppType } from 'types/Navigation';
import { DialogContext } from 'contexts/Dialog';
import { SketchContext } from 'contexts/Sketch';
import { generateUUID, updateLayerEdits } from 'utils/sketchUtils';

// --- styles (Publish) ---
const panelContainer = css`
  padding: 20px;
`;

const publishButtonContainerStyles = css`
  display: flex;
  justify-content: flex-end;
`;

const publishButtonStyles = css`
  margin-top: 10px;

  &:disabled {
    cursor: default;
    opacity: 0.65;
  }
`;

const sectionContainer = css`
  margin-bottom: 10px;
`;

// --- components (Publish) ---
type Props = {
  appType: AppType;
};

function Save({ appType }: Props) {
  const { setOptions } = useContext(DialogContext);
  const { contamMapLayer, setEdits } = useContext(SketchContext);

  const cutFromOverlappingGraphics = () => {
    if (
      !contamMapLayer?.sketchLayer ||
      contamMapLayer.sketchLayer.type !== 'graphics'
    ) {
      return;
    }

    const graphicsLayer = contamMapLayer.sketchLayer;
    const graphics = graphicsLayer.graphics
      .toArray()
      .filter((graphic) => graphic.geometry?.type === 'polygon');

    if (graphics.length < 2) return;

    const originalFeatureIds = new Set(
      graphics.map((graphic) => graphic.attributes?.PERMANENT_IDENTIFIER),
    );
    const workingGraphics = [...graphics];
    const updatedGraphics: __esri.Graphic[] = [];
    const addedGraphics: __esri.Graphic[] = [];

    for (let i = 0; i < workingGraphics.length; i++) {
      const firstGraphic = workingGraphics[i];
      const firstGeometry = firstGraphic.geometry;
      if (!firstGeometry || firstGeometry.type !== 'polygon') continue;
      const firstPolygon = firstGeometry as __esri.Polygon;

      for (let j = i + 1; j < workingGraphics.length; j++) {
        const secondGraphic = workingGraphics[j];
        const secondGeometry = secondGraphic.geometry;
        if (!secondGeometry || secondGeometry.type !== 'polygon') continue;
        const secondPolygon = secondGeometry as __esri.Polygon;

        if (!geometryEngine.intersects(firstPolygon, secondPolygon)) continue;

        const firstArea = Math.abs(
          geometryEngine.planarArea(firstPolygon, 'square-meters') || 0,
        );
        const secondArea = Math.abs(
          geometryEngine.planarArea(secondPolygon, 'square-meters') || 0,
        );

        if (firstArea === 0 || secondArea === 0) continue;
        if (Math.abs(firstArea - secondArea) < 0.000001) continue;

        const targetGraphic =
          firstArea > secondArea ? firstGraphic : secondGraphic;
        const targetPolygon =
          firstArea > secondArea ? firstPolygon : secondPolygon;
        const cutterPolygon =
          firstArea > secondArea ? secondPolygon : firstPolygon;
        const difference = geometryEngine.difference(
          targetPolygon,
          cutterPolygon,
        );
        if (!difference) continue;

        const splitGeometries = Array.isArray(difference)
          ? difference
          : [difference];
        if (splitGeometries.length === 0) continue;

        targetGraphic.geometry = splitGeometries[0] as __esri.Polygon;

        const targetId = targetGraphic.attributes?.PERMANENT_IDENTIFIER;
        if (
          targetId &&
          originalFeatureIds.has(targetId) &&
          !updatedGraphics.some(
            (graphic) =>
              graphic.attributes?.PERMANENT_IDENTIFIER ===
              targetGraphic.attributes?.PERMANENT_IDENTIFIER,
          )
        ) {
          updatedGraphics.push(targetGraphic);
        }

        for (
          let partIndex = 1;
          partIndex < splitGeometries.length;
          partIndex++
        ) {
          const newGraphic = new Graphic({
            attributes: {
              ...targetGraphic.attributes,
              PERMANENT_IDENTIFIER: generateUUID(),
              GLOBALID: generateUUID(),
            },
            geometry: splitGeometries[partIndex],
            popupTemplate: targetGraphic.popupTemplate,
            symbol: targetGraphic.symbol,
          });
          addedGraphics.push(newGraphic);
          workingGraphics.push(newGraphic);
        }
      }
    }

    if (updatedGraphics.length === 0 && addedGraphics.length === 0) {
      setOptions({
        title: 'No overlaps found',
        ariaLabel: 'No overlaps found',
        description:
          'The selected contamination feature does not overlap any other features in the active layer.',
      });
      return;
    }

    if (addedGraphics.length > 0) graphicsLayer.addMany(addedGraphics);

    setEdits((edits) => {
      let editsCopy = edits;
      if (updatedGraphics.length > 0) {
        editsCopy = updateLayerEdits({
          appType,
          edits: editsCopy,
          layer: contamMapLayer,
          type: 'update',
          changes: updatedGraphics,
        });
      }
      if (addedGraphics.length > 0) {
        editsCopy = updateLayerEdits({
          appType,
          edits: editsCopy,
          layer: contamMapLayer,
          type: 'add',
          changes: addedGraphics,
        });
      }

      return editsCopy;
    });

    return graphicsLayer.graphics.toArray();
  };

  return (
    <div css={panelContainer}>
      <h2>Save</h2>
      <div css={sectionContainer}>
        <p>Placeholder...</p>
      </div>

      <div css={publishButtonContainerStyles}>
        <button
          // disabled={publishResponse.status === 'fetching'}
          css={publishButtonStyles}
          onClick={() => {
            const graphics = cutFromOverlappingGraphics();

            // TODO save output
            console.log('graphics: ', graphics);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default Save;
