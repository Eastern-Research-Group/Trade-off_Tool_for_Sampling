/** @jsxImportSource @emotion/react */

import { Fragment, useContext, useEffect, useState } from 'react';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import { css } from '@emotion/react';
import IconEdit from '~icons/fa7-solid/edit';
import IconPlus from '~icons/fa7-solid/plus';
import IconTimes from '~icons/fa7-solid/times';
import IconTrashAlt from '~icons/fa7-solid/trash-alt';
// components
import AoiSketchButton from 'components/AoiSketchButton';
import ColorPicker from 'components/ColorPicker';
import { EditContaminationMapCharacterization } from 'components/EditLayerMetaData';
// config
import { PolygonSymbol } from 'config/sampleAttributes';
// contexts
import { DialogContext } from 'contexts/Dialog';
import Select from 'components/Select';
import { SketchContext } from 'contexts/Sketch';
// styles
import { isDecon } from 'config/navigation';
import { reactSelectStyles } from 'styles';
// types
import { EditsType, LayerEditsType } from 'types/Edits';
import { LayerType } from 'types/Layer';
// utils
import {
  createLayerEditTemplate,
  generateUUID,
  getDefaultSamplingMaskLayer,
  updateLayerEdits,
} from 'utils/sketchUtils';

// --- styles ---

const iconButtonContainerStyles = css`
  display: flex;
  justify-content: space-between;
`;

const iconButtonStyles = css`
  width: 25px;
  margin: 0 2px;
  padding: 0.25em 0;
  color: black;
  background-color: white;
  border-radius: 0;
  line-height: 16px;
  text-decoration-line: none;
  font-weight: bold;

  &:hover {
    background-color: white;
  }

  svg {
    font-size: 17px;
  }
`;

const layerButtonContainerStyles = css`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;

  div {
    display: flex;
    justify-content: flex-end;
  }
`;

const layerSectionStyles = css`
  margin-top: 1rem;
`;

const layerSelectStyles = css`
  margin-bottom: 10px;
`;

const verticalCenterTextStyles = css`
  display: flex;
  align-items: center;
`;

// --- components ---

