/** @jsxImportSource @emotion/react */

import { Dispatch, ReactNode, SetStateAction, useContext } from 'react';
import { css } from '@emotion/react';
// components
import Select from 'components/Select';
//contexts
import { CalculateContext } from 'contexts/Calculate';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerAoiAnalysisEditsType } from 'types/Edits';

// --- styles ---
const labelContainerStyles = css`
  display: flex;
  justify-content: space-between;
`;

const layerSelectStyles = css`
  margin-bottom: 10px;
`;

const verticalCenterTextStyles = css`
  display: flex;
  align-items: center;
`;

type Props = {
  addScenarioVisible: boolean;
  deconLayers: LayerAoiAnalysisEditsType[];
  editScenarioVisible: boolean;
  extraLabelContent?: ReactNode;
  label: string;
  setAddScenarioVisible: Dispatch<SetStateAction<boolean>>;
  setNewDeconLayerName: Dispatch<SetStateAction<string>>;
  setDeconLayers: Dispatch<SetStateAction<LayerAoiAnalysisEditsType[]>>;
  setEditScenarioVisible: Dispatch<SetStateAction<boolean>>;
};

function AoiLayerSelect({
  addScenarioVisible,
  deconLayers,
  editScenarioVisible,
  extraLabelContent,
  label,
}: Props) {
  const { setCalculateResultsDecon } = useContext(CalculateContext);
  const {
    deconOperation,
    deconSketchLayer,
    selectedScenario,
    setDeconSketchLayer,
    setEdits,
  } = useContext(SketchContext);

  return (
    <div>
      <div css={labelContainerStyles}>
        <div css={verticalCenterTextStyles}>
          <label htmlFor="scenario-select-input">{label}</label>
        </div>
        {extraLabelContent}
      </div>
      <Select
        id="characterize-aoi-select-input-container"
        inputId="characterize-aoi-select-input"
        css={layerSelectStyles}
        isDisabled={addScenarioVisible || editScenarioVisible}
        options={deconLayers}
        value={deconSketchLayer}
        onChange={(ev) => {
          const newLayer = ev as LayerAoiAnalysisEditsType;
          setDeconSketchLayer(newLayer);

          setEdits((edits) => {
            return {
              count: edits.count + 1,
              edits: edits.edits.map((edit) => {
                if (
                  edit.type === 'layer-decon' &&
                  edit.layerId === deconOperation?.layerId
                ) {
                  return {
                    ...edit,
                    analysisLayerId: newLayer.layerId,
                    deconTechSelections: edit.deconTechSelections.map(
                      (tech) => {
                        const media = newLayer.aoiSummary.areaByMedia.find(
                          (a) => a.media === tech.media,
                        );

                        const pctAoi = media?.pctAoi ?? 0;
                        const surfaceArea = media?.surfaceArea ?? 0;

                        return {
                          ...tech,
                          pctAoi,
                          surfaceArea,
                        };
                      },
                    ),
                  };
                }

                return edit;
              }),
            };
          });

          if (selectedScenario?.type === 'scenario-decon') {
            setCalculateResultsDecon((calculateResultsDecon) => {
              return {
                status: 'fetching',
                panelOpen: calculateResultsDecon.panelOpen,
                data: null,
              };
            });
          }
        }}
      />
    </div>
  );
}

export default AoiLayerSelect;
