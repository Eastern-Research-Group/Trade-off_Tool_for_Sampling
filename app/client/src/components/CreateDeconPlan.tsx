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
import { EditScenario } from 'components/EditLayerMetaData';
import LoadingSpinner from 'components/LoadingSpinner';
import MessageBox from 'components/MessageBox';
import NavigationButton from 'components/NavigationButton';
import { ReactTableEditable } from 'components/ReactTable';
import Select from 'components/Select';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { NavigationContext } from 'contexts/Navigation';
import {
  SketchContext,
  hazardousOptions,
  AoiGraphics,
  PlanSettings,
} from 'contexts/Sketch';
// types
import { LayerType } from 'types/Layer';
import { EditsType, LayerEditsType, ScenarioEditsType } from 'types/Edits';
import { ErrorType } from 'types/Misc';
// config
import {
  cantUseWithVspMessage,
  generateRandomExceededTransferLimitMessage,
  generateRandomSuccessMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
// utils
import { useStartOver } from 'utils/hooks';
import {
  generateUUID,
  getDefaultSamplingMaskLayer,
  getNextScenarioLayer,
  getScenarios,
  getSketchableLayers,
  updateLayerEdits,
} from 'utils/sketchUtils';
import { activateSketchButton, formatNumber } from 'utils/utils';
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

const sketchAoiButtonStyles = css`
  background-color: white;
  color: black;

  &:hover,
  &:focus {
    background-color: #e7f6f8;
    cursor: pointer;
  }
`;

const sketchAoiTextStyles = css`
  display: flex;
  justify-content: space-between;
  align-items: center;

  i {
    font-size: 20px;
    margin-right: 5px;
  }
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

const inlineSelectStyles = css`
  width: 100%;
  margin-right: 10px;
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

const lineSeparatorStyles = css`
  border-bottom: 1px solid #d8dfe2;
`;

const radioLabelStyles = css`
  padding-left: 0.375rem;
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
type GenerateRandomType = {
  status: 'none' | 'fetching' | 'success' | 'failure' | 'exceededTransferLimit';
  error?: ErrorType;
  data: __esri.Graphic[];
};

function CreateDeconPlan() {
  const { contaminationMap, setContaminationMap } =
    useContext(CalculateContext);
  const { setGoTo, setGoToOptions } = useContext(NavigationContext);
  const {
    defaultDeconSelections,
    planSettings,
    setPlanSettings,
    displayDimensions,
    edits,
    setEdits,
    layersInitialized,
    layers,
    setLayers,
    map,
    selectedScenario,
    setSelectedScenario,
    sketchLayer,
    setSketchLayer,
    aoiSketchLayer,
    setAoiSketchLayer,
    sketchVM,
    aoiSketchVM,
    setAoiData,
    sceneView,
    mapView,
    gsgFiles,
    setGsgFiles,
  } = useContext(SketchContext);
  const startOver = useStartOver();

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

  // Initializes the aoi layer for performance reasons
  useEffect(() => {
    if (!map || !layersInitialized || aoiSketchLayer) return;

    const newAoiSketchLayer = getDefaultSamplingMaskLayer();

    // add the layer to the map
    setLayers((layers) => {
      return [...layers, newAoiSketchLayer];
    });

    // set the active sketch layer
    setAoiSketchLayer(newAoiSketchLayer);
  }, [map, aoiSketchLayer, setAoiSketchLayer, layersInitialized, setLayers]);

  // Handle a user clicking the sketch AOI button. If an AOI is not selected from the
  // dropdown this will create an AOI layer. This also sets the sketchVM to use the
  // selected AOI and triggers a React useEffect to allow the user to sketch on the map.
  const [
    generateRandomResponse,
    setGenerateRandomResponse, //
  ] = useState<GenerateRandomType>({
    status: 'none',
    data: [],
  });
  function sketchAoiButtonClick() {
    if (!map || !sketchVM || !sketchLayer || !sceneView || !mapView) return;

    setGenerateRandomResponse({
      status: 'none',
      data: [],
    });

    // save changes from other sketchVM and disable to prevent
    // interference
    if (aoiSketchVM) aoiSketchVM.cancel();

    // make the style of the button active
    const wasSet = activateSketchButton('sampling-mask');

    if (wasSet) {
      // let the user draw/place the shape
      sketchVM[displayDimensions].create('polygon');
    } else {
      sketchVM[displayDimensions].cancel();
    }
  }

  function assessAoi() {
    const scenarios = edits.edits.filter(
      (i) => i.type === 'scenario',
    ) as ScenarioEditsType[];
    const planGraphics: AoiGraphics = {};
    scenarios.forEach((scenario) => {
      if (!scenario.aoiLayerMode) return;

      let aoiLayer: LayerType | undefined = undefined;

      // locate the layer
      if (scenario.aoiLayerMode === 'draw') {
        const aoiEditsLayer = scenario.layers.find(
          (l) => l.layerType === 'Samples',
        );
        aoiLayer = layers.find(
          (l) =>
            l.layerType === 'Samples' && l.layerId === aoiEditsLayer?.layerId,
        );
      }

      if (scenario.aoiLayerMode === 'file' && scenario.importedAoiLayer) {
        // locate the layer
        aoiLayer = layers.find(
          (l) =>
            l.layerType === 'Area of Interest' &&
            l.layerId === scenario.importedAoiLayer?.layerId,
        );
      }

      if (aoiLayer?.sketchLayer && aoiLayer.sketchLayer.type === 'graphics') {
        planGraphics[scenario.layerId] =
          aoiLayer.sketchLayer.graphics.toArray();
      }
    });

    setAoiData((aoiDataCur: any) => {
      return {
        count: aoiDataCur.count + 1,
        graphics: planGraphics,
      } as any;
    });
  }

  // Changes the selected layer if the scenario is changed. The first
  // available layer in the scenario will be chosen. If the scenario
  // has no layers, then the first availble unlinked layer is chosen.
  useEffect(() => {
    if (!selectedScenario) return;
    if (
      sketchLayer &&
      (!sketchLayer.parentLayer ||
        sketchLayer.parentLayer.id === selectedScenario.layerId)
    ) {
      return;
    }

    // select the first layer within the selected scenario
    if (selectedScenario.layers.length > 0) {
      const deconLayer = selectedScenario.layers.find(
        (l) => l.layerType === 'Samples',
      );
      const newSketchLayer = layers.find(
        (layer) =>
          (deconLayer && layer.layerId === deconLayer.layerId) ||
          (!deconLayer && layer.layerId === selectedScenario.layers[0].layerId),
      );
      if (newSketchLayer) {
        setSketchLayer(newSketchLayer);
        return;
      }
    }

    // select the first unlinked layer
    const newSketchLayer = layers.find(
      (layer) =>
        (layer.layerType === 'Samples' || layer.layerType === 'VSP') &&
        !layer.parentLayer,
    );
    if (newSketchLayer) setSketchLayer(newSketchLayer);
    else setSketchLayer(null);
  }, [layers, selectedScenario, sketchLayer, setSketchLayer]);

  // scenario and layer edit UI visibility controls
  const [addScenarioVisible, setAddScenarioVisible] = useState(false);
  const [editScenarioVisible, setEditScenarioVisible] = useState(false);
  const [editPlanVisible, setEditPlanVisible] = useState(!planSettings.name);
  const [tempPlanSettings, setTempPlanSettings] =
    useState<PlanSettings>(planSettings);
  const [generateRandomMode, setGenerateRandomMode] = useState<
    'draw' | 'file' | ''
  >('draw');
  const [selectedAoiFile, setSelectedAoiFile] = useState<LayerType | null>(
    null,
  );
  const [selectedGsgFile, setSelectedGsgFile] = useState<any | null>(null);

  // get a list of scenarios from edits
  const scenarios = getScenarios(edits);

  // build the list of layers to be displayed in the sample layer dropdown
  const sampleLayers: { label: string; options: LayerType[] }[] = [];
  if (selectedScenario && selectedScenario.layers.length > 0) {
    // get layers for the selected scenario
    sampleLayers.push({
      label: selectedScenario.label,
      options: getSketchableLayers(layers, selectedScenario.layers),
    });
  }

  // get unlinked layers
  sampleLayers.push({
    label: 'Unlinked Layers',
    options: getSketchableLayers(layers, edits.edits),
  });

  pointStyles.sort((a, b) => a.value.localeCompare(b.value));

  const [deconTechPopupOpen, setDeconTechPopupOpen] = useState(false);

  useEffect(() => {
    if (!selectedScenario) {
      setSelectedAoiFile(null);
      setGenerateRandomMode('draw');
      return;
    }

    if (!selectedScenario.importedAoiLayer) return;

    // find the layer
    const layer = layers.find(
      (l) => l.layerId === selectedScenario.importedAoiLayer?.layerId,
    );
    if (layer) setSelectedAoiFile(layer);
  }, [layers, selectedScenario]);

  const planSettingsSame =
    planSettings.name === tempPlanSettings.name &&
    planSettings.description === tempPlanSettings.description;

  const planSettingsSaved = Boolean(planSettings.name) && planSettingsSame;

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

          <div css={iconButtonContainerStyles}>
            <div css={verticalCenterTextStyles}>
              <label htmlFor="scenario-select-input">Plan Name</label>
            </div>
            <div>
              <button
                css={iconButtonStyles}
                title={editPlanVisible ? 'Cancel' : 'Edit Plan'}
                onClick={() => {
                  setEditPlanVisible(!editPlanVisible);
                }}
              >
                <i
                  className={editPlanVisible ? 'fas fa-times' : 'fas fa-edit'}
                />
                <span className="sr-only">
                  {editPlanVisible ? 'Cancel' : 'Edit Plan'}
                </span>
              </button>
            </div>
          </div>
          <input
            css={inputStyles}
            disabled={!editPlanVisible}
            value={editPlanVisible ? tempPlanSettings.name : planSettings.name}
            onChange={(ev) => {
              setTempPlanSettings((planSettings) => {
                return {
                  ...planSettings,
                  name: ev.target.value,
                };
              });
            }}
          />
          {editPlanVisible && (
            <Fragment>
              <label htmlFor="scenario-description-input">
                Plan Description
              </label>
              <input
                id="scenario-description-input"
                css={inputStyles}
                maxLength={2048}
                placeholder="Enter Plan Description (2048 characters)"
                value={tempPlanSettings.description}
                onChange={(ev) => {
                  setTempPlanSettings((planSettings) => {
                    return {
                      ...planSettings,
                      description: ev.target.value,
                    };
                  });
                }}
              />

              <div css={saveButtonContainerStyles}>
                <button
                  css={saveButtonStyles(planSettingsSaved ? 'success' : '')}
                  disabled={planSettingsSame}
                  onClick={() => {
                    setPlanSettings(tempPlanSettings);
                    setEditPlanVisible(false);
                  }}
                >
                  {planSettingsSaved ? (
                    <Fragment>
                      <i className="fas fa-check" /> Saved
                    </Fragment>
                  ) : (
                    'Save'
                  )}
                </button>
                <br />
              </div>
            </Fragment>
          )}

          {scenarios.length === 0 || !planSettings.name ? (
            <EditScenario addDefaultSampleLayer={true} appType="decon" />
          ) : (
            <Fragment>
              <div css={iconButtonContainerStyles}>
                <div css={verticalCenterTextStyles}>
                  <label htmlFor="scenario-select-input">
                    Active Decon Layer
                  </label>
                </div>
                <div>
                  {selectedScenario && (
                    <Fragment>
                      <button
                        css={iconButtonStyles}
                        title="Delete Layer"
                        onClick={() => {
                          // remove all of the child layers
                          setLayers((layers) => {
                            return layers.filter(
                              (layer) =>
                                selectedScenario.layers.findIndex(
                                  (scenarioLayer) =>
                                    scenarioLayer.layerId === layer.layerId,
                                ) === -1,
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

                          setAoiData((aoiData) => {
                            const graphicsCopy = { ...aoiData.graphics };
                            delete graphicsCopy[selectedScenario.layerId];

                            return {
                              count: aoiData.count + 1,
                              graphics: graphicsCopy,
                            };
                          });

                          // select the next available scenario
                          const scenarios = getScenarios(newEdits);
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
                        <span className="sr-only">Delete Layer</span>
                      </button>

                      {selectedScenario.status !== 'published' && (
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
                              editScenarioVisible
                                ? 'fas fa-times'
                                : 'fas fa-edit'
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
                      setAddScenarioVisible(!addScenarioVisible);
                    }}
                  >
                    <i
                      className={
                        addScenarioVisible ? 'fas fa-times' : 'fas fa-plus'
                      }
                    />
                    <span className="sr-only">
                      {addScenarioVisible ? 'Cancel' : 'Add Layer'}
                    </span>
                  </button>
                </div>
              </div>
              <Select
                id="scenario-select-input-container"
                inputId="scenario-select-input"
                css={layerSelectStyles}
                isDisabled={addScenarioVisible || editScenarioVisible}
                value={selectedScenario}
                onChange={(ev) => {
                  const newScenario = ev as ScenarioEditsType;
                  setSelectedScenario(newScenario);
                }}
                options={scenarios}
              />
              {addScenarioVisible && (
                <EditScenario
                  addDefaultSampleLayer={true}
                  appType="decon"
                  onSave={() => setAddScenarioVisible(false)}
                />
              )}
              {editScenarioVisible && (
                <EditScenario
                  appType="decon"
                  initialScenario={selectedScenario}
                  onSave={() => setEditScenarioVisible(false)}
                />
              )}

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
            </Fragment>
          )}
        </div>

        {selectedScenario && contaminationMap && (
          <Fragment>
            <AccordionList>
              <AccordionItem
                title="1) Characterize Area of Interest"
                initiallyExpanded={true}
              >
                <div css={sectionContainer}>
                  {sketchLayer?.layerType === 'VSP' && cantUseWithVspMessage}
                  {sketchLayer?.layerType !== 'VSP' && (
                    <Fragment>
                      <p>
                        Select "Draw Area of Interest" to draw a boundary on
                        your map to designate a decontamination zone or decision
                        unit. The tool will retrieve and analyze building data
                        and ground surface characteristics to inform
                        decontamination strategy decisions. Click Submit to
                        automatically generate a summary of contamination
                        scenarios that are present within the designated AOI.
                      </p>

                      <div style={{ display: 'none' }}>
                        <input
                          id="draw-aoi"
                          type="radio"
                          name="mode"
                          value="Draw area of Interest"
                          disabled={
                            generateRandomResponse.status === 'fetching'
                          }
                          checked={generateRandomMode === 'draw'}
                          onChange={(ev) => {
                            setGenerateRandomMode('draw');

                            const maskLayers = layers.filter(
                              (layer) => layer.layerType === 'Sampling Mask',
                            );
                            setAoiSketchLayer(maskLayers[0]);

                            setEdits((edits) => {
                              const index = edits.edits.findIndex(
                                (item) =>
                                  item.type === 'scenario' &&
                                  item.layerId === selectedScenario.layerId,
                              );
                              const editedScenario = edits.edits[
                                index
                              ] as ScenarioEditsType;

                              editedScenario.aoiLayerMode = 'draw';

                              return {
                                count: edits.count + 1,
                                edits: [
                                  ...edits.edits.slice(0, index),
                                  editedScenario,
                                  ...edits.edits.slice(index + 1),
                                ],
                              };
                            });
                          }}
                        />
                        <label htmlFor="draw-aoi" css={radioLabelStyles}>
                          Draw Sampling Mask
                        </label>
                      </div>

                      {generateRandomMode === 'draw' && (
                        <button
                          id="sampling-mask"
                          title="Draw Sampling Mask"
                          className="sketch-button"
                          disabled={
                            generateRandomResponse.status === 'fetching'
                          }
                          onClick={() => {
                            if (!aoiSketchLayer) return;

                            sketchAoiButtonClick();
                          }}
                          css={sketchAoiButtonStyles}
                        >
                          <span css={sketchAoiTextStyles}>
                            <i className="fas fa-draw-polygon" />{' '}
                            <span>Draw Area of Interest</span>
                          </span>
                        </button>
                      )}

                      <div style={{ display: 'none' }}>
                        <input
                          id="use-aoi-file"
                          type="radio"
                          name="mode"
                          value="Use Imported Area of Interest"
                          disabled={
                            generateRandomResponse.status === 'fetching'
                          }
                          checked={generateRandomMode === 'file'}
                          onChange={(ev) => {
                            setGenerateRandomMode('file');

                            setAoiSketchLayer(null);

                            let aoiLayer: LayerType | null = null;
                            if (!selectedAoiFile) {
                              const aoiLayers = layers.filter(
                                (layer) =>
                                  layer.layerType === 'Area of Interest',
                              );
                              aoiLayer = aoiLayers[0];
                              setSelectedAoiFile(aoiLayer);
                            }

                            setEdits((edits) => {
                              const index = edits.edits.findIndex(
                                (item) =>
                                  item.type === 'scenario' &&
                                  item.layerId === selectedScenario.layerId,
                              );
                              const editedScenario = edits.edits[
                                index
                              ] as ScenarioEditsType;

                              const importedAoi = edits.edits.find(
                                (l) =>
                                  aoiLayer &&
                                  l.type === 'layer' &&
                                  l.layerType === 'Area of Interest' &&
                                  l.layerId === aoiLayer.layerId,
                              );

                              if (importedAoi)
                                editedScenario.importedAoiLayer =
                                  importedAoi as LayerEditsType;

                              editedScenario.aoiLayerMode = 'file';

                              return {
                                count: edits.count + 1,
                                edits: [
                                  ...edits.edits.slice(0, index),
                                  editedScenario,
                                  ...edits.edits.slice(index + 1),
                                ],
                              };
                            });
                          }}
                        />
                        <label htmlFor="use-aoi-file" css={radioLabelStyles}>
                          Use Imported Area of Interest
                        </label>
                      </div>

                      {generateRandomMode === 'file' && (
                        <Fragment>
                          <label htmlFor="aoi-mask-select-input">
                            Area of Interest Mask
                          </label>
                          <div css={inlineMenuStyles}>
                            <Select
                              id="aoi-mask-select"
                              inputId="aoi-mask-select-input"
                              css={inlineSelectStyles}
                              styles={reactSelectStyles as any}
                              isClearable={true}
                              value={selectedAoiFile}
                              onChange={(ev) => {
                                setSelectedAoiFile(ev as LayerType);

                                setEdits((edits) => {
                                  const index = edits.edits.findIndex(
                                    (item) =>
                                      item.type === 'scenario' &&
                                      item.layerId === selectedScenario.layerId,
                                  );
                                  const editedScenario = edits.edits[
                                    index
                                  ] as ScenarioEditsType;

                                  const importedAoi = edits.edits.find(
                                    (l) =>
                                      l.type === 'layer' &&
                                      l.layerType === 'Area of Interest' &&
                                      l.layerId === (ev as LayerType).layerId,
                                  );

                                  if (importedAoi)
                                    editedScenario.importedAoiLayer =
                                      importedAoi as LayerEditsType;
                                  return {
                                    count: edits.count + 1,
                                    edits: [
                                      ...edits.edits.slice(0, index),
                                      editedScenario,
                                      ...edits.edits.slice(index + 1),
                                    ],
                                  };
                                });
                              }}
                              options={layers.filter(
                                (layer) =>
                                  layer.layerType === 'Area of Interest',
                              )}
                            />
                            <button
                              css={addButtonStyles}
                              disabled={
                                generateRandomResponse.status === 'fetching'
                              }
                              onClick={(ev) => {
                                setGoTo('addData');
                                setGoToOptions({
                                  from: 'file',
                                  layerType: 'Area of Interest',
                                });
                              }}
                            >
                              Add
                            </button>
                          </div>
                        </Fragment>
                      )}

                      <div>
                        <label htmlFor="gsg-file-select-input">
                          GSG File (optional)
                        </label>
                        <div css={inlineMenuStyles}>
                          <Select
                            id="gsg-file-select"
                            inputId="gsg-file-select-input"
                            css={inlineSelectStyles}
                            styles={reactSelectStyles as any}
                            isClearable={true}
                            value={selectedGsgFile}
                            onChange={(ev) => {
                              setSelectedGsgFile(ev);

                              setGsgFiles((gsg) => {
                                return {
                                  ...gsg,
                                  selectedIndex: (ev as any)?.value ?? 0,
                                };
                              });
                            }}
                            options={gsgFiles.files.map((file, index) => ({
                              label: file.path,
                              value: index,
                              file,
                            }))}
                          />
                          <button
                            css={addButtonStyles}
                            disabled={
                              generateRandomResponse.status === 'fetching'
                            }
                            onClick={(ev) => {
                              setGoTo('addData');
                              setGoToOptions({
                                from: 'file',
                                layerType: 'GSG',
                              });
                            }}
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      {generateRandomMode && (
                        <Fragment>
                          <br />
                          {generateRandomResponse.status === 'success' &&
                            sketchLayer &&
                            generateRandomSuccessMessage(
                              generateRandomResponse.data.length,
                              sketchLayer.label,
                            )}
                          {generateRandomResponse.status === 'failure' &&
                            webServiceErrorMessage(
                              generateRandomResponse.error,
                            )}
                          {generateRandomResponse.status ===
                            'exceededTransferLimit' &&
                            generateRandomExceededTransferLimitMessage}
                          <button
                            css={submitButtonStyles}
                            disabled={
                              generateRandomResponse.status === 'fetching'
                            }
                            onClick={assessAoi}
                          >
                            {generateRandomResponse.status !== 'fetching' &&
                              'Submit'}
                            {generateRandomResponse.status === 'fetching' && (
                              <Fragment>
                                <i className="fas fa-spinner fa-pulse" />
                                &nbsp;&nbsp;Loading...
                              </Fragment>
                            )}
                          </button>
                        </Fragment>
                      )}
                    </Fragment>
                  )}
                </div>
              </AccordionItem>
              <AccordionItem
                title="2) Select Decontamination Technology"
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
        <NavigationButton goToPanel="calculate" />
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
  const {
    allSampleOptions,
    edits,
    selectedScenario,
    setEdits,
    setSelectedScenario,
  } = useContext(SketchContext);
  const [tableId] = useState(
    `tots-decon-tech-selectionstable-${generateUUID()}`,
  );

  const [deconSelections, setDeconSelections] = useState(
    defaultDeconSelections,
  );
  // initialize decon selections
  useEffect(() => {
    if (!selectedScenario) {
      setDeconSelections([]);
      return;
    }

    if (
      selectedScenario.deconTechSelections &&
      selectedScenario.deconTechSelections.length > 0
    ) {
      setDeconSelections([...selectedScenario.deconTechSelections]);
    } else {
      setDeconSelections([...defaultDeconSelections]);

      setEdits((edits) => {
        const index = edits.edits.findIndex(
          (item) =>
            item.type === 'scenario' &&
            item.layerId === selectedScenario.layerId,
        );

        const editedScenario = edits.edits[index] as ScenarioEditsType;
        editedScenario.deconTechSelections = [...defaultDeconSelections];

        return {
          count: edits.count + 1,
          edits: [
            ...edits.edits.slice(0, index),
            editedScenario,
            ...edits.edits.slice(index + 1),
          ],
        };
      });

      setSelectedScenario((selectedScenario) => {
        if (selectedScenario)
          selectedScenario.deconTechSelections = [...defaultDeconSelections];
        return selectedScenario;
      });
    }
  }, [defaultDeconSelections, selectedScenario, setEdits, setSelectedScenario]);

  const [hasUpdatedSelections, setHasUpdatedSelections] = useState(false);
  useEffect(() => {
    if (calculateResultsDecon.status !== 'success') {
      setHasUpdatedSelections(false);
      return;
    }
    if (hasUpdatedSelections) return;

    setHasUpdatedSelections(true);

    const scenario = edits.edits.find(
      (e) => e.type === 'scenario' && e.layerId === selectedScenario?.layerId,
    ) as ScenarioEditsType;

    if (
      scenario?.deconTechSelections &&
      scenario.deconTechSelections.length > 0
    ) {
      setDeconSelections([...scenario.deconTechSelections]);
    }
  }, [calculateResultsDecon, edits, hasUpdatedSelections, selectedScenario]);

  const updateEdits = useCallback(
    (newTable: any[] | null = null) => {
      if (!selectedScenario) return;

      setCalculateResultsDecon((calculateResultsDecon) => {
        return {
          status: 'fetching',
          panelOpen: calculateResultsDecon.panelOpen,
          data: null,
        };
      });

      const index = edits.edits.findIndex(
        (item) =>
          item.type === 'scenario' && item.layerId === selectedScenario.layerId,
      );
      setEdits((edits) => {
        const editedScenario = edits.edits[index] as ScenarioEditsType;
        editedScenario.deconTechSelections = newTable ?? deconSelections;

        return {
          count: edits.count + 1,
          edits: [
            ...edits.edits.slice(0, index),
            editedScenario,
            ...edits.edits.slice(index + 1),
          ],
        };
      });

      setSelectedScenario((selectedScenario) => {
        if (selectedScenario)
          selectedScenario.deconTechSelections = newTable ?? deconSelections;
        return selectedScenario;
      });

      setTimeout(() => setUpdateEditsRan(false), 1000);
    },
    [
      deconSelections,
      selectedScenario,
      setCalculateResultsDecon,
      setSelectedScenario,
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
            show: devMode,
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
            show: devMode,
          },
          {
            Header: 'Above/Below Detection Limit',
            accessor: 'aboveDetectionLimit',
            width: 97,
            show: devMode,
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
  const { selectedScenario } = useContext(SketchContext);
  const { calculateResultsDecon } = useContext(CalculateContext);
  const [performUpdate, setPerformUpdate] = useState(false);

  return (
    <DialogOverlay
      css={overlayStyles}
      isOpen={isOpen}
      data-testid="tots-getting-started"
    >
      <DialogContent css={dialogStyles} aria-label="Edit Attribute">
        <h1 css={headingStyles}>
          Specify Decon Strategies for Contamination Scenarios{' '}
          {selectedScenario ? `in ${selectedScenario?.label}` : ''}
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
              <strong>{selectedScenario?.label} size: </strong>{' '}
              {selectedScenario?.aoiSummary?.area.toLocaleString() ?? 0} m²
            </div>
            <div>
              <strong>Total Building Footprint:</strong>{' '}
              {selectedScenario?.aoiSummary?.buildingFootprint.toLocaleString() ??
                0}{' '}
              m²
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
            selectedScenario &&
            (selectedScenario.deconLayerResults?.cost ||
              selectedScenario.deconLayerResults?.time ||
              selectedScenario.deconLayerResults?.wasteVolume ||
              selectedScenario.deconLayerResults?.wasteMass) ? (
              <Fragment>
                <div>
                  <strong>Total Cost:</strong> $
                  {Math.round(
                    selectedScenario?.deconLayerResults.cost ?? 0,
                  ).toLocaleString()}
                </div>
                <div>
                  <strong>Max Time day(s):</strong>{' '}
                  {selectedScenario?.deconLayerResults.time.toLocaleString() ??
                    0}
                </div>
                <div>
                  <strong>
                    Total Waste Volume (m<sup>3</sup>):
                  </strong>{' '}
                  {Math.round(
                    selectedScenario?.deconLayerResults.wasteVolume ?? 0,
                  ).toLocaleString()}
                </div>
                <div>
                  <strong>Total Waste Mass (kg):</strong>{' '}
                  {Math.round(
                    selectedScenario?.deconLayerResults.wasteMass ?? 0,
                  ).toLocaleString()}
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