function StagingAreas() {
  const { setOptions } = useContext(DialogContext);
  const {
    defaultSymbols,
    edits,
    layers,
    layersInitialized,
    map,
    setAoiSketchLayer,
    setDefaultSymbolSingle,
    setEdits,
    setLayers,
    setStagingAreaLayer,
    stagingAreaLayer,
  } = useContext(SketchContext);

  const [addScenarioVisible, setAddScenarioVisible] = useState(false);
  const [editScenarioVisible, setEditScenarioVisible] = useState(false);
  const [stagingLayers, setStagingLayers] = useState<LayerType[]>([]);
  const [lastStagingAreaLayer, setLastStagingAreaLayer] =
    useState<LayerType | null>(null);

  useEffect(() => {
    if (!stagingAreaLayer) {
      setEditScenarioVisible(false);
      return;
    }

    const hasAoiGraphics =
      stagingAreaLayer?.sketchLayer?.type === 'graphics' &&
      stagingAreaLayer.sketchLayer.graphics.length > 0;
    if (!hasAoiGraphics) setEditScenarioVisible(true);
  }, [stagingAreaLayer]);

  const [initializedLayers, setInitializedLayers] = useState(false);
  useEffect(() => {
    if (!layersInitialized) return;

    const newLayers: LayerType[] = [];
    layers.forEach((layer) => {
      if (layer.layerType === 'Contamination Map') newLayers.push(layer);
    });
    setStagingLayers(newLayers);
    setInitializedLayers(true);
  }, [edits, layers, layersInitialized]);

  const [initializedLayer, setInitializedDeconLayer] = useState(false);
  useEffect(() => {
    if (
      stagingAreaLayer ||
      initializedLayer ||
      !initializedLayers ||
      !layersInitialized ||
      !map
    )
      return;

    setInitializedDeconLayer(true);

    if (stagingLayers.length > 0) {
      setStagingAreaLayer(stagingLayers[0]);
    } else {
      const newAoiSketchLayer = getDefaultSamplingMaskLayer(
        '',
        'Contamination Map',
        'Contamination Map',
        true,
      );
      const newAoiEdits = createLayerEditTemplate(newAoiSketchLayer, 'add');
      newAoiEdits.description = '';

      // make a copy of the edits context variable
      setEdits((edits) => {
        return {
          count: edits.count + 1,
          edits: [...edits.edits, newAoiEdits],
        };
      });

      setStagingAreaLayer(newAoiSketchLayer);

      const tLayers = [...layers, newAoiSketchLayer];

      // update layers (set parent layer)
      window.totsLayers = tLayers;
      setLayers(tLayers);

      // add the scenario group layer to the map
      if (newAoiSketchLayer.sketchLayer) map.add(newAoiSketchLayer.sketchLayer);
    }
  }, [
    initializedLayer,
    initializedLayers,
    layers,
    layersInitialized,
    map,
    setEdits,
    setLayers,
    setStagingAreaLayer,
    stagingAreaLayer,
    stagingLayers,
  ]);

  useEffect(() => {
    setAoiSketchLayer(stagingAreaLayer);
  }, [stagingAreaLayer, setAoiSketchLayer]);

  function handleAdd() {
    if (!map) return;

    const newAoiSketchLayer = getDefaultSamplingMaskLayer(
      '',
      'Contamination Map',
      'Contamination Map',
      true,
    );
    const newAoiEdits = createLayerEditTemplate(newAoiSketchLayer, 'add');
    newAoiEdits.description = '';

    // make a copy of the edits context variable
    setEdits((edits) => {
      return {
        count: edits.count + 1,
        edits: [...edits.edits, newAoiEdits],
      };
    });

    setLastStagingAreaLayer(stagingAreaLayer);
    setStagingAreaLayer(newAoiSketchLayer);

    const tLayers = [...layers];
    if (newAoiSketchLayer) tLayers.push(newAoiSketchLayer);

    // update layers (set parent layer)
    window.totsLayers = tLayers;
    setLayers(tLayers);

    // add the layer to the map
    if (newAoiSketchLayer.sketchLayer) map.add(newAoiSketchLayer.sketchLayer);
  }

  function handleDelete(lastDeconSketchLayer?: LayerType | null) {
    if (!stagingAreaLayer) return;

    const idsToDelete: string[] = [stagingAreaLayer.layerId];

    const newLayers = stagingLayers.filter(
      (layer) => stagingAreaLayer.layerId !== layer.layerId,
    );
    setStagingLayers(newLayers);
    if (lastDeconSketchLayer) setStagingAreaLayer(lastDeconSketchLayer);
    else setStagingAreaLayer(newLayers.length > 0 ? newLayers[0] : null);

    // remove all of the child layers
    setLayers((layers) => {
      return layers.filter((layer) => !idsToDelete.includes(layer.layerId));
    });

    // remove the scenario from edits
    const newEdits: EditsType = {
      count: edits.count + 1,
      edits: edits.edits.filter(
        (item) => item.layerId !== stagingAreaLayer.layerId,
      ),
    };
    setEdits(newEdits);

    if (!map) return;

    // remove the scenario from the map
    const mapLayer = map.layers.find(
      (layer) => layer.id === stagingAreaLayer?.layerId,
    );
    if (mapLayer) map.remove(mapLayer);
  }

  const stagingAreaEdits = edits.edits.find(
    (edit) =>
      edit.type === 'layer' &&
      edit.layerType === 'Contamination Map' &&
      edit.layerId === stagingAreaLayer?.layerId,
  ) as LayerEditsType | undefined;

  const cutFromOverlappingGraphics = () => {
    if (
      !stagingAreaLayer?.sketchLayer ||
      stagingAreaLayer.sketchLayer.type !== 'graphics'
    ) {
      return;
    }

    const graphicsLayer = stagingAreaLayer.sketchLayer;
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

    // Loop through all polygons and cut overlaps so smaller polygons cut holes in larger ones.
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

        if (!geometryEngine.intersects(firstPolygon, secondPolygon)) {
          continue;
        }

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

    const appType = isDecon() ? 'decon' : 'sampling';
    setEdits((edits) => {
      let editsCopy = edits;
      if (updatedGraphics.length > 0) {
        editsCopy = updateLayerEdits({
          appType,
          edits: editsCopy,
          layer: stagingAreaLayer,
          type: 'update',
          changes: updatedGraphics,
        });
      }
      if (addedGraphics.length > 0) {
        editsCopy = updateLayerEdits({
          appType,
          edits: editsCopy,
          layer: stagingAreaLayer,
          type: 'add',
          changes: addedGraphics,
        });
      }

      return editsCopy;
    });
  };

  // TODO create defaultSymbol for contam map
  return (
    <div>
      <p>Placeholder...</p>

      <div css={layerSectionStyles}>
        <ColorPicker
          title="Default Contamination Area Symbology"
          symbol={defaultSymbols.symbols['Contamination Map']}
          onChange={(symbol: PolygonSymbol) => {
            setDefaultSymbolSingle('Contamination Map', symbol);
          }}
        />

        <p>
          Edit the contamination map name and add a description. Select "Draw
          Contamination Area" to designate the contamination area boundary.
          Click Save to keep your layer metadata in sync.
        </p>

        <button
          className="usa-button usa-button--outline"
          onClick={cutFromOverlappingGraphics}
        >
          Cut Selected Feature Out of Others
        </button>

        <div css={iconButtonContainerStyles}>
          <div css={verticalCenterTextStyles}>
            <label htmlFor="suitability-aoi-select-input">
              Active Contamination Area Layer
            </label>
          </div>
          <div css={layerButtonContainerStyles}>
            <div>
              {stagingAreaLayer && (
                <Fragment>
                  <button
                    css={iconButtonStyles}
                    title="Delete Layer"
                    onClick={() => handleDelete()}
                  >
                    <IconTrashAlt />
                    <span className="sr-only">Delete Layer</span>
                  </button>

                  {stagingAreaLayer.status !== 'published' && (
                    <button
                      css={iconButtonStyles}
                      title={editScenarioVisible ? 'Cancel' : 'Edit Layer'}
                      onClick={() => {
                        setAddScenarioVisible(false);
                        setEditScenarioVisible(!editScenarioVisible);
                      }}
                    >
                      {editScenarioVisible ? <IconTimes /> : <IconEdit />}
                      <span className="sr-only">
                        {editScenarioVisible ? 'Cancel' : 'Edit Layer'}
                      </span>
                    </button>
                  )}
                </Fragment>
              )}
              <button
                css={iconButtonStyles}
                title={addScenarioVisible ? 'Cancel' : 'Add Layer'}
                onClick={() => {
                  setEditScenarioVisible(false);
                  setAddScenarioVisible(!addScenarioVisible);

                  if (!addScenarioVisible) {
                    handleAdd();
                  } else {
                    // delete the newly added layer
                    handleDelete(lastStagingAreaLayer);
                  }
                }}
              >
                {addScenarioVisible ? <IconTimes /> : <IconPlus />}
                <span className="sr-only">
                  {addScenarioVisible ? 'Cancel' : 'Add Layer'}
                </span>
              </button>
            </div>
          </div>
        </div>
        <Select
          id="suitability-aoi-select-input-container"
          inputId="suitability-aoi-select-input"
          css={layerSelectStyles}
          styles={reactSelectStyles as any}
          isDisabled={addScenarioVisible || editScenarioVisible}
          options={stagingLayers}
          value={stagingAreaLayer}
          onChange={(ev) => setStagingAreaLayer(ev as LayerType)}
        />
      </div>

      {stagingAreaEdits && (
        <EditContaminationMapCharacterization
          aoiLayer={stagingAreaEdits}
          disabled={
            stagingAreaLayer?.sketchLayer?.type === 'graphics' &&
            stagingAreaLayer.sketchLayer.graphics.length === 0
          }
          editVisible={addScenarioVisible || editScenarioVisible}
          onSave={(saveResults) => {
            if (saveResults?.status !== 'success') return;
            setAddScenarioVisible(false);
            setEditScenarioVisible(false);
          }}
        >
          <AoiSketchButton
            className="margin-top-1"
            label="Draw Contamination Map Area"
            buttonId="contamination-map-aoi"
            sketchLayerType="Contamination Map"
            defaultAttributes={{
              CONTAMTYPE: 'chemical',
              CONTAMVAL: 0,
              CONTAMUNIT: 'cfu',
            }}
            onContinue={() => {}}
            replaceGraphics={false}
            sketchLayer={stagingAreaLayer?.sketchLayer}
          />
        </EditContaminationMapCharacterization>
      )}
    </div>
  );
}

export default StagingAreas;
