/** @jsxImportSource @emotion/react */

import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { css } from '@emotion/react';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import CharacterizeAOI, { SaveStatusType } from 'components/CharacterizeAOI';
import { EditScenario } from 'components/EditLayerMetaData';
import LoadingSpinner from 'components/LoadingSpinner';
import MessageBox from 'components/MessageBox';
import NavigationButton from 'components/NavigationButton';
import { ReactTableEditable } from 'components/ReactTable';
import Select from 'components/Select';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext, hazardousOptions } from 'contexts/Sketch';
// types
import {
  EditsType,
  LayerAoiAnalysisEditsType,
  LayerDeconEditsType,
  ScenarioDeconEditsType,
} from 'types/Edits';
import { LayerType } from 'types/Layer';
import { AppType } from 'types/Navigation';
// utils
import { useStartOver } from 'utils/hooks';
import {
  deepCopyObject,
  findLayerInEdits,
  generateUUID,
  getNextScenarioLayer,
  getScenariosDecon,
  updateLayerEdits,
} from 'utils/sketchUtils';
import { formatNumber, getNewName, getScenarioName } from 'utils/utils';
// styles
import { colors, reactSelectStyles } from 'styles';
import { DialogContent, DialogOverlay } from '@reach/dialog';

type ShapeTypeSelect = {
  value: string;
  label: string;
};

const pointStyles: ShapeTypeSelect[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'cross', label: 'Cross' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'x', label: 'X' },
  {
    value:
      'path|M17.14 3 8.86 3 3 8.86 3 17.14 8.86 23 17.14 23 23 17.14 23 8.86 17.14 3z',
    label: 'Octagon',
  },
];

// --- styles (CreateDeconPlan) ---
const panelContainer = css`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;

  .sketch-button-selected {
    background-color: #e7f6f8;
  }

  .sketch-button-selected > div {
    border: 2px solid #01bde3;
  }
`;

const sectionContainer = css`
  padding: 20px;
`;

const layerSelectStyles = css`
  margin-bottom: 10px;
`;

const inlineMenuStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const addButtonStyles = css`
  margin: 0;
  height: 38px; /* same height as ReactSelect */
`;

const submitButtonStyles = css`
  margin-top: 10px;
`;

const headerContainer = css`
  display: flex;
  align-items: center;
  justify-content: space-evenly;
`;

const headerStyles = css`
  margin: 0;
  padding: 0;
`;

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
`;

const deleteButtonStyles = css`
  width: 125px;
  margin-bottom: 0;
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

const lineSeparatorStyles = css`
  border-bottom: 1px solid #d8dfe2;
`;

const verticalCenterTextStyles = css`
  display: flex;
  align-items: center;
`;

const fullWidthSelectStyles = css`
  width: 100%;
  margin-right: 10px;
`;

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

// --- components (CreateDeconPlan) ---
type Props = {
  appType: AppType;
};

