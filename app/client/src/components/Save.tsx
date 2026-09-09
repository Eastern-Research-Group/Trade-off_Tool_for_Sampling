/** @jsxImportSource @emotion/react */

import { useContext, useState } from 'react';
import saveAs from 'file-saver';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import { css } from '@emotion/react';
import { AppType } from 'types/Navigation';
import MessageBox from 'components/MessageBox';
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
  const { contamMapLayer, edits, setEdits } = useContext(SketchContext);

  const [errorMessage, setErrorMessage] = useState('');

  const getContaminationFeatureId = (graphic: __esri.Graphic) =>
    graphic.attributes?.PERMANENT_IDENTIFIER;

  const ensureContaminationAttributes = (graphic: __esri.Graphic) => {
    const permanentId = graphic.attributes?.PERMANENT_IDENTIFIER;
    const globalId = graphic.attributes?.GLOBALID;

    graphic.attributes = {
      TYPE: 'Contamination Map',
      CONTAMTYPE: 'chemical',
      CONTAMVAL: 0,
      CONTAMUNIT: 'cfu',
      ...(graphic.attributes ?? {}),
      PERMANENT_IDENTIFIER: permanentId ?? generateUUID(),
      GLOBALID: globalId ?? generateUUID(),
      OBJECTID: graphic.attributes?.OBJECTID ?? -1,
    };
  };

  const getLayerFeatureIds = (layerEdits: any) => {
    const ids = new Set<string>();
    ['adds', 'updates', 'published'].forEach((key) => {
      layerEdits?.[key]?.forEach((feature: any) => {
        const id = feature.attributes?.PERMANENT_IDENTIFIER;
        if (id) ids.add(id);
      });
    });

    return ids;
  };

  const syncGraphicsToEdits = (graphics: __esri.Graphic[]) => {
    let editsCopy = edits;
    let layerEdits = editsCopy.edits.find(
      (edit) => edit.layerId === contamMapLayer?.layerId,
    );

    const trackedIds = getLayerFeatureIds(layerEdits);
    const missingGraphics = graphics.filter((graphic) => {
      const id = getContaminationFeatureId(graphic);
      return id && !trackedIds.has(id);
    });

    const hasMissingGraphics = missingGraphics.length > 0;

    if (hasMissingGraphics && contamMapLayer) {
      editsCopy = updateLayerEdits({
        appType,
        edits: editsCopy,
        layer: contamMapLayer,
        type: 'add',
        changes: missingGraphics,
      });
      layerEdits = editsCopy.edits.find(
        (edit) => edit.layerId === contamMapLayer.layerId,
      );
    }

    return { editsCopy, layerEdits, hasMissingGraphics };
  };

  const cutFromOverlappingGraphics = () => {
    if (
      !contamMapLayer?.sketchLayer ||
      contamMapLayer.sketchLayer.type !== 'graphics'
    ) {
      setErrorMessage(
        'No contamination layer selected. Please select a contamination map and try again.',
      );
      return;
    }

    const graphicsLayer = contamMapLayer.sketchLayer;
    const graphics = graphicsLayer.graphics
      .toArray()
      .filter((graphic) => graphic.geometry?.type === 'polygon');

    if (graphics.length === 0) {
      setErrorMessage(
        'No graphics found in the contamination layer. Please add graphics and try again.',
      );
      return;
    }

    if (
      graphics.some(
        (graphic) =>
          !graphic.attributes?.CONTAMVAL || graphic.attributes.CONTAMVAL <= 0,
      )
    ) {
      setErrorMessage(
        'One or more graphics have a Activity (Contamination Value) of less than or equal to 0 or are missing Activity. Please enter a Activity for all graphics and retry.',
      );
      return;
    }

    setErrorMessage('');

    graphics.forEach(ensureContaminationAttributes);

    const syncResult = syncGraphicsToEdits(graphics);
    let { editsCopy, layerEdits } = syncResult;
    const { hasMissingGraphics } = syncResult;

    if (graphics.length < 2) {
      if (hasMissingGraphics) setEdits(editsCopy);
      return { graphics, json: JSON.stringify(layerEdits) };
    }

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
      if (hasMissingGraphics) setEdits(editsCopy);
      return { graphics, json: JSON.stringify(layerEdits) };
    }

    if (addedGraphics.length > 0) graphicsLayer.addMany(addedGraphics);

    if (updatedGraphics.length > 0) {
      editsCopy = updateLayerEdits({
        appType,
        edits: editsCopy,
        layer: contamMapLayer,
        type: 'update',
        changes: updatedGraphics,
      });
      layerEdits = editsCopy.edits.find(
        (edit) => edit.layerId === contamMapLayer.layerId,
      );
    }
    if (addedGraphics.length > 0) {
      editsCopy = updateLayerEdits({
        appType,
        edits: editsCopy,
        layer: contamMapLayer,
        type: 'add',
        changes: addedGraphics,
      });
      layerEdits = editsCopy.edits.find(
        (edit) => edit.layerId === contamMapLayer.layerId,
      );
    }
    setEdits(editsCopy);

    return {
      graphics: graphicsLayer.graphics.toArray(),
      json: JSON.stringify({
        ...layerEdits,
        visible: false,
      }),
    };
  };

  return (
    <div css={panelContainer}>
      <h2>Save</h2>
      <div css={sectionContainer}>
        <p>
          Click the "Save" button to download the contamination map as a JSON
          file.
        </p>
        <p>
          <strong>Contamination Map: </strong>
          {contamMapLayer?.name}
        </p>
      </div>

      <div css={publishButtonContainerStyles}>
        <button
          // disabled={publishResponse.status === 'fetching'}
          css={publishButtonStyles}
          onClick={async () => {
            if (!contamMapLayer) return;

            const output = cutFromOverlappingGraphics();
            console.log('output: ', output);

            if (!output) return;

            saveAs(
              new Blob([output.json], { type: 'application/json' }),
              `${contamMapLayer?.name}_contamination_map.json`,
            );
          }}
        >
          Save
        </button>
      </div>
      {errorMessage && (
        <MessageBox
          title="Missing Data"
          message={errorMessage}
          severity="error"
        />
      )}
    </div>
  );
}

export default Save;
