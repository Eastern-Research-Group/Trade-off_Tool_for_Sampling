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
import { EditSiteAssessmentPlan } from 'components/EditLayerMetaData';
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

function SiteAssessmentPlans() {
  const {
    aoiSketchVM,
    defaultSymbols,
    edits,
    layers,
    layersInitialized,
    map,
    setAoiSketchLayer,
    setDefaultSymbolSingle,
    setEdits,
    setLayers,
    setSiteAssessmentPlanLayer,
    siteAssessmentPlanLayer,
  } = useContext(SketchContext);

  const [addScenarioVisible, setAddScenarioVisible] = useState(false);
  const [editScenarioVisible, setEditScenarioVisible] = useState(false);
  const [siteAssessmentPlanLayers, setSiteAssessmentPlanLayers] = useState<
    LayerType[]
  >([]);
  const [lastSiteAssessmentPlanLayer, setLastSiteAssessmentPlanLayer] =
    useState<LayerType | null>(null);

  useEffect(() => {
    if (!siteAssessmentPlanLayer) {
      setEditScenarioVisible(false);
      return;
    }

    const hasAoiGraphics =
      siteAssessmentPlanLayer?.sketchLayer?.type === 'graphics' &&
      siteAssessmentPlanLayer.sketchLayer.graphics.length > 0;
    if (!hasAoiGraphics) setEditScenarioVisible(true);
  }, [siteAssessmentPlanLayer]);

  const [lastAoiSketchLayer, setLastAoiSketchLayer] =
    useState<__esri.GraphicsLayer | null>(null);
  useEffect(() => {
    if (!aoiSketchVM) return;

    aoiSketchVM.polygonSymbol = defaultSymbols.symbols[
      'Site Conceptual Model Mask'
    ] as any;

    const siteAssessmentPlanLayerEdit = edits.edits.find(
      (item) =>
        item.type === 'layer' &&
        item.layerType === 'Site Conceptual Model Mask' &&
        item.layerId === siteAssessmentPlanLayer?.layerId,
    ) as LayerEditsType | undefined;
    if (!siteAssessmentPlanLayerEdit) return;

    const sketchLayer = layers.find(
      (l) =>
        l.layerType === 'Site Conceptual Model Mask' &&
        l.layerId === siteAssessmentPlanLayerEdit.layerId,
    );
    if (
      sketchLayer &&
      sketchLayer?.sketchLayer?.id !== aoiSketchVM?.layer?.id
    ) {
      setLastAoiSketchLayer(aoiSketchVM.layer);
      aoiSketchVM.layer = sketchLayer.sketchLayer as __esri.GraphicsLayer;
      aoiSketchVM.layer.elevationInfo = { mode: 'on-the-ground' };
    }

    return function cleanup() {
      if (lastAoiSketchLayer) aoiSketchVM.layer = lastAoiSketchLayer;
    };
  }, [
    aoiSketchVM,
    defaultSymbols,
    edits,
    lastAoiSketchLayer,
    layers,
    siteAssessmentPlanLayer,
  ]);

  const [initializedLayers, setInitializedLayers] = useState(false);
  useEffect(() => {
    if (!layersInitialized) return;

    const newLayers: LayerType[] = [];
    layers.forEach((layer) => {
      if (layer.layerType === 'Site Conceptual Model Mask')
        newLayers.push(layer);
    });
    setSiteAssessmentPlanLayers(newLayers);
    setInitializedLayers(true);
  }, [edits, layers, layersInitialized]);

  const [initializedLayer, setInitializedDeconLayer] = useState(false);
  useEffect(() => {
    if (
      siteAssessmentPlanLayer ||
      initializedLayer ||
      !initializedLayers ||
      !layersInitialized ||
      !map
    )
      return;

    setInitializedDeconLayer(true);

    if (siteAssessmentPlanLayers.length > 0) {
      setSiteAssessmentPlanLayer(siteAssessmentPlanLayers[0]);
    } else {
      const newAoiSketchLayer = getDefaultSamplingMaskLayer(
        '',
        'Site Conceptual Model Mask',
        'Site Conceptual Model Mask',
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

      setSiteAssessmentPlanLayer(newAoiSketchLayer);

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
    setSiteAssessmentPlanLayer,
    siteAssessmentPlanLayer,
    siteAssessmentPlanLayers,
  ]);

  useEffect(() => {
    setAoiSketchLayer(siteAssessmentPlanLayer);
  }, [siteAssessmentPlanLayer, setAoiSketchLayer]);

  function handleAdd() {
    if (!map) return;

    const newAoiSketchLayer = getDefaultSamplingMaskLayer(
      '',
      'Site Conceptual Model Mask',
      'Site Conceptual Model Mask',
      true,
    );
    const newAoiEdits = createLayerEditTemplate(newAoiSketchLayer, 'add');
    newAoiEdits.description = '';
    newAoiEdits.listMode = 'show';

    // make a copy of the edits context variable
    setEdits((edits) => {
      return {
        count: edits.count + 1,
        edits: [...edits.edits, newAoiEdits],
      };
    });

    setLastSiteAssessmentPlanLayer(siteAssessmentPlanLayer);
    setSiteAssessmentPlanLayer(newAoiSketchLayer);

    const tLayers = [...layers];
    if (newAoiSketchLayer) tLayers.push(newAoiSketchLayer);

    // update layers (set parent layer)
    window.totsLayers = tLayers;
    setLayers(tLayers);

    // add the layer to the map
    if (newAoiSketchLayer.sketchLayer) map.add(newAoiSketchLayer.sketchLayer);
  }

  function handleDelete(lastSiteAssessmentPlanLayer?: LayerType | null) {
    if (!siteAssessmentPlanLayer) return;

    const idsToDelete: string[] = [siteAssessmentPlanLayer.layerId];

    const newLayers = siteAssessmentPlanLayers.filter(
      (layer) => siteAssessmentPlanLayer.layerId !== layer.layerId,
    );
    setSiteAssessmentPlanLayers(newLayers);
    if (lastSiteAssessmentPlanLayer)
      setSiteAssessmentPlanLayer(lastSiteAssessmentPlanLayer);
    else setSiteAssessmentPlanLayer(newLayers.length > 0 ? newLayers[0] : null);

    // remove all of the child layers
    setLayers((layers) => {
      return layers.filter((layer) => !idsToDelete.includes(layer.layerId));
    });

    // remove the scenario from edits
    const newEdits: EditsType = {
      count: edits.count + 1,
      edits: edits.edits.filter(
        (item) => item.layerId !== siteAssessmentPlanLayer.layerId,
      ),
    };
    setEdits(newEdits);

    if (!map) return;

    // remove the scenario from the map
    const mapLayer = map.layers.find(
      (layer) => layer.id === siteAssessmentPlanLayer?.layerId,
    );
    if (mapLayer) map.remove(mapLayer);
  }

  const siteAssessmentPlanEdits = edits.edits.find(
    (edit) =>
      edit.type === 'layer' &&
      edit.layerType === 'Site Conceptual Model Mask' &&
      edit.layerId === siteAssessmentPlanLayer?.layerId,
  ) as LayerEditsType | undefined;

  return (
    <div>
      <div css={layerSectionStyles}>
        <ColorPicker
          title="Default Site Conceptual Model Symbology"
          symbol={defaultSymbols.symbols['Site Conceptual Model Mask']}
          onChange={(symbol: PolygonSymbol) => {
            setDefaultSymbolSingle('Site Conceptual Model Mask', symbol);
          }}
        />

        <p>Placeholder...</p>

        <div css={iconButtonContainerStyles}>
          <div css={verticalCenterTextStyles}>
            <label htmlFor="suitability-aoi-select-input">
              Active Site Conceptual Model Layer
            </label>
          </div>
          <div css={layerButtonContainerStyles}>
            <div>
              {siteAssessmentPlanLayer && (
                <Fragment>
                  <button
                    css={iconButtonStyles}
                    title="Delete Layer"
                    onClick={() => handleDelete()}
                  >
                    <IconTrashAlt />
                    <span className="sr-only">Delete Layer</span>
                  </button>

                  {siteAssessmentPlanLayer.status !== 'published' && (
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
                    handleDelete(lastSiteAssessmentPlanLayer);
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
          options={siteAssessmentPlanLayers}
          value={siteAssessmentPlanLayer}
          onChange={(ev) => {
            setSiteAssessmentPlanLayer(ev as LayerType);

            layers.forEach((layer) => {
              if (
                layer.layerType === 'Site Conceptual Model Mask' &&
                layer.sketchLayer?.type === 'graphics'
              ) {
                layer.sketchLayer.visible =
                  layer.uuid === (ev as LayerType)?.uuid;
              }
            });
          }}
        />
      </div>

      {siteAssessmentPlanEdits && (
        <EditSiteAssessmentPlan
          aoiLayer={siteAssessmentPlanEdits}
          disabled={
            siteAssessmentPlanLayer?.sketchLayer?.type === 'graphics' &&
            siteAssessmentPlanLayer.sketchLayer.graphics.length === 0
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
            label="Draw Contamination AOI Boundary"
            onContinue={() => {
              // TODO
            }}
            replaceGraphics={false}
            sketchLayer={siteAssessmentPlanLayer?.sketchLayer}
          />
        </EditSiteAssessmentPlan>
      )}
    </div>
  );
}

export default SiteAssessmentPlans;
