/** @jsxImportSource @emotion/react */

import {
  Dispatch,
  Fragment,
  SetStateAction,
  useContext,
  useState,
} from 'react';
import { css } from '@emotion/react';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { SketchContext } from 'contexts/Sketch';
// styles
import { colors } from 'styles';
// types
import { LayerDeconEditsType, LayerAoiAnalysisEditsType } from 'types/Edits';
import { AppType } from 'types/Navigation';
// utils
import { createScenarioDeconLayer, updateLayerEdits } from 'utils/sketchUtils';

// --- styles ---
const inputStyles = css`
  width: 100%;
  height: 36px;
  margin: 0 0 10px 0;
  padding-left: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const saveButtonContainerStyles = css`
  display: flex;
  justify-content: flex-end;
`;

const saveButtonStyles = (status: string) => {
  let backgroundColor = '';
  if (status === 'success') {
    backgroundColor = `background-color: ${colors.green()};`;
  }
  if (status === 'failure' || status === 'name-not-available') {
    backgroundColor = `background-color: ${colors.red()};`;
  }

  return css`
    margin: 5px 0;
    ${backgroundColor}

    &:disabled {
      cursor: default;
      opacity: 0.65;
    }
  `;
};

// --- types ---
type SaveStatusType =
  | 'none'
  | 'changes'
  | 'fetching'
  | 'success'
  | 'failure'
  | 'fetch-failure'
  | 'name-not-available';

// --- components ---
type Props = {
  addScenarioVisible: boolean;
  appType: AppType;
  editScenarioVisible: boolean;
  newDeconLayerName: string;
  setAddScenarioVisible: Dispatch<SetStateAction<boolean>>;
  setDeconLayers: Dispatch<SetStateAction<LayerAoiAnalysisEditsType[]>>;
  setEditScenarioVisible: Dispatch<SetStateAction<boolean>>;
  setNewDeconLayerName: Dispatch<SetStateAction<string>>;
};

function AoiLayerEdit({
  addScenarioVisible,
  appType,
  editScenarioVisible,
  newDeconLayerName,
  setAddScenarioVisible,
  setDeconLayers,
  setEditScenarioVisible,
  setNewDeconLayerName,
}: Props) {
  const { setCalculateResultsDecon } = useContext(CalculateContext);
  const {
    deconOperation,
    deconSketchLayer,
    defaultDeconSelections,
    edits,
    layers,
    map,
    selectedScenario,
    setDeconSketchLayer,
    setEdits,
    setLayers,
  } = useContext(SketchContext);

  const [saveStatus, setSaveStatus] = useState<SaveStatusType>('none');

  // Saves the scenario name and description to the layer and edits objects.
  const handleSave = () => {
    if (!map) return;

    const layer = layers.find((l) => l.layerId === deconSketchLayer?.layerId);
    if (deconSketchLayer && layer && editScenarioVisible) {
      // update title on layer
      if (layer.sketchLayer) layer.sketchLayer.title = newDeconLayerName;

      // update selected decon layer
      setDeconSketchLayer((layer) => {
        if (!layer) return null;
        return {
          ...layer,
          name: newDeconLayerName,
          label: newDeconLayerName,
        };
      });

      setDeconLayers((deconLayers) => {
        return deconLayers.map((layer) => {
          if (layer.layerId === deconSketchLayer.layerId) {
            return {
              ...layer,
              name: newDeconLayerName,
              label: newDeconLayerName,
            };
          }
          return layer;
        });
      });

      // update the layer in edits and the decisionunit attribute for each graphic
      const editsCopy = updateLayerEdits({
        appType,
        edits,
        layer: { ...layer, name: newDeconLayerName, label: newDeconLayerName },
        type: 'update',
      });
      setEdits(editsCopy);
    } else {
      const {
        layers: newLayers,
        groupLayer,
        layerAoiAnalysis,
        sketchLayer,
        tempAssessedAoiLayer,
        tempImageAnalysisLayer,
        tempCharacterizeAoiLayer,
      } = createScenarioDeconLayer(defaultDeconSelections, newDeconLayerName);

      // make a copy of the edits context variable
      setEdits((edits) => {
        const newEdits = edits.edits.filter((edit) => {
          const idx = newLayers.findIndex((l) => l.layerId === edit.layerId);

          return idx === -1;
        });

        const selectedOp = edits.edits.find(
          (edit) =>
            edit.type === 'layer-decon' &&
            edit.layerId === deconOperation?.layerId,
        ) as LayerDeconEditsType | undefined;
        if (selectedOp) {
          selectedOp.analysisLayerId = layerAoiAnalysis.layerId;
          selectedOp.deconTechSelections = selectedOp.deconTechSelections.map(
            (tech) => {
              return {
                ...tech,
                pctAoi: 0,
                surfaceArea: 0,
              };
            },
          );
        }

        return {
          count: edits.count + 1,
          edits: [...newEdits, layerAoiAnalysis],
        };
      });

      setDeconSketchLayer(layerAoiAnalysis);

      const tLayers = [...layers];
      if (tempCharacterizeAoiLayer) tLayers.push(tempCharacterizeAoiLayer);
      if (sketchLayer) tLayers.push(sketchLayer);
      if (tempImageAnalysisLayer) tLayers.push(tempImageAnalysisLayer);
      if (tempAssessedAoiLayer) tLayers.push(tempAssessedAoiLayer);

      // update layers (set parent layer)
      window.totsLayers = tLayers;
      setLayers(tLayers);

      if (selectedScenario?.type === 'scenario-decon') {
        setCalculateResultsDecon((calculateResultsDecon) => {
          return {
            status: 'fetching',
            panelOpen: calculateResultsDecon.panelOpen,
            data: null,
          };
        });
      }

      // add the scenario group layer to the map
      map.add(groupLayer);
    }

    setAddScenarioVisible(false);
    setEditScenarioVisible(false);
    setSaveStatus('success');
  };

  if (!addScenarioVisible && !editScenarioVisible) return null;

  return (
    <div>
      <label>
        <span>Decon Layer Name</span>
        <input
          type="text"
          css={inputStyles}
          maxLength={250}
          placeholder="Enter decon Layer Name"
          value={newDeconLayerName}
          onChange={(ev) => {
            setNewDeconLayerName(ev.target.value);
            setSaveStatus('changes');
          }}
        />
      </label>

      <div css={saveButtonContainerStyles}>
        <button
          css={saveButtonStyles(saveStatus)}
          type="submit"
          disabled={
            saveStatus === 'none' ||
            saveStatus === 'success' ||
            !newDeconLayerName ||
            newDeconLayerName === deconSketchLayer?.name
          }
          onClick={handleSave}
        >
          {(saveStatus === 'none' || saveStatus === 'changes') && 'Save'}
          {saveStatus === 'success' && (
            <Fragment>
              <i className="fas fa-check" /> Saved
            </Fragment>
          )}
        </button>
      </div>
    </div>
  );
}

export default AoiLayerEdit;
