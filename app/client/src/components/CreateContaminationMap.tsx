/** @jsxImportSource @emotion/react */

import { Fragment, useContext, useEffect, useState } from 'react';
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
import Select from 'components/Select';
import { SketchContext } from 'contexts/Sketch';
// styles
import { reactSelectStyles } from 'styles';
// types
import { EditsType, LayerEditsType } from 'types/Edits';
import { LayerType } from 'types/Layer';
// utils
import {
  createLayerEditTemplate,
  getDefaultSamplingMaskLayer,
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
  const {
    defaultSymbols,
    edits,
    layers,
    layersInitialized,
    map,
    setAoiSketchLayer,
    setContamMapLayer,
    setDefaultSymbolSingle,
    setEdits,
    setLayers,
    contamMapLayer,
  } = useContext(SketchContext);

  const [addScenarioVisible, setAddScenarioVisible] = useState(false);
  const [editScenarioVisible, setEditScenarioVisible] = useState(false);
  const [stagingLayers, setStagingLayers] = useState<LayerType[]>([]);
  const [lastContamMapLayer, setLastContamMapLayer] =
    useState<LayerType | null>(null);

  useEffect(() => {
    if (!contamMapLayer) {
      setEditScenarioVisible(false);
      return;
    }

    const hasAoiGraphics =
      contamMapLayer?.sketchLayer?.type === 'graphics' &&
      contamMapLayer.sketchLayer.graphics.length > 0;
    if (!hasAoiGraphics) setEditScenarioVisible(true);
  }, [contamMapLayer]);

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
      contamMapLayer ||
      initializedLayer ||
      !initializedLayers ||
      !layersInitialized ||
      !map
    )
      return;

    setInitializedDeconLayer(true);

    if (stagingLayers.length > 0) {
      setContamMapLayer(stagingLayers[0]);
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

      setContamMapLayer(newAoiSketchLayer);

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
    setContamMapLayer,
    contamMapLayer,
    stagingLayers,
  ]);

  useEffect(() => {
    setAoiSketchLayer(contamMapLayer);
  }, [contamMapLayer, setAoiSketchLayer]);

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

    setLastContamMapLayer(contamMapLayer);
    setContamMapLayer(newAoiSketchLayer);

    const tLayers = [...layers];
    if (newAoiSketchLayer) tLayers.push(newAoiSketchLayer);

    // update layers (set parent layer)
    window.totsLayers = tLayers;
    setLayers(tLayers);

    // add the layer to the map
    if (newAoiSketchLayer.sketchLayer) map.add(newAoiSketchLayer.sketchLayer);
  }

  function handleDelete(lastDeconSketchLayer?: LayerType | null) {
    if (!contamMapLayer) return;

    const idsToDelete: string[] = [contamMapLayer.layerId];

    const newLayers = stagingLayers.filter(
      (layer) => contamMapLayer.layerId !== layer.layerId,
    );
    setStagingLayers(newLayers);
    if (lastDeconSketchLayer) setContamMapLayer(lastDeconSketchLayer);
    else setContamMapLayer(newLayers.length > 0 ? newLayers[0] : null);

    // remove all of the child layers
    setLayers((layers) => {
      return layers.filter((layer) => !idsToDelete.includes(layer.layerId));
    });

    // remove the scenario from edits
    const newEdits: EditsType = {
      count: edits.count + 1,
      edits: edits.edits.filter(
        (item) => item.layerId !== contamMapLayer.layerId,
      ),
    };
    setEdits(newEdits);

    if (!map) return;

    // remove the scenario from the map
    const mapLayer = map.layers.find(
      (layer) => layer.id === contamMapLayer?.layerId,
    );
    if (mapLayer) map.remove(mapLayer);
  }

  const stagingAreaEdits = edits.edits.find(
    (edit) =>
      edit.type === 'layer' &&
      edit.layerType === 'Contamination Map' &&
      edit.layerId === contamMapLayer?.layerId,
  ) as LayerEditsType | undefined;

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

        <div css={iconButtonContainerStyles}>
          <div css={verticalCenterTextStyles}>
            <label htmlFor="suitability-aoi-select-input">
              Active Contamination Area Layer
            </label>
          </div>
          <div css={layerButtonContainerStyles}>
            <div>
              {contamMapLayer && (
                <Fragment>
                  <button
                    css={iconButtonStyles}
                    title="Delete Layer"
                    onClick={() => handleDelete()}
                  >
                    <IconTrashAlt />
                    <span className="sr-only">Delete Layer</span>
                  </button>

                  {contamMapLayer.status !== 'published' && (
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
                    handleDelete(lastContamMapLayer);
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
          value={contamMapLayer}
          onChange={(ev) => setContamMapLayer(ev as LayerType)}
        />
      </div>

      {stagingAreaEdits && (
        <EditContaminationMapCharacterization
          aoiLayer={stagingAreaEdits}
          disabled={
            contamMapLayer?.sketchLayer?.type === 'graphics' &&
            contamMapLayer.sketchLayer.graphics.length === 0
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
            sketchLayer={contamMapLayer?.sketchLayer}
          />
        </EditContaminationMapCharacterization>
      )}
    </div>
  );
}

export default StagingAreas;