function CreateDeconPlan({ appType }: Props) {
  const { contaminationMap, setContaminationMap } =
    useContext(CalculateContext);
  const { setGoTo, setGoToOptions, trainingMode } =
    useContext(NavigationContext);
  const {
    deconOperation,
    deconSketchLayer,
    defaultDeconSelections,
    edits,
    setEdits,
    layersInitialized,
    layers,
    setLayers,
    map,
    selectedScenario,
    setDeconOperation,
    setDeconSketchLayer,
    setSelectedScenario,
    sketchLayer,
    setSketchLayer,
    sketchVM,
    setAoiData,
  } = useContext(SketchContext);
  const startOver = useStartOver();

  useEffect(() => {
    if (!selectedScenario || selectedScenario.type !== 'scenario-decon') return;

    if (selectedScenario.linkedLayerIds.length === 0) {
      setDeconOperation(null);
      return;
    }

    const firstId = selectedScenario.linkedLayerIds[0] ?? null;
    const firstLayer = layers.find((l) => l.layerId === firstId);
    setDeconOperation(firstLayer ?? null);
  }, [selectedScenario]);

  // Sets the sketchLayer to the first layer in the layer selection drop down,
  // if available. If the drop down is empty, an empty sketchLayer will be
  // created.
  const [
    sketchLayerInitialized,
    setSketchLayerInitialized, //
  ] = useState(false);
  useEffect(() => {
    if (!map || !layersInitialized || sketchLayerInitialized) return;

    setSketchLayerInitialized(true);

    const { nextScenario, nextLayer } = getNextScenarioLayer(
      edits,
      layers,
      selectedScenario,
      sketchLayer,
    );

    if (nextScenario) setSelectedScenario(nextScenario);
    if (nextLayer) setSketchLayer(nextLayer);
  }, [
    edits,
    layersInitialized,
    layers,
    setLayers,
    map,
    selectedScenario,
    setSelectedScenario,
    sketchLayer,
    setSketchLayer,
    sketchLayerInitialized,
  ]);

  useEffect(() => {
    if (!deconOperation) {
      setDeconSketchLayer(null);
      return;
    }

    const deconLayer = edits.edits.find(
      (edit) =>
        edit.type === 'layer-decon' && edit.layerId === deconOperation.layerId,
    ) as LayerDeconEditsType;
    if (!deconLayer?.analysisLayerId) {
      setDeconSketchLayer(null);
      return;
    }

    const layer = edits.edits.find(
      (edit) =>
        edit.layerType === 'AOI Analysis' &&
        edit.layerId === deconLayer.analysisLayerId,
    ) as LayerAoiAnalysisEditsType;
    setDeconSketchLayer(layer ?? null);
  }, [deconOperation]);

  // TODO - see if this should be brought back
  // // Changes the selected layer if the scenario is changed. The first
  // // available layer in the scenario will be chosen. If the scenario
  // // has no layers, then the first availble unlinked layer is chosen.
  // useEffect(() => {
  //   if (!selectedScenario || selectedScenario.type !== 'scenario-decon') return;
  //   if (
  //     sketchLayer &&
  //     (!sketchLayer.parentLayer ||
  //       sketchLayer.parentLayer.id === selectedScenario.layerId)
  //   ) {
  //     return;
  //   }

  //   // select the first layer within the selected scenario
  //   if (selectedScenario.layers.length > 0) {
  //     const deconLayer = selectedScenario.layers.find(
  //       (l) => l.layerType === 'Samples',
  //     );
  //     const newSketchLayer = layers.find(
  //       (layer) =>
  //         (deconLayer && layer.layerId === deconLayer.layerId) ||
  //         (!deconLayer && layer.layerId === selectedScenario.layers[0].layerId),
  //     );
  //     if (newSketchLayer) {
  //       setSketchLayer(newSketchLayer);
  //       return;
  //     }
  //   }

  //   // select the first unlinked layer
  //   const newSketchLayer = layers.find(
  //     (layer) =>
  //       (layer.layerType === 'Samples' || layer.layerType === 'VSP') &&
  //       !layer.parentLayer,
  //   );
  //   if (newSketchLayer) setSketchLayer(newSketchLayer);
  //   else setSketchLayer(null);
  // }, [layers, selectedScenario, sketchLayer, setSketchLayer]);

  // scenario and layer edit UI visibility controls
  const [addOperationVisible, setAddOperationVisible] = useState(false);
  const [editOperationVisible, setEditOperationVisible] = useState(false);
  const [addPlanVisible, setAddPlanVisible] = useState(false);
  const [editPlanVisible, setEditPlanVisible] = useState(false);
  const [newDeconOperationName, setNewDeconOperationName] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatusType>('none');

  // get a list of scenarios from edits
  const scenarios = getScenariosDecon(edits);

  const deconLayersAll = layers.filter((e) => e.layerType === 'Decon');

  // build the list of layers to be displayed in the sample layer dropdown
  const deconLayers: { label: string; options: LayerType[] }[] = [];
  if (
    selectedScenario?.type === 'scenario-decon' &&
    selectedScenario?.linkedLayerIds?.length > 0
  ) {
    const linkedDeconLayers = deconLayersAll.filter((d) =>
      selectedScenario.linkedLayerIds.includes(d.layerId),
    );
    // get layers for the selected scenario
    deconLayers.push({
      label: selectedScenario.label,
      options: linkedDeconLayers,
    });

    const linkedIds: string[] = [];
    edits.edits.forEach((edit) => {
      if (edit.type === 'scenario-decon') {
        linkedIds.push(...edit.linkedLayerIds);
      }
    });

    const unLinkedDeconLayers = deconLayersAll.filter(
      (d) => !linkedIds.includes(d.layerId),
    );
    // get unlinked layers
    deconLayers.push({
      label: 'Unlinked Operations',
      options: unLinkedDeconLayers,
    });
  }

  pointStyles.sort((a, b) => a.value.localeCompare(b.value));

  const [deconTechPopupOpen, setDeconTechPopupOpen] = useState(false);

  const isLinked =
    selectedScenario?.type === 'scenario-decon' &&
    selectedScenario?.linkedLayerIds.length > 0 &&
    selectedScenario.linkedLayerIds.findIndex(
      (id) => id === deconOperation?.layerId,
    ) > -1;

  return (
    <div css={panelContainer}>
      <div>
        <div css={sectionContainer}>
          <h2 css={headerStyles}>Create Decon Plan</h2>
          <div css={headerContainer}>
            <button css={deleteButtonStyles} onClick={startOver}>
              <i className="fas fa-redo-alt" />
              <br />
              Start Over
            </button>
            <button
              css={deleteButtonStyles}
              onClick={() => {
                if (!sketchVM || !sketchLayer) return;

                let editsCopy: EditsType = edits;

                // TODO fix this and make sure it does everything it should

                // Figure out what to add graphics to
                const aoiAssessed = selectedScenario?.layers.find(
                  (l) => l.layerType === 'AOI Assessed',
                );
                if (aoiAssessed) {
                  const aoiAssessedLayer = layers.find(
                    (l) => l.layerId === aoiAssessed.layerId,
                  );
                  if (aoiAssessedLayer?.sketchLayer?.type === 'graphics') {
                    editsCopy = updateLayerEdits({
                      appType: 'decon',
                      edits,
                      scenario: selectedScenario,
                      layer: aoiAssessedLayer,
                      type: 'delete',
                      changes: aoiAssessedLayer.sketchLayer.graphics,
                    });

                    aoiAssessedLayer.sketchLayer.graphics.removeAll();
                  }
                }

                // Figure out what to add graphics to
                const imageAnalysis = selectedScenario?.layers.find(
                  (l) => l.layerType === 'Image Analysis',
                );
                if (imageAnalysis) {
                  const imageAnalysisLayer = layers.find(
                    (l) => l.layerId === imageAnalysis.layerId,
                  );
                  if (imageAnalysisLayer?.sketchLayer?.type === 'graphics') {
                    editsCopy = updateLayerEdits({
                      appType: 'decon',
                      edits,
                      scenario: selectedScenario,
                      layer: imageAnalysisLayer,
                      type: 'delete',
                      changes: imageAnalysisLayer.sketchLayer.graphics,
                    });

                    imageAnalysisLayer.sketchLayer.graphics.removeAll();
                  }
                }

                // Figure out what to add graphics to
                const aoi = selectedScenario?.layers.find(
                  (l) => l.layerType === 'Samples',
                );
                if (aoi) {
                  const aoiLayer = layers.find(
                    (l) => l.layerId === aoi.layerId,
                  );
                  if (aoiLayer?.sketchLayer?.type === 'graphics') {
                    editsCopy = updateLayerEdits({
                      appType: 'decon',
                      edits,
                      scenario: selectedScenario,
                      layer: aoiLayer,
                      type: 'delete',
                      changes: aoiLayer.sketchLayer.graphics,
                    });

                    aoiLayer.sketchLayer.graphics.removeAll();
                    aoiLayer.sketchLayer.visible = true;
                  }
                }

                setEdits(editsCopy);
                setAoiData((aoiData) => {
                  return {
                    count: aoiData.count + 1,
                    graphics: {},
                  };
                });
              }}
            >
              <i className="fas fa-trash-alt" />
              <br />
              Delete All Results
            </button>
          </div>
        </div>
        <div css={lineSeparatorStyles} />
        <div css={sectionContainer}>
          {selectedScenario ? (
            <p></p>
          ) : (
            <Fragment>
              <p>
                Create a decontamination plan. Enter a plan name and description
                and click Save.
              </p>
              <MessageBox
                severity="warning"
                title=""
                message="Note: Your work in TODS only persists as long as your current browser session. Be sure to download results and/or publish your plan to retain a copy of your work."
              />
            </Fragment>
          )}

          {scenarios.length === 0 ? (
            <EditScenario
              appType="decon"
              onSave={() => setEditPlanVisible(false)}
            />
          ) : (
            <Fragment>
              <div css={iconButtonContainerStyles}>
                <div css={verticalCenterTextStyles}>
                  <label htmlFor="scenario-select-input">Specify Plan</label>
                </div>
                <div>
                  {selectedScenario && (
                    <Fragment>
                      <button
                        css={iconButtonStyles}
                        title="Delete Plan"
                        onClick={() => {
                          // remove all of the child layers
                          setLayers((layers) => {
                            return layers.filter(
                              (layer) =>
                                layer.layerId !== selectedScenario.layerId,
                            );
                          });

                          // remove the scenario from edits
                          const newEdits: EditsType = {
                            count: edits.count + 1,
                            edits: edits.edits.filter(
                              (item) =>
                                item.layerId !== selectedScenario.layerId,
                            ),
                          };
                          setEdits(newEdits);

                          // select the next available scenario
                          const scenarios = getScenariosDecon(newEdits);
                          setSelectedScenario(
                            scenarios.length > 0 ? scenarios[0] : null,
                          );

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
                            (layer) => layer.id === selectedScenario.layerId,
                          );
                          map.remove(mapLayer);
                        }}
                      >
                        <i className="fas fa-trash-alt" />
                        <span className="sr-only">Delete Plan</span>
                      </button>
                      <button
                        css={iconButtonStyles}
                        title="Clone Plan"
                        onClick={(ev) => {
                          // get the name for the new layer
                          const newScenarioName = getScenarioName(
                            edits,
                            selectedScenario.label,
                          );

                          // get the edits from the selected scenario
                          const selectedScenarioEdits = findLayerInEdits(
                            edits.edits,
                            selectedScenario.layerId,
                          ).editsScenario;
                          if (!selectedScenarioEdits) return;

                          // copy the edits for that scenario
                          const copiedScenario: ScenarioDeconEditsType =
                            deepCopyObject(selectedScenarioEdits);

                          // update the name and id for the copied scenario
                          const uuid = generateUUID();
                          copiedScenario.addedFrom = 'sketch';
                          copiedScenario.editType = 'add';
                          copiedScenario.id = -1;
                          copiedScenario.label = newScenarioName;
                          copiedScenario.layerId = uuid;
                          copiedScenario.name = newScenarioName;
                          copiedScenario.portalId = '';
                          copiedScenario.scenarioName = newScenarioName;
                          copiedScenario.status = 'added';
                          copiedScenario.value = uuid;

                          const fullCopyEdits: EditsType =
                            deepCopyObject(edits);
                          fullCopyEdits.edits.push(copiedScenario);

                          setEdits(fullCopyEdits);

                          setSelectedScenario(copiedScenario);
                        }}
                      >
                        <i className="fas fa-clone" />
                        <span className="sr-only">Clone Plan</span>
                      </button>
                      {selectedScenario.status !== 'published' && (
                        <button
                          css={iconButtonStyles}
                          title={editPlanVisible ? 'Cancel' : 'Edit Plan'}
                          onClick={() => {
                            setEditPlanVisible(!editPlanVisible);
                          }}
                        >
                          <i
                            className={
                              editPlanVisible ? 'fas fa-times' : 'fas fa-edit'
                            }
                          />
                          <span className="sr-only">
                            {editPlanVisible ? 'Cancel' : 'Edit Plan'}
                          </span>
                        </button>
                      )}
                    </Fragment>
                  )}
                  <button
                    css={iconButtonStyles}
                    title={addPlanVisible ? 'Cancel' : 'Add Plan'}
                    onClick={() => {
                      setEditPlanVisible(false);
                      setAddPlanVisible(!addPlanVisible);
                    }}
                  >
                    <i
                      className={
                        addPlanVisible ? 'fas fa-times' : 'fas fa-plus'
                      }
                    />
                    <span className="sr-only">
                      {addPlanVisible ? 'Cancel' : 'Add Plan'}
                    </span>
                  </button>
                </div>
              </div>
              <Select
                id="scenario-select-input-container"
                inputId="scenario-select-input"
                css={layerSelectStyles}
                isDisabled={addPlanVisible || editPlanVisible}
                value={selectedScenario}
                onChange={(ev) => {
                  const newScenario = ev as ScenarioDeconEditsType;
                  setSelectedScenario(newScenario);

                  // TODO look into bringing this back
                  // // update the visiblity of layers
                  // layers.forEach((layer) => {
                  //   if (layer.parentLayer) {
                  //     layer.parentLayer.visible =
                  //       layer.parentLayer.id === newScenario.layerId
                  //         ? true
                  //         : false;
                  //     return;
                  //   }

                  //   if (
                  //     layer.layerType === 'Samples' ||
                  //     layer.layerType === 'VSP'
                  //   ) {
                  //     layer.sketchLayer.visible = false;
                  //   }
                  // });

                  setEdits((edits) => ({
                    count: edits.count + 1,
                    edits: edits.edits.map((edit) => {
                      let visible = edit.visible;

                      if (edit.type === 'scenario-decon') {
                        visible =
                          edit.layerId === newScenario.layerId ? true : false;
                      }
                      if (edit.type === 'layer-aoi-analysis') {
                        visible = false;
                      }

                      return {
                        ...edit,
                        visible,
                      };
                    }),
                  }));
                }}
                options={scenarios}
              />
              {(addPlanVisible || editPlanVisible) && (
                <EditScenario
                  appType="decon"
                  initialScenario={editPlanVisible ? selectedScenario : null}
                  onSave={() => {
                    setAddPlanVisible(false);
                    setEditPlanVisible(false);
                  }}
                />
              )}
            </Fragment>
          )}

          {selectedScenario && (
            <Fragment>
              <div>
                <div css={iconButtonContainerStyles}>
                  <div css={verticalCenterTextStyles}>
                    <label htmlFor="scenario-select-input">
                      Decon Operation
                    </label>
                  </div>
                  <div css={layerButtonContainerStyles}>
                    <div>
                      {deconOperation && (
                        <Fragment>
                          {isLinked ? (
                            <button
                              css={iconButtonStyles}
                              title="Unlink Operation"
                              onClick={() => {
                                if (!map || !selectedScenario) return;

                                const editsCopy: EditsType =
                                  deepCopyObject(edits);
                                const scenario = editsCopy.edits.find(
                                  (edit) =>
                                    edit.layerId === selectedScenario.layerId,
                                );
                                if (
                                  !scenario ||
                                  scenario.type !== 'scenario-decon'
                                )
                                  return;

                                scenario.linkedLayerIds =
                                  scenario.linkedLayerIds.filter(
                                    (id) => id !== deconOperation.layerId,
                                  );
                                setEdits({
                                  count: editsCopy.count + 1,
                                  edits: editsCopy.edits,
                                });

                                setSelectedScenario((selectedScenario) => {
                                  if (
                                    !selectedScenario ||
                                    selectedScenario.type !== 'scenario-decon'
                                  )
                                    return selectedScenario;

                                  return {
                                    ...selectedScenario,
                                    linkedLayerIds:
                                      selectedScenario.linkedLayerIds.filter(
                                        (id) => id !== deconOperation.layerId,
                                      ),
                                  };
                                });
                              }}
                            >
                              <i className="fas fa-unlink" />
                              <span className="sr-only">Unlink Operation</span>
                            </button>
                          ) : (
                            <button
                              css={iconButtonStyles}
                              title="Link Operation"
                              onClick={() => {
                                if (!map || !selectedScenario) return;

                                const editsCopy: EditsType =
                                  deepCopyObject(edits);
                                const scenario = editsCopy.edits.find(
                                  (edit) =>
                                    edit.layerId === selectedScenario.layerId,
                                );
                                if (
                                  !scenario ||
                                  scenario.type !== 'scenario-decon'
                                )
                                  return;

                                scenario.linkedLayerIds.push(
                                  deconOperation.layerId,
                                );
                                setEdits({
                                  count: editsCopy.count + 1,
                                  edits: editsCopy.edits,
                                });

                                setSelectedScenario((selectedScenario) => {
                                  if (
                                    !selectedScenario ||
                                    selectedScenario.type !== 'scenario-decon'
                                  )
                                    return selectedScenario;

                                  return {
                                    ...selectedScenario,
                                    linkedLayerIds: [
                                      ...selectedScenario.linkedLayerIds,
                                      deconOperation.layerId,
                                    ],
                                  };
                                });
                              }}
                            >
                              <i className="fas fa-link" />
                              <span className="sr-only">Link Operation</span>
                            </button>
                          )}
                          <button
                            css={iconButtonStyles}
                            title="Delete Operation"
                            onClick={() => {
                              const linkedLayerIds =
                                selectedScenario.type === 'scenario-decon'
                                  ? selectedScenario.linkedLayerIds
                                  : [];
                              const newDeconLayers = deconLayersAll.filter(
                                (l) =>
                                  linkedLayerIds.includes(l.layerId) &&
                                  l.layerId !== deconOperation.layerId,
                              );
                              setDeconOperation(
                                newDeconLayers.length > 0
                                  ? newDeconLayers[0]
                                  : null,
                              );

                              setLayers((layers) => {
                                return layers.filter(
                                  (layer) =>
                                    layer.layerId !== deconOperation.layerId,
                                );
                              });

                              setEdits((edits) => {
                                const editsCopy: EditsType =
                                  deepCopyObject(edits);
                                editsCopy.edits.forEach((scenario) => {
                                  if (scenario.type !== 'scenario-decon')
                                    return;

                                  scenario.linkedLayerIds =
                                    scenario.linkedLayerIds.filter(
                                      (id) => id !== deconOperation.layerId,
                                    );
                                });

                                return {
                                  count: edits.count + 1,
                                  edits: editsCopy.edits.filter(
                                    (edit) =>
                                      edit.layerId !== deconOperation.layerId,
                                  ),
                                };
                              });
                            }}
                          >
                            <i className="fas fa-trash-alt" />
                            <span className="sr-only">Delete Operation</span>
                          </button>

                          <button
                            css={iconButtonStyles}
                            title="Clone Operation"
                            onClick={(ev) => {
                              // get the name for the new layer
                              const newLayerName = getNewName(
                                layers.map((layer) => layer.label),
                                deconOperation.label,
                              );

                              const layer = layers.find(
                                (l) => l.layerId === deconOperation.layerId,
                              );
                              if (!layer) return;

                              const layerUuid = generateUUID();
                              const copiedLayer: LayerType =
                                deepCopyObject(layer);
                              copiedLayer.addedFrom = 'sketch';
                              copiedLayer.editType = 'add';
                              copiedLayer.id = -1;
                              copiedLayer.label = newLayerName;
                              copiedLayer.name = newLayerName;
                              copiedLayer.layerId = layerUuid;
                              copiedLayer.portalId = '';
                              copiedLayer.status = 'added';
                              copiedLayer.value = layerUuid;

                              setLayers((layers) => {
                                return [...layers, copiedLayer];
                              });

                              setEdits((edits) => {
                                const editsCopy: EditsType =
                                  deepCopyObject(edits);

                                const scenario = editsCopy.edits.find(
                                  (edit) =>
                                    edit.layerId === selectedScenario.layerId,
                                );
                                const originalOp = editsCopy.edits.find(
                                  (edit) =>
                                    edit.layerId === deconOperation.layerId,
                                );
                                if (!originalOp) return edits;

                                if (
                                  scenario &&
                                  scenario.type === 'scenario-decon'
                                ) {
                                  scenario.linkedLayerIds.push(layerUuid);
                                  setSelectedScenario((selectedScenario) => {
                                    if (
                                      !selectedScenario ||
                                      selectedScenario.type !== 'scenario-decon'
                                    )
                                      return selectedScenario;

                                    return {
                                      ...selectedScenario,
                                      linkedLayerIds: [
                                        ...selectedScenario.linkedLayerIds,
                                        layerUuid,
                                      ],
                                    };
                                  });
                                }

                                return {
                                  count: edits.count + 1,
                                  edits: [
                                    ...editsCopy.edits,
                                    {
                                      ...originalOp,
                                      deconLayerResults: {
                                        cost: 0,
                                        resultsTable: [],
                                        time: 0,
                                        wasteMass: 0,
                                        wasteVolume: 0,
                                      },
                                      editType: 'add',
                                      id: -1,
                                      layerId: layerUuid,
                                      label: newLayerName,
                                      name: newLayerName,
                                      status: 'added',
                                      value: layerUuid,
                                    },
                                  ],
                                };
                              });

                              setDeconOperation(copiedLayer);
                            }}
                          >
                            <i className="fas fa-clone" />
                            <span className="sr-only">Clone Operation</span>
                          </button>

                          {deconOperation.status !== 'published' && (
                            <button
                              css={iconButtonStyles}
                              title={
                                editOperationVisible
                                  ? 'Cancel'
                                  : 'Edit Operation'
                              }
                              onClick={() => {
                                setAddOperationVisible(false);
                                setEditOperationVisible(!editOperationVisible);
                                if (deconOperation)
                                  setNewDeconOperationName(deconOperation.name);
                              }}
                            >
                              <i
                                className={
                                  editOperationVisible
                                    ? 'fas fa-times'
                                    : 'fas fa-edit'
                                }
                              />
                              <span className="sr-only">
                                {editOperationVisible
                                  ? 'Cancel'
                                  : 'Edit Operation'}
                              </span>
                            </button>
                          )}
                        </Fragment>
                      )}
                      <button
                        css={iconButtonStyles}
                        title={addOperationVisible ? 'Cancel' : 'Add Operation'}
                        onClick={() => {
                          setEditOperationVisible(false);
                          if (!addOperationVisible)
                            setNewDeconOperationName('');
                          setAddOperationVisible(!addOperationVisible);
                        }}
                      >
                        <i
                          className={
                            addOperationVisible ? 'fas fa-times' : 'fas fa-plus'
                          }
                        />
                        <span className="sr-only">
                          {addOperationVisible ? 'Cancel' : 'Add Operation'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
                <Select
                  id="decon-operation-select-input-container"
                  inputId="decon-operation-select-input"
                  css={layerSelectStyles}
                  isDisabled={addOperationVisible || editOperationVisible}
                  value={deconOperation}
                  onChange={(ev) => {
                    const newLayer = ev as LayerType;
                    setDeconOperation(newLayer);
                  }}
                  options={deconLayers}
                />
              </div>

              {(addOperationVisible || editOperationVisible) && (
                <div>
                  <label>
                    <span>Decon Operation Name</span>
                    <input
                      type="text"
                      css={inputStyles}
                      maxLength={250}
                      placeholder="Enter decon Layer Name"
                      value={newDeconOperationName}
                      onChange={(ev) => {
                        setNewDeconOperationName(ev.target.value);
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
                        !newDeconOperationName ||
                        newDeconOperationName === deconSketchLayer?.name
                      }
                      onClick={(_ev) => {
                        const layer = layers.find(
                          (l) => l.layerId === deconOperation?.layerId,
                        );

                        if (deconOperation && layer && editOperationVisible) {
                          setDeconOperation((deconOperation) => {
                            if (!deconOperation) return deconOperation;
                            return {
                              ...deconOperation,
                              label: newDeconOperationName,
                              name: newDeconOperationName,
                            };
                          });

                          setLayers((layers) => {
                            return layers.map((layer) => {
                              if (layer.layerId === deconOperation.layerId) {
                                return {
                                  ...layer,
                                  label: newDeconOperationName,
                                  name: newDeconOperationName,
                                };
                              }
                              return layer;
                            });
                          });

                          setEdits((edits) => {
                            if (!deconOperation) return edits;

                            const editsCopy = deepCopyObject(
                              edits,
                            ) as EditsType;
                            const deconOp = editsCopy.edits.find(
                              (edit) =>
                                edit.type === 'layer-decon' &&
                                edit.layerId === deconOperation.layerId,
                            );
                            if (!deconOp) return edits;

                            deconOp.label = newDeconOperationName;
                            deconOp.name = newDeconOperationName;
                            return editsCopy;
                          });
                        } else {
                          const deconUuid = generateUUID();

                          const newOpLayer = {
                            id: -1,
                            pointsId: -1,
                            uuid: deconUuid,
                            layerId: deconUuid,
                            portalId: '',
                            value: deconUuid,
                            name: newDeconOperationName,
                            label: newDeconOperationName,
                            layerType: 'Decon',
                            editType: 'add',
                            visible: true,
                            listMode: 'show',
                            sort: 0,
                            geometryType: 'esriGeometryPolygon',
                            addedFrom: 'sketch',
                            status: 'added',
                            sketchLayer: null,
                            pointsLayer: null,
                            hybridLayer: null,
                            parentLayer: null,
                          } as LayerType;

                          setDeconOperation(newOpLayer);

                          setLayers((layers) => {
                            return [...layers, newOpLayer];
                          });

                          setEdits((edits) => {
                            return {
                              count: edits.count + 1,
                              edits: [
                                ...edits.edits,
                                {
                                  type: 'layer-decon',
                                  id: -1,
                                  layerId: deconUuid,
                                  portalId: '',
                                  name: newDeconOperationName,
                                  label: newDeconOperationName,
                                  value: deconUuid,
                                  layerType: 'Decon',
                                  status: 'added',
                                  editType: 'add',
                                  visible: true,
                                  listMode: 'show',
                                  analysisLayerId: '',
                                  deconLayerResults: {
                                    cost: 0,
                                    time: 0,
                                    wasteVolume: 0,
                                    wasteMass: 0,
                                    resultsTable: [],
                                  },
                                  deconSummaryResults: {}, // TODO see if we need to fill this out more
                                  deconTechSelections: defaultDeconSelections,
                                } as LayerDeconEditsType,
                              ],
                            };
                          });
                        }

                        setAddOperationVisible(false);
                        setEditOperationVisible(false);
                      }}
                    >
                      {(saveStatus === 'none' || saveStatus === 'changes') &&
                        'Save'}
                      {saveStatus === 'success' && (
                        <Fragment>
                          <i className="fas fa-check" /> Saved
                        </Fragment>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <CharacterizeAOI
                appType={appType}
                label="Linked AOI Layer"
                showHelpText={false}
                showOnEdit={true}
              />

              {trainingMode && (
                <div>
                  <label htmlFor="contamination-map-select-input">
                    Contamination map
                  </label>
                  <div css={inlineMenuStyles}>
                    <Select
                      id="contamination-map-select"
                      inputId="contamination-map-select-input"
                      css={fullWidthSelectStyles}
                      styles={reactSelectStyles as any}
                      value={contaminationMap}
                      onChange={(ev) => setContaminationMap(ev as LayerType)}
                      options={layers.filter(
                        (layer: any) => layer.layerType === 'Contamination Map',
                      )}
                    />
                    <button
                      css={addButtonStyles}
                      onClick={(ev) => {
                        setGoTo('addData');
                        setGoToOptions({
                          from: 'file',
                          layerType: 'Contamination Map',
                        });
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </Fragment>
          )}
        </div>

        {deconSketchLayer &&
          (!trainingMode || (trainingMode && contaminationMap)) && (
            <Fragment>
              <AccordionList>
                <AccordionItem
                  title="Select Decontamination Technology"
                  initiallyExpanded={true}
                >
                  <div css={sectionContainer}>
                    <p>
                      The tool generates a listing of different contamination
                      scenarios that are present within the specified AOI. Click
                      "Select/Edit Decontamination Technology Selections" to
                      review a summary of relevant characteristics and assign an
                      appropriate decontamination method to address the
                      contamination.
                    </p>

                    <button
                      css={submitButtonStyles}
                      onClick={() => setDeconTechPopupOpen(true)}
                    >
                      Select/Edit Decontamination Technology Selections
                    </button>

                    <DeconSelectionPopup
                      defaultDeconSelections={defaultDeconSelections}
                      isOpen={deconTechPopupOpen}
                      onClose={() => setDeconTechPopupOpen(false)}
                    />
                  </div>
                </AccordionItem>
              </AccordionList>
            </Fragment>
          )}
      </div>
      <div css={sectionContainer}>
        <NavigationButton currentPanel="decon" />
      </div>
    </div>
  );
}

type DeconSelectionProps = {
  defaultDeconSelections: any[];
  editable?: boolean;
  performUpdate?: boolean;
};

function DeconSelectionTable({
  defaultDeconSelections,
  editable = false,
  performUpdate = false,
}: DeconSelectionProps) {
  const { calculateResultsDecon, setCalculateResultsDecon } =
    useContext(CalculateContext);
  const { trainingMode } = useContext(NavigationContext);
  const {
    allSampleOptions,
    deconOperation,
    edits,
    selectedScenario,
    setEdits,
  } = useContext(SketchContext);
  const [tableId] = useState(
    `tots-decon-tech-selectionstable-${generateUUID()}`,
  );

  const [deconSelections, setDeconSelections] = useState(
    defaultDeconSelections,
  );
  // initialize decon selections
  useEffect(() => {
    if (!deconOperation) {
      setDeconSelections([]);
      return;
    }

    const selectedDeconOp = edits.edits.find(
      (e) => e.type === 'layer-decon' && e.layerId === deconOperation?.layerId,
    ) as LayerDeconEditsType;
    if (
      selectedDeconOp.deconTechSelections &&
      selectedDeconOp.deconTechSelections.length > 0
    ) {
      setDeconSelections([...selectedDeconOp.deconTechSelections]);
    } else {
      setDeconSelections([...defaultDeconSelections]);

      setEdits((edits) => {
        const index = edits.edits.findIndex(
          (item) =>
            item.type === 'layer-decon' &&
            item.layerId === deconOperation?.layerId,
        );

        if (index === -1) return edits;

        const editedOp = edits.edits[index] as LayerDeconEditsType;
        editedOp.deconTechSelections = [...defaultDeconSelections];

        return {
          count: edits.count + 1,
          edits: [
            ...edits.edits.slice(0, index),
            editedOp,
            ...edits.edits.slice(index + 1),
          ],
        };
      });
    }
  }, [deconOperation, defaultDeconSelections, setEdits]);

  const [hasUpdatedSelections, setHasUpdatedSelections] = useState(false);
  useEffect(() => {
    if (calculateResultsDecon.status !== 'success') {
      setHasUpdatedSelections(false);
      return;
    }
    if (hasUpdatedSelections) return;

    setHasUpdatedSelections(true);

    const deconOp = edits.edits.find(
      (e) => e.type === 'layer-decon' && e.layerId === deconOperation?.layerId,
    ) as LayerDeconEditsType | undefined;

    if (
      deconOp?.deconTechSelections &&
      deconOp.deconTechSelections.length > 0
    ) {
      setDeconSelections([...deconOp.deconTechSelections]);
    }
  }, [calculateResultsDecon, deconOperation, edits, hasUpdatedSelections]);

  const updateEdits = useCallback(
    (newTable: any[] | null = null) => {
      if (!deconOperation) return;

      const index = edits.edits.findIndex(
        (item) =>
          item.type === 'layer-decon' &&
          item.layerId === deconOperation.layerId,
      );
      setEdits((edits) => {
        if (index === -1) return edits;

        const editsCopy = deepCopyObject(edits);
        const editedOp = editsCopy.edits[index] as LayerDeconEditsType;
        editedOp.deconTechSelections = newTable ?? deconSelections;

        return {
          count: editsCopy.count + 1,
          edits: editsCopy.edits,
        };
      });

      // TODO see if we need this
      // setSelectedScenario((selectedScenario) => {
      //   // TODO update this to be based on user's selected layer
      //   if (
      //     selectedScenario &&
      //     selectedScenario.layers.length > 0 &&
      //     selectedScenario.layers[0].type === 'layer-aoi-analysis'
      //   )
      //     selectedScenario.layers[0].deconTechSelections =
      //       newTable ?? deconSelections;
      //   return selectedScenario;
      // });

      setTimeout(() => {
        // TODO see if this can be moved out
        setCalculateResultsDecon((calculateResultsDecon) => {
          return {
            status: 'fetching',
            panelOpen: calculateResultsDecon.panelOpen,
            data: null,
          };
        });
        setUpdateEditsRan(false);
      }, 1000);
    },
    [
      deconOperation,
      deconSelections,
      setCalculateResultsDecon,
      edits,
      setEdits,
    ],
  );

  const [updateEditsRan, setUpdateEditsRan] = useState(false);
  useEffect(() => {
    if (!performUpdate || updateEditsRan) return;

    setUpdateEditsRan(true);
    updateEdits();
  }, [performUpdate, updateEdits, updateEditsRan]);

  if (!selectedScenario) return <p>Please select a plan.</p>;

  const devMode = window.location.search.includes('devMode=true');
  return (
    <ReactTableEditable
      id={tableId}
      data={deconSelections.map((sel) => {
        return {
          ...sel,
          deconTech: editable ? sel.deconTech : sel.deconTech?.label,
          isHazardous: editable ? sel.deconTech : sel.deconTech?.label,
          pctAoi: sel.pctAoi ? `${formatNumber(sel.pctAoi)}%` : '',
          surfaceArea: `${formatNumber(sel.surfaceArea)} m²`,
          avgCfu: formatNumber(sel.avgCfu),
          avgFinalContamination: formatNumber(sel.avgFinalContamination, 2),
          aboveDetectionLimit: sel.aboveDetectionLimit ? 'Above' : 'Below',
        };
      })}
      idColumn={'ID'}
      striped={true}
      hideHeader={false}
      height={-1}
      onDataChange={(rowIndex: any, columnId: any, value: any) => {
        const newTable = deconSelections.map((row: any, index: number) => {
          // update the row if it is the row in focus and the data has changed
          if (index === rowIndex && row[columnId] !== value) {
            return {
              ...deconSelections[rowIndex],
              [columnId]: value,
            };
          }
          return row;
        });

        setDeconSelections(newTable);
      }}
      getColumns={(tableWidth: any) => {
        return [
          {
            Header: 'ID',
            accessor: 'ID',
            width: 0,
            show: false,
          },
          {
            Header: 'Contamination Scenario',
            accessor: 'media',
            width: 118,
          },
          {
            Header: 'Percent of AOI',
            accessor: 'pctAoi',
            width: 97,
          },
          {
            Header: 'Surface Area',
            accessor: 'surfaceArea',
            width: 97,
          },
          {
            Header: 'Average Initial Contamination (CFUs/m²)',
            accessor: 'avgCfu',
            width: 97,
            show: devMode && trainingMode,
          },
          {
            Header: 'Biological Decon Technology',
            accessor: 'deconTech',
            width: 150,
            editType: editable ? 'select' : undefined,
            options: allSampleOptions,
          },
          {
            Header: 'Number of Applications',
            accessor: 'numApplications',
            width: 0,
            editType: editable ? 'input' : undefined,
            show: false,
          },
          {
            Header: 'Number of Concurrent Applications',
            accessor: 'numConcurrentApplications',
            width: 97,
            editType: editable ? 'input' : undefined,
          },
          {
            Header: 'Percent Decontaminated',
            accessor: 'pctDeconed',
            width: 0,
            editType: editable ? 'input' : undefined,
            show: false,
          },
          {
            Header: 'Average Final Contamination (CFUs/m²)',
            accessor: 'avgFinalContamination',
            width: 97,
            show: devMode && trainingMode,
          },
          {
            Header: 'Above/Below Detection Limit',
            accessor: 'aboveDetectionLimit',
            width: 97,
            show: devMode && trainingMode,
          },
          {
            Header: 'Is Hazardous',
            accessor: 'isHazardous',
            width: 0,
            editType: editable ? 'select' : undefined,
            options: hazardousOptions,
            show: false,
          },
        ];
      }}
    />
  );
}

const overlayStyles = css`
  &[data-reach-dialog-overlay] {
    z-index: 100;
    background-color: ${colors.black(0.75)};
  }
`;

const dialogStyles = css`
  color: ${colors.black()};
  background-color: ${colors.white()};
  max-height: 80vh;
  overflow: auto;

  &[data-reach-dialog-content] {
    position: relative;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    padding: 1.5rem;
    width: auto;
    max-width: 90%;
  }

  p,
  li {
    font-size: 0.875rem;
    line-height: 1.375;
  }
`;

const headingStyles = css`
  font-size: 117.6471%;
  text-align: center;
`;

const saveAttributesButtonStyles = css`
  background-color: #0071bc;
  border: 0;
  color: #fff;
  font-weight: bold;
  line-height: 1;
  margin: 0 0.5em 1.5em 0;
  padding: 0.5882em 1.1765em;
  font-size: 16px;
`;

const buttonContainerStyles = css`
  display: flex;
  justify-content: center;
  margin-top: 1rem;
`;

type DeconSelectionPopupProps = {
  defaultDeconSelections: any[];
  isOpen: boolean;
  onClose: Function;
};

function DeconSelectionPopup({
  defaultDeconSelections,
  isOpen,
  onClose,
}: DeconSelectionPopupProps) {
  const { edits, deconOperation } = useContext(SketchContext);
  const { calculateResultsDecon } = useContext(CalculateContext);
  const [performUpdate, setPerformUpdate] = useState(false);

  const selectedDeconOp = edits.edits.find(
    (e) => e.type === 'layer-decon' && e.layerId === deconOperation?.layerId,
  ) as LayerDeconEditsType;

  let area = 0;
  let buildingFootprintArea = 0;
  let cost = 0;
  let time = 0;
  let wasteVolume = 0;
  let wasteMass = 0;
  if (selectedDeconOp) {
    const aoiLayer = edits.edits.find(
      (e) => e.layerId === selectedDeconOp.analysisLayerId,
    ) as LayerAoiAnalysisEditsType;
    if (!aoiLayer) return;

    area += aoiLayer.aoiSummary.totalAoiSqM;
    buildingFootprintArea += aoiLayer.aoiSummary.totalBuildingFootprintSqM;
    cost += selectedDeconOp.deconLayerResults.cost;
    time += selectedDeconOp.deconLayerResults.time;
    wasteVolume += selectedDeconOp.deconLayerResults.wasteVolume;
    wasteMass += selectedDeconOp.deconLayerResults.wasteMass;
  }

  return (
    <DialogOverlay
      css={overlayStyles}
      isOpen={isOpen}
      data-testid="tots-decon-tech-selections"
    >
      <DialogContent css={dialogStyles} aria-label="Edit Attribute">
        <h1 css={headingStyles}>
          Specify Decon Strategies for Contamination Scenarios{' '}
          {deconOperation ? `in ${deconOperation?.label}` : ''}
        </h1>

        <p>
          For each contamination scenario listed, choose a decontamination
          method from the drop-down menu. An{' '}
          <a
            href="https://www.epa.gov/emergency-response-research/analysis-coastal-operational-resiliency"
            target="_blank"
            rel="noopener noreferrer"
          >
            overview of available technologies and applicable considerations
          </a>{' '}
          is also available to review.
        </p>

        <div css={resourceTallyContainerStyles}>
          <div>
            <div>
              <strong>{deconOperation?.label} size: </strong>{' '}
              {area.toLocaleString()} m²
            </div>
            <div>
              <strong>Total Building Footprint:</strong>{' '}
              {buildingFootprintArea.toLocaleString()} m²
            </div>
            <div>
              <strong>Detection Limit:</strong> 100 (CFU/m²)
            </div>
            <div>
              <strong>Assumed Percent of Surface Decontaminated:</strong> 100%
            </div>
          </div>
          <div>
            {calculateResultsDecon.status === 'fetching' && <LoadingSpinner />}
            {calculateResultsDecon.status === 'success' &&
            calculateResultsDecon.data &&
            deconOperation ? (
              <Fragment>
                <div>
                  <strong>Total Cost:</strong> $
                  {Math.round(cost).toLocaleString()}
                </div>
                <div>
                  <strong>Max Time day(s):</strong> {time.toLocaleString()}
                </div>
                <div>
                  <strong>
                    Total Waste Volume (m<sup>3</sup>):
                  </strong>{' '}
                  {Math.round(wasteVolume).toLocaleString()}
                </div>
                <div>
                  <strong>Total Waste Mass (kg):</strong>{' '}
                  {Math.round(wasteMass).toLocaleString()}
                </div>
              </Fragment>
            ) : null}
          </div>
        </div>

        <DeconSelectionTable
          defaultDeconSelections={defaultDeconSelections}
          editable={true}
          performUpdate={performUpdate}
        />
        <div css={buttonContainerStyles}>
          <button
            css={saveAttributesButtonStyles}
            onClick={() => {
              setPerformUpdate(true);

              setTimeout(() => {
                setPerformUpdate(false);
              }, 500);
            }}
          >
            Save
          </button>
          <button
            css={saveAttributesButtonStyles}
            onClick={() => {
              onClose();
            }}
          >
            Close
          </button>
        </div>
      </DialogContent>
    </DialogOverlay>
  );
}

export default CreateDeconPlan;

const resourceTallyContainerStyles = css`
  display: flex;
  justify-content: space-around;
`;
