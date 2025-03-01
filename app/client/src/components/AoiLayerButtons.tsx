/** @jsxImportSource @emotion/react */

import { Dispatch, Fragment, SetStateAction, useContext } from 'react';
import { css } from '@emotion/react';
//contexts
import { CalculateContext } from 'contexts/Calculate';
import { SketchContext } from 'contexts/Sketch';
// types
import { EditsType, LayerAoiAnalysisEditsType } from 'types/Edits';
// utils
import { getScenariosDecon } from 'utils/sketchUtils';

// --- styles (Calculate) ---
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

type Props = {
  addScenarioVisible: boolean;
  deconLayers: LayerAoiAnalysisEditsType[];
  editScenarioVisible: boolean;
  setAddScenarioVisible: Dispatch<SetStateAction<boolean>>;
  setNewDeconLayerName: Dispatch<SetStateAction<string>>;
  setDeconLayers: Dispatch<SetStateAction<LayerAoiAnalysisEditsType[]>>;
  setEditScenarioVisible: Dispatch<SetStateAction<boolean>>;
};

function AoiLayerButtons({
  addScenarioVisible,
  deconLayers,
  editScenarioVisible,
  setAddScenarioVisible,
  setNewDeconLayerName,
  setDeconLayers,
  setEditScenarioVisible,
}: Props) {
  const { setCalculateResultsDecon } = useContext(CalculateContext);
  const {
    deconSketchLayer,
    edits,
    map,
    setDeconSketchLayer,
    setEdits,
    setLayers,
    setSelectedScenario,
  } = useContext(SketchContext);
  return (
    <div css={layerButtonContainerStyles}>
      <div>
        {deconSketchLayer && (
          <Fragment>
            <button
              css={iconButtonStyles}
              title="Delete Layer"
              onClick={() => {
                if (!deconSketchLayer) return;

                const idsToDelete: string[] = [deconSketchLayer.layerId];
                deconSketchLayer.layers.forEach((l) => {
                  idsToDelete.push(l.layerId);
                });

                const newDeconLayers = deconLayers.filter(
                  (layer) => !idsToDelete.includes(layer.layerId),
                );
                setDeconLayers(newDeconLayers);
                setDeconSketchLayer(
                  newDeconLayers.length > 0 ? newDeconLayers[0] : null,
                );

                // remove all of the child layers
                setLayers((layers) => {
                  return layers.filter(
                    (layer) => !idsToDelete.includes(layer.layerId),
                  );
                });

                // remove the scenario from edits
                const newEdits: EditsType = {
                  count: edits.count + 1,
                  edits: edits.edits.filter(
                    (item) => item.layerId !== deconSketchLayer.layerId,
                  ),
                };

                edits.edits.forEach((edit) => {
                  if (edit.type !== 'layer-decon') return;
                  if (!idsToDelete.includes(edit.analysisLayerId)) return;

                  edit.analysisLayerId = '';
                  edit.deconTechSelections = edit.deconTechSelections.map(
                    (tech) => {
                      return {
                        ...tech,
                        pctAoi: 0,
                        surfaceArea: 0,
                      };
                    },
                  );
                });

                setEdits(newEdits);

                // select the next available scenario
                const scenarios = getScenariosDecon(newEdits);
                setSelectedScenario(scenarios.length > 0 ? scenarios[0] : null);

                if (scenarios.length > 0) {
                  setCalculateResultsDecon((calculateResultsDecon) => {
                    return {
                      status: 'fetching',
                      panelOpen: calculateResultsDecon.panelOpen,
                      data: null,
                    };
                  });
                }

                if (!map) return;

                // make the new selection visible
                if (scenarios.length > 0) {
                  const newSelection = map.layers.find(
                    (layer) => layer.id === scenarios[0].layerId,
                  );
                  if (newSelection) newSelection.visible = true;
                }

                // remove the scenario from the map
                const mapLayer = map.layers.find(
                  (layer) => layer.id === deconSketchLayer.layerId,
                );
                map.remove(mapLayer);
              }}
            >
              <i className="fas fa-trash-alt" />
              <span className="sr-only">Delete Layer</span>
            </button>

            {deconSketchLayer.status !== 'published' && (
              <button
                css={iconButtonStyles}
                title={editScenarioVisible ? 'Cancel' : 'Edit Layer'}
                onClick={() => {
                  setAddScenarioVisible(false);
                  setEditScenarioVisible(!editScenarioVisible);
                }}
              >
                <i
                  className={
                    editScenarioVisible ? 'fas fa-times' : 'fas fa-edit'
                  }
                />
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
            if (!addScenarioVisible) setNewDeconLayerName('');
            setAddScenarioVisible(!addScenarioVisible);
          }}
        >
          <i className={addScenarioVisible ? 'fas fa-times' : 'fas fa-plus'} />
          <span className="sr-only">
            {addScenarioVisible ? 'Cancel' : 'Add Layer'}
          </span>
        </button>
      </div>
    </div>
  );
}

export default AoiLayerButtons;
