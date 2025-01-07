/** @jsxImportSource @emotion/react */

import React, { Fragment, useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import CustomSampleType from 'components/CustomSampleType';
import InfoIcon from 'components/InfoIcon';
import NavigationButton from 'components/NavigationButton';
import Select from 'components/Select';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { NavigationContext } from 'contexts/Navigation';
import { AoiGraphics, SketchContext } from 'contexts/Sketch';
// utils
import {
  activateSketchButton,
  createScenarioDecon,
  getDefaultSamplingMaskLayer,
} from 'utils/sketchUtils';
// types
import { ScenarioDeconEditsType, LayerEditsType } from 'types/Edits';
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
import { AppType } from 'types/Navigation';
// styles
import { infoIconStyles, isDecon, reactSelectStyles } from 'styles';
import { webServiceErrorMessage } from 'config/errorMessages';

export type SaveStatusType =
  | 'none'
  | 'changes'
  | 'fetching'
  | 'success'
  | 'failure'
  | 'fetch-failure'
  | 'name-not-available';

export type SaveResultsType = {
  status: SaveStatusType;
  error?: ErrorType;
};

// --- styles (Calculate) ---
const addButtonStyles = css`
  margin: 0;
  height: 38px; /* same height as ReactSelect */
`;

const inlineMenuStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const inlineSelectStyles = css`
  width: 100%;
  margin-right: 10px;
`;

const panelContainer = css`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
  padding: 20px 0;
`;

const radioLabelStyles = css`
  padding-left: 0.375rem;
`;

const sectionContainer = css`
  margin-bottom: 10px;
  padding: 0 20px;
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

const submitButtonStyles = css`
  margin-top: 10px;
`;

// --- components (AdditionalSetup) ---
type Props = {
  appType: AppType;
};

function AdditionalSetup({ appType }: Props) {
  const { calculateResultsDecon } = useContext(CalculateContext);
  const { setGoTo, setGoToOptions } = useContext(NavigationContext);
  const {
    defaultDeconSelections,
    displayDimensions,
    edits,
    setEdits,
    setSelectedScenario,
    layersInitialized,
    layers,
    setLayers,
    map,
    selectedScenario,
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

  const [lastAoiSketchLayer, setLastAoiSketchLayer] =
    useState<__esri.GraphicsLayer | null>(null);
  useEffect(() => {
    if (!aoiSketchVM) return;

    const scenario: ScenarioDeconEditsType | undefined = edits.edits.find(
      (item) => item.type === 'scenario-decon',
    );
    if (!scenario) return;

    const aoiEditsLayer = scenario.layers.find(
      (l) => l.layerType === 'Decon Mask',
    );
    const sketchLayer = layers.find(
      (l) =>
        l.layerType === 'Decon Mask' && l.layerId === aoiEditsLayer?.layerId,
    );
    if (
      sketchLayer &&
      sketchLayer?.sketchLayer?.id !== aoiSketchVM?.layer?.id
    ) {
      setLastAoiSketchLayer(aoiSketchVM.layer);
      aoiSketchVM.layer = sketchLayer.sketchLayer as __esri.GraphicsLayer;
    }

    return function cleanup() {
      if (lastAoiSketchLayer) aoiSketchVM.layer = lastAoiSketchLayer;
    };
  }, [aoiSketchVM, edits, lastAoiSketchLayer]);

  // Handle a user clicking the sketch AOI button. If an AOI is not selected from the
  // dropdown this will create an AOI layer. This also sets the sketchVM to use the
  // selected AOI and triggers a React useEffect to allow the user to sketch on the map.
  function sketchAoiButtonClick() {
    if (!map || !aoiSketchVM || !sceneView || !mapView) return;

    const scenario = edits.edits.find((item) => item.type === 'scenario-decon');
    if (!scenario) {
      const {
        graphicsLayerImageAnalysis,
        graphicsLayer,
        groupLayer,
        layers: newLayers,
        scenario: newScenario,
        sketchLayer,
        tempAssessedAoiLayer,
        tempImageAnalysisLayer,
      } = createScenarioDecon(
        defaultDeconSelections,
        'Default Decon Scenario',
        '',
      );

      if (sketchLayer) {
        aoiSketchVM.layer = sketchLayer.sketchLayer as __esri.GraphicsLayer;
      }

      setLayers((layers) => {
        newLayers.forEach((newLayer) => {
          const layer = layers.find((l) => l.layerId === newLayer.layerId);
          if (!layer) return;

          layer.parentLayer = groupLayer;
          groupLayer.add(layer.sketchLayer);
          map.layers.remove(layer.sketchLayer);
          if (layer.pointsLayer) {
            groupLayer.add(layer.pointsLayer);
            map.layers.remove(layer.pointsLayer);
          }
          if (layer.hybridLayer) {
            groupLayer.add(layer.hybridLayer);
            map.layers.remove(layer.hybridLayer);
          }
        });

        return layers;
      });

      // make a copy of the edits context variable
      setEdits((edits) => {
        const newEdits = edits.edits.filter((edit) => {
          const idx = newLayers.findIndex((l) => l.layerId === edit.layerId);

          return idx === -1;
        });

        return {
          count: edits.count + 1,
          edits: [...newEdits, newScenario],
        };
      });

      if (isDecon()) setSelectedScenario(newScenario);

      const tLayers = [...layers];
      if (sketchLayer) tLayers.push(sketchLayer);
      if (tempImageAnalysisLayer) tLayers.push(tempImageAnalysisLayer);
      if (tempAssessedAoiLayer) tLayers.push(tempAssessedAoiLayer);

      // update layers (set parent layer)
      window.totsLayers = tLayers;
      setLayers(tLayers);

      if (sketchLayer) groupLayer.layers.add(sketchLayer.sketchLayer);
      groupLayer.layers.add(graphicsLayerImageAnalysis);
      groupLayer.layers.add(graphicsLayer);

      // add the scenario group layer to the map
      map.add(groupLayer);
    } else {
      let tempScenario: ScenarioDeconEditsType = scenario;
      if (isDecon() && selectedScenario)
        tempScenario = selectedScenario as ScenarioDeconEditsType;

      const aoiEditsLayer = tempScenario.layers.find(
        (l) => l.layerType === 'Decon Mask',
      );
      const sketchLayer = layers.find(
        (l) =>
          l.layerType === 'Decon Mask' && l.layerId === aoiEditsLayer?.layerId,
      );

      if (sketchLayer)
        aoiSketchVM.layer = sketchLayer.sketchLayer as __esri.GraphicsLayer;
    }

    // save changes from other sketchVM and disable to prevent
    // interference
    if (sketchVM) sketchVM[displayDimensions].cancel();

    // make the style of the button active
    const wasSet = activateSketchButton('decon-mask');

    if (wasSet) {
      // let the user draw/place the shape
      aoiSketchVM.create('polygon');
    } else {
      aoiSketchVM.cancel();
    }
  }

  function assessAoi() {
    const scenarios = edits.edits.filter(
      (i) => i.type === 'scenario-decon',
    ) as ScenarioDeconEditsType[];
    const planGraphics: AoiGraphics = {};
    scenarios.forEach((scenario) => {
      if (!scenario.aoiLayerMode) return;

      let aoiLayer: LayerType | undefined = undefined;

      // locate the layer
      if (scenario.aoiLayerMode === 'draw') {
        const aoiEditsLayer = scenario.layers.find(
          (l) => l.layerType === 'Decon Mask',
        );
        aoiLayer = layers.find(
          (l) =>
            l.layerType === 'Decon Mask' &&
            l.layerId === aoiEditsLayer?.layerId,
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

  const [generateRandomMode, setGenerateRandomMode] = useState<
    'draw' | 'file' | ''
  >('draw');
  const [selectedAoiFile, setSelectedAoiFile] = useState<LayerType | null>(
    null,
  );
  const [selectedGsgFile, setSelectedGsgFile] = useState<any | null>(null);

  // get gsg file options
  const [gsgFileOptions] = useState(
    gsgFiles.files.map((file, index) => ({
      label: file.name,
      value: index,
      file,
    })),
  );

  // initialize the selected gsg file
  useEffect(() => {
    if (gsgFiles.selectedIndex === null) return;
    setSelectedGsgFile(gsgFileOptions[gsgFiles.selectedIndex]);
  }, [gsgFileOptions, gsgFiles]);

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

  return (
    <div css={panelContainer}>
      <div>
        <div css={sectionContainer}>
          <h2>Additional Setup</h2>
          <p>Placeholder text...</p>
        </div>

        <AccordionList>
          <AccordionItem
            title={'Characterize Area of Interest'}
            initiallyExpanded={isDecon()}
          >
            <div css={sectionContainer}>
              <p>
                Select "Draw Area of Interest" to draw a boundary on your map to
                designate a decontamination zone or decision unit. The tool will
                retrieve and analyze building data and ground surface
                characteristics to inform decontamination strategy decisions.
                Click Submit to automatically generate a summary of
                contamination scenarios that are present within the designated
                AOI.
              </p>

              <div style={{ display: 'none' }}>
                <input
                  id="draw-aoi"
                  type="radio"
                  name="mode"
                  value="Draw area of Interest"
                  disabled={calculateResultsDecon.status === 'fetching'}
                  checked={generateRandomMode === 'draw'}
                  onChange={(ev) => {
                    if (!selectedScenario) return;
                    setGenerateRandomMode('draw');

                    const maskLayers = layers.filter(
                      (layer) => layer.layerType === 'Decon Mask',
                    );
                    setAoiSketchLayer(maskLayers[0]);

                    setEdits((edits) => {
                      const index = edits.edits.findIndex(
                        (item) =>
                          item.type === 'scenario-decon' &&
                          item.layerId === selectedScenario.layerId,
                      );
                      const editedScenario = edits.edits[
                        index
                      ] as ScenarioDeconEditsType;

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
                  id="decon-mask"
                  title="Draw Decon Mask"
                  className="sketch-button"
                  disabled={calculateResultsDecon.status === 'fetching'}
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
                  disabled={calculateResultsDecon.status === 'fetching'}
                  checked={generateRandomMode === 'file'}
                  onChange={(ev) => {
                    setGenerateRandomMode('file');

                    setAoiSketchLayer(null);

                    let aoiLayer: LayerType | null = null;
                    if (!selectedAoiFile) {
                      const aoiLayers = layers.filter(
                        (layer) => layer.layerType === 'Area of Interest',
                      );
                      aoiLayer = aoiLayers[0];
                      setSelectedAoiFile(aoiLayer);
                    }

                    if (!selectedScenario) return;
                    setEdits((edits) => {
                      const index = edits.edits.findIndex(
                        (item) =>
                          item.type === 'scenario-decon' &&
                          item.layerId === selectedScenario.layerId,
                      );
                      const editedScenario = edits.edits[
                        index
                      ] as ScenarioDeconEditsType;

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

                        if (!selectedScenario) return;
                        setEdits((edits) => {
                          const index = edits.edits.findIndex(
                            (item) =>
                              item.type === 'scenario-decon' &&
                              item.layerId === selectedScenario.layerId,
                          );
                          const editedScenario = edits.edits[
                            index
                          ] as ScenarioDeconEditsType;

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
                        (layer) => layer.layerType === 'Area of Interest',
                      )}
                    />
                    <button
                      css={addButtonStyles}
                      disabled={calculateResultsDecon.status === 'fetching'}
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

              <AccordionList>
                <AccordionItem title="Advanced Options">
                  <label htmlFor="gsg-file-select-input">
                    GSG File (optional)
                    <InfoIcon
                      id={'gsg-file-info-icon'}
                      cssStyles={infoIconStyles}
                      tooltip="Ground Sampled Group (gsg) is a file format used for machine<br/>learning workflows. TODS will use this file for performing<br/>imagery analysis. This file isn't required but providing one<br/>can help the accuracy of the imagery analysis results."
                    />
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
                            selectedIndex: (ev as any)?.value ?? null,
                          };
                        });
                      }}
                      options={gsgFileOptions}
                    />
                    <button
                      css={addButtonStyles}
                      disabled={calculateResultsDecon.status === 'fetching'}
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
                </AccordionItem>
              </AccordionList>

              {generateRandomMode && (
                <Fragment>
                  <br />
                  {calculateResultsDecon.status === 'failure' &&
                    webServiceErrorMessage(calculateResultsDecon.error)}
                  <button
                    css={submitButtonStyles}
                    disabled={calculateResultsDecon.status === 'fetching'}
                    onClick={assessAoi}
                  >
                    {calculateResultsDecon.status !== 'fetching' && 'Submit'}
                    {calculateResultsDecon.status === 'fetching' && (
                      <Fragment>
                        <i className="fas fa-spinner fa-pulse" />
                        &nbsp;&nbsp;Loading...
                      </Fragment>
                    )}
                  </button>
                </Fragment>
              )}
            </div>
          </AccordionItem>
          {appType === 'sampling' && (
            <AccordionItem title="Create Custom Sample Types">
              <div css={sectionContainer}>
                <CustomSampleType
                  appType="sampling"
                  id="plan-custom-sample-types"
                />
              </div>
            </AccordionItem>
          )}
        </AccordionList>
      </div>

      <div css={sectionContainer}>
        <NavigationButton
          goToPanel={appType === 'decon' ? 'decon' : 'locateSamples'}
        />
      </div>
    </div>
  );
}

export default AdditionalSetup;
