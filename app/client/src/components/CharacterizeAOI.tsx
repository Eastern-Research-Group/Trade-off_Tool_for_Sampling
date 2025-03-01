/** @jsxImportSource @emotion/react */

import { Fragment, useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import AoiSketchButton from 'components/AoiSketchButton';
import AoiLayerButtons from 'components/AoiLayerButtons';
import AoiLayerEdit from 'components/AoiLayerEdit';
import AoiLayerSelect from 'components/AoiLayerSelect';
import InfoIcon from 'components/InfoIcon';
import Select from 'components/Select';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { NavigationContext } from 'contexts/Navigation';
import { PlanGraphics, SketchContext } from 'contexts/Sketch';
// utils
import {
  calculateArea,
  createScenarioDeconLayer,
  updateLayerEdits,
} from 'utils/sketchUtils';
// types
import {
  ScenarioDeconEditsType,
  LayerEditsType,
  EditsType,
  LayerAoiAnalysisEditsType,
} from 'types/Edits';
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
import { AppType } from 'types/Navigation';
// styles
import { infoIconStyles, reactSelectStyles } from 'styles';
import { webServiceErrorMessage } from 'config/errorMessages';
import { fetchPost, fetchPostFile } from 'utils/fetchUtils';
import { fetchBuildingData, GsgParam, processScenario } from 'utils/hooks';
import { convertBase64ToFile } from 'utils/utils';
import { useLookupFiles } from 'contexts/LookupFiles';

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

const helpText = `
  Select "Draw Area of Interest" to draw a boundary on your map to<br/>
  designate a decontamination zone or decision unit. The tool will<br/>
  retrieve and analyze building data and ground surface characteristics<br/>
  to inform decontamination strategy decisions. Click Submit to<br/>
  automatically generate a summary of contamination scenarios that are<br/>
  present within the designated AOI.
`;

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

const radioLabelStyles = css`
  padding-left: 0.375rem;
`;

const submitButtonStyles = css`
  display: flex;
  justify-content: flex-end;

  button {
    margin-top: 10px;
  }
`;

// --- components (CharacterizeAOI) ---
type Props = {
  appType: AppType;
  label?: string;
  showHelpText?: boolean;
  showOnEdit?: boolean;
};

function CharacterizeAOI({
  appType,
  label = 'Active AOI Layer',
  showHelpText = true,
  showOnEdit = false,
}: Props) {
  const { calculateResultsDecon, setCalculateResultsDecon } =
    useContext(CalculateContext);
  const { setGoTo, setGoToOptions } = useContext(NavigationContext);
  const {
    aoiCharacterizationData,
    aoiSketchVM,
    deconSketchLayer,
    defaultDeconSelections,
    edits,
    gsgFiles,
    layers,
    layersInitialized,
    map,
    sceneViewForArea,
    selectedScenario,
    setAoiCharacterizationData,
    setAoiSketchLayer,
    setDeconSketchLayer,
    setEdits,
    setGsgFiles,
    setLayers,
  } = useContext(SketchContext);
  const { defaultGsg, services } = useLookupFiles().data;

  const [lastAoiSketchLayer, setLastAoiSketchLayer] =
    useState<__esri.GraphicsLayer | null>(null);
  useEffect(() => {
    if (!aoiSketchVM) return;

    const scenario: ScenarioDeconEditsType | undefined = edits.edits.find(
      (item) => item.type === 'scenario-decon',
    );
    if (!scenario) return;

    const deconLayer = edits.edits.find(
      (l) =>
        scenario.linkedLayerIds.includes(l.layerId) &&
        l.type === 'layer-aoi-analysis',
    ) as LayerAoiAnalysisEditsType;
    if (!deconLayer) return;

    const aoiEditsLayer = deconLayer.layers.find(
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
  }, [aoiSketchVM, edits, lastAoiSketchLayer, layers]);

  async function assessAoi() {
    if (!deconSketchLayer || !deconSketchLayer.aoiLayerMode) return;

    // const planGraphics: AoiGraphics = {};
    let aoiLayer: LayerType | undefined = undefined;

    // locate the layer
    if (deconSketchLayer.aoiLayerMode === 'draw') {
      const aoiEditsLayer = deconSketchLayer.layers.find(
        (l) => l.layerType === 'Decon Mask',
      );
      aoiLayer = layers.find(
        (l) =>
          l.layerType === 'Decon Mask' && l.layerId === aoiEditsLayer?.layerId,
      );
    }

    if (
      deconSketchLayer.aoiLayerMode === 'file' &&
      deconSketchLayer.importedAoiLayer
    ) {
      // locate the layer
      aoiLayer = layers.find(
        (l) =>
          l.layerType === 'Area of Interest' &&
          l.layerId === deconSketchLayer.importedAoiLayer?.layerId,
      );
    }

    const aoiGraphics: __esri.Graphic[] = [];
    if (aoiLayer?.sketchLayer && aoiLayer.sketchLayer.type === 'graphics') {
      aoiGraphics.push(...aoiLayer.sketchLayer.graphics.toArray());
    }

    if (aoiGraphics.length === 0 || !deconSketchLayer) return;

    setAoiCharacterizationData({
      status: 'fetching',
      planGraphics: {},
    });

    const responseIndexes: string[] = [];
    const planGraphics: PlanGraphics = {};
    let planAoiArea = 0;
    for (const graphic of aoiGraphics) {
      const areaSM = await calculateArea(graphic, sceneViewForArea);
      if (typeof areaSM === 'number') {
        planAoiArea += areaSM;
        graphic.attributes.AREA = areaSM;
      }

      responseIndexes.push(deconSketchLayer.layerId);
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        planGraphics,
        deconSketchLayer.layerId,
      )
    ) {
      planGraphics[deconSketchLayer.layerId] = {
        graphics: [],
        imageGraphics: [],
        aoiArea: planAoiArea,
        buildingFootprint: 0,
        summary: {
          totalAoiSqM: planAoiArea,
          totalBuildingFootprintSqM: 0,
          totalBuildingFloorsSqM: 0,
          totalBuildingSqM: 0,
          totalBuildingExtWallsSqM: 0,
          totalBuildingIntWallsSqM: 0,
          totalBuildingRoofSqM: 0,
        },
        aoiPercentages: {
          numAois: 0,
          asphalt: 0,
          concrete: 0,
          soil: 0,
        },
      };
    } else {
      planGraphics[deconSketchLayer.layerId].aoiArea = planAoiArea;
      planGraphics[deconSketchLayer.layerId].summary.totalAoiSqM = planAoiArea;
    }

    try {
      let gsgFile;
      if (gsgFiles && gsgFiles.selectedIndex !== null) {
        const file = gsgFiles.files[gsgFiles.selectedIndex];
        gsgFile = await convertBase64ToFile(file.file, file.path);
      } else {
        gsgFile = await convertBase64ToFile(defaultGsg, 'defaultGsg.gsg');
      }

      const gsgFileUploaded: any = await fetchPostFile(
        `${services.totsGPServer}/uploads/upload`,
        {
          f: 'json',
        },
        gsgFile,
      );
      const gsgParam: GsgParam = {
        itemID: gsgFileUploaded.item.itemID,
      };

      // TODO - look into adding more queries here
      await fetchBuildingData(
        aoiGraphics,
        services,
        planGraphics,
        responseIndexes,
        gsgParam,
        sceneViewForArea,
        true,
      );

      if (gsgParam) {
        await fetchPost(
          `${services.totsGPServer}/uploads/${gsgParam.itemID}/delete`,
          {
            f: 'json',
          },
        );
      }

      let editsCopy: EditsType = edits;
      const newDeconTechSelections = processScenario(
        deconSketchLayer,
        {
          status: 'success',
          planGraphics,
        },
        {},
        {},
        defaultDeconSelections,
      );

      // Figure out what to add graphics to
      const aoiAssessed = deconSketchLayer.layers.find(
        (l) => l.layerType === 'AOI Assessed',
      );
      const imageAnalysis = deconSketchLayer.layers.find(
        (l: any) => l.layerType === 'Image Analysis',
      );
      const deconAoi = deconSketchLayer.layers.find(
        (l: any) => l.layerType === 'Decon Mask',
      );

      if (aoiAssessed && imageAnalysis && deconAoi) {
        const aoiAssessedLayer = layers.find(
          (l) => l.layerId === aoiAssessed.layerId,
        );
        const imageAnalysisLayer = layers.find(
          (l: any) => l.layerId === imageAnalysis.layerId,
        );
        const deconAoiLayer = layers.find(
          (l: any) => l.layerId === deconAoi.layerId,
        );

        // tie graphics and imageryGraphics to a scenario
        const planData = planGraphics[deconSketchLayer.layerId];
        if (
          aoiAssessedLayer?.sketchLayer?.type === 'graphics' &&
          planData?.graphics
        ) {
          aoiAssessedLayer.sketchLayer.graphics.removeAll();
          aoiAssessedLayer.sketchLayer.graphics.addMany(planData.graphics);

          editsCopy = updateLayerEdits({
            appType: 'decon',
            edits: editsCopy,
            layer: aoiAssessedLayer,
            type: 'replace',
            changes: planData.graphics,
          });
        }
        if (
          imageAnalysisLayer?.sketchLayer?.type === 'graphics' &&
          planData?.imageGraphics
        ) {
          imageAnalysisLayer?.sketchLayer.graphics.removeAll();
          imageAnalysisLayer?.sketchLayer.graphics.addMany(
            planData.imageGraphics,
          );

          editsCopy = updateLayerEdits({
            appType: 'decon',
            edits: editsCopy,
            layer: imageAnalysisLayer,
            type: 'replace',
            changes: planData.imageGraphics,
          });
        }
        if (deconAoiLayer) {
          if (deconAoiLayer.sketchLayer)
            deconAoiLayer.sketchLayer.visible = false;
          editsCopy = updateLayerEdits({
            appType: 'decon',
            edits: editsCopy,
            layer: deconAoiLayer,
            type: 'properties',
          });
        }

        const aoiAnalysis = editsCopy.edits.find(
          (e) =>
            e.type === 'layer-aoi-analysis' &&
            e.layerId === deconSketchLayer.layerId,
        ) as LayerAoiAnalysisEditsType | undefined;
        if (aoiAnalysis) {
          aoiAnalysis.aoiPercentages = {
            asphalt: planData.aoiPercentages.asphalt,
            concrete: planData.aoiPercentages.concrete,
            numAois: planData.aoiPercentages.numAois,
            soil: planData.aoiPercentages.soil,
          };
          aoiAnalysis.aoiSummary = {
            totalAoiSqM: planData.summary.totalAoiSqM,
            totalBuildingExtWallsSqM: planData.summary.totalBuildingExtWallsSqM,
            totalBuildingFloorsSqM: planData.summary.totalBuildingFloorsSqM,
            totalBuildingFootprintSqM:
              planData.summary.totalBuildingFootprintSqM,
            totalBuildingIntWallsSqM: planData.summary.totalBuildingIntWallsSqM,
            totalBuildingRoofSqM: planData.summary.totalBuildingRoofSqM,
            totalBuildingSqM: planData.summary.totalBuildingSqM,
            areaByMedia: newDeconTechSelections.map((media: any) => {
              return {
                id: media.id,
                media: media.media,
                pctAoi: media.pctAoi,
                surfaceArea: media.surfaceArea,
              };
            }),
          };

          editsCopy.edits.forEach((edit) => {
            if (
              edit.type !== 'layer-decon' ||
              edit.analysisLayerId !== aoiAnalysis?.layerId
            )
              return;

            edit.deconTechSelections = edit.deconTechSelections.map((tech) => {
              const media = newDeconTechSelections.find(
                (a) => a.media === tech.media,
              );

              let pctAoi = tech.pctAoi;
              let surfaceArea = tech.surfaceArea;
              if (media) {
                pctAoi = media.pctAoi;
                surfaceArea = media.surfaceArea;
              }

              return {
                ...tech,
                pctAoi,
                surfaceArea,
              };
            });
          });
        }
      }

      setEdits(editsCopy);

      setAoiCharacterizationData({
        status: 'success',
        planGraphics,
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
    } catch (ex: any) {
      console.error(ex);
      setAoiCharacterizationData({
        status: 'failure',
        planGraphics: {},
      });
    }

    setAddScenarioVisible(false);
    setEditScenarioVisible(false);
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

  // useEffect(() => {
  //   if (!selectedScenario || selectedScenario.type !== 'scenario-decon' || selectedScenario.linkedLayerIds.length > 0) {
  //     setSelectedAoiFile(null);
  //     setGenerateRandomMode('draw');
  //     return;
  //   }

  //   if (
  //     selectedScenario.type !== 'scenario-decon' ||
  //     !selectedScenario?.layers[0]?.importedAoiLayer
  //   )
  //     return;

  //   // find the layer
  //   const layer = layers.find(
  //     (l) => l.layerId === selectedScenario.layers[0].importedAoiLayer?.layerId,
  //   );
  //   if (layer) setSelectedAoiFile(layer);
  // }, [layers, selectedScenario]);

  const [addScenarioVisible, setAddScenarioVisible] = useState(false);
  const [editScenarioVisible, setEditScenarioVisible] = useState(false);

  // get decon layers for showing in select
  const [deconLayers, setDeconLayers] = useState<LayerAoiAnalysisEditsType[]>(
    [],
  );
  const [initializedLayers, setInitializedLayers] = useState(false);
  useEffect(() => {
    if (!layersInitialized) return;

    const newDeconLayers: LayerAoiAnalysisEditsType[] = [];
    edits.edits.forEach((edit) => {
      if (edit.type === 'layer-aoi-analysis')
        newDeconLayers.push(edit as LayerAoiAnalysisEditsType);
    });
    setDeconLayers(newDeconLayers);
    setInitializedLayers(true);
  }, [edits, layersInitialized]);

  const [initializedDeconLayer, setInitializedDeconLayer] = useState(false);
  useEffect(() => {
    if (
      deconSketchLayer ||
      initializedDeconLayer ||
      !initializedLayers ||
      !layersInitialized ||
      !map
    )
      return;

    setInitializedDeconLayer(true);

    if (deconLayers.length > 0) {
      setDeconSketchLayer(deconLayers[0]);
    } else {
      const {
        layers: newLayers,
        groupLayer,
        layerDecon,
        layerAoiAnalysis,
        sketchLayer,
        tempDeconLayer,
        tempAssessedAoiLayer,
        tempImageAnalysisLayer,
        tempCharacterizeAoiLayer,
      } = createScenarioDeconLayer(defaultDeconSelections);

      // make a copy of the edits context variable
      setEdits((edits) => {
        const newEdits = edits.edits.filter((edit) => {
          const idx = newLayers.findIndex((l) => l.layerId === edit.layerId);

          return idx === -1;
        });

        return {
          count: edits.count + 1,
          edits: [...newEdits, layerAoiAnalysis, layerDecon],
        };
      });

      setDeconSketchLayer(layerAoiAnalysis);

      const tLayers = [...layers];
      if (tempCharacterizeAoiLayer) tLayers.push(tempCharacterizeAoiLayer);
      if (sketchLayer) tLayers.push(sketchLayer);
      if (tempImageAnalysisLayer) tLayers.push(tempImageAnalysisLayer);
      if (tempAssessedAoiLayer) tLayers.push(tempAssessedAoiLayer);
      if (tempDeconLayer) tLayers.push(tempDeconLayer);

      // update layers (set parent layer)
      window.totsLayers = tLayers;
      setLayers(tLayers);

      // add the scenario group layer to the map
      map.add(groupLayer);
    }
  }, [
    deconLayers,
    deconSketchLayer,
    defaultDeconSelections,
    initializedDeconLayer,
    initializedLayers,
    layers,
    layersInitialized,
    map,
    setDeconSketchLayer,
    setEdits,
    setLayers,
  ]);

  const [newDeconLayerName, setNewDeconLayerName] = useState('');

  useEffect(() => {
    setNewDeconLayerName(deconSketchLayer?.name ?? '');
  }, [deconSketchLayer]);

  const sketchLayerDef = layers.find((l) => {
    const aoiEditsLayer = deconSketchLayer?.layers.find(
      (l) => l.layerType === 'Decon Mask',
    );
    if (!aoiEditsLayer) return false;
    return l.layerType === 'Decon Mask' && l.layerId === aoiEditsLayer?.layerId;
  });
  const sketchLayer = sketchLayerDef?.sketchLayer;

  return (
    <Fragment>
      {showHelpText && <p>{helpText.replaceAll('<br/>', '')}</p>}

      <AoiLayerSelect
        addScenarioVisible={addScenarioVisible}
        deconLayers={deconLayers}
        editScenarioVisible={editScenarioVisible}
        extraLabelContent={
          <AoiLayerButtons
            addScenarioVisible={addScenarioVisible}
            deconLayers={deconLayers}
            editScenarioVisible={editScenarioVisible}
            setAddScenarioVisible={setAddScenarioVisible}
            setNewDeconLayerName={setNewDeconLayerName}
            setDeconLayers={setDeconLayers}
            setEditScenarioVisible={setEditScenarioVisible}
          />
        }
        label={label}
        setAddScenarioVisible={setAddScenarioVisible}
        setNewDeconLayerName={setNewDeconLayerName}
        setDeconLayers={setDeconLayers}
        setEditScenarioVisible={setEditScenarioVisible}
      />

      <AoiLayerEdit
        addScenarioVisible={addScenarioVisible}
        appType={appType}
        editScenarioVisible={editScenarioVisible}
        newDeconLayerName={newDeconLayerName}
        setAddScenarioVisible={setAddScenarioVisible}
        setDeconLayers={setDeconLayers}
        setEditScenarioVisible={setEditScenarioVisible}
        setNewDeconLayerName={setNewDeconLayerName}
      />

      {(!showOnEdit ||
        (showOnEdit && (addScenarioVisible || editScenarioVisible))) && (
        <Fragment>
          {showOnEdit && (
            <div
              css={css`
                margin-top: 0.5rem;
              `}
            >
              <strong>Characterize Area of Interest</strong>
              <InfoIcon
                cssStyles={infoIconStyles}
                id="characterize-aoi-help-icon"
                tooltip={helpText}
                place="right"
              />
            </div>
          )}

          <div style={{ display: 'none' }}>
            <input
              id="draw-aoi"
              type="radio"
              name="mode"
              value="Draw area of Interest"
              disabled={calculateResultsDecon.status === 'fetching'}
              checked={generateRandomMode === 'draw'}
              onChange={(_ev) => {
                if (!deconSketchLayer) return;
                setGenerateRandomMode('draw');

                const aoiLayer = deconSketchLayer.layers.find(
                  (l) => l.layerType === 'Decon Mask',
                );
                if (!aoiLayer) return;

                const maskLayer = layers.find(
                  (layer) =>
                    layer.layerType === 'Decon Mask' &&
                    layer.layerId === aoiLayer?.layerId,
                );
                if (maskLayer) setAoiSketchLayer(maskLayer);

                setEdits((edits) => {
                  const index = edits.edits.findIndex(
                    (item) =>
                      item.type === 'layer-aoi-analysis' &&
                      item.layerId === deconSketchLayer.layerId,
                  );
                  const editedAoiAnalysis = edits.edits[
                    index
                  ] as LayerAoiAnalysisEditsType;

                  editedAoiAnalysis.aoiLayerMode = 'draw';

                  return {
                    count: edits.count + 1,
                    edits: [
                      ...edits.edits.slice(0, index),
                      editedAoiAnalysis,
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
            <AoiSketchButton sketchLayer={sketchLayer} />
          )}

          <div style={{ display: 'none' }}>
            <input
              id="use-aoi-file"
              type="radio"
              name="mode"
              value="Use Imported Area of Interest"
              disabled={calculateResultsDecon.status === 'fetching'}
              checked={generateRandomMode === 'file'}
              onChange={(_ev) => {
                if (!deconSketchLayer) return;

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

                setEdits((edits) => {
                  const index = edits.edits.findIndex(
                    (item) =>
                      item.type === 'layer-aoi-analysis' &&
                      item.layerId === deconSketchLayer.layerId,
                  );
                  const editedAoiAnalysis = edits.edits[
                    index
                  ] as LayerAoiAnalysisEditsType;

                  const importedAoi = edits.edits.find(
                    (l) =>
                      aoiLayer &&
                      l.type === 'layer' &&
                      l.layerType === 'Area of Interest' &&
                      l.layerId === aoiLayer.layerId,
                  );

                  if (importedAoi)
                    editedAoiAnalysis.importedAoiLayer =
                      importedAoi as LayerEditsType;

                  editedAoiAnalysis.aoiLayerMode = 'file';

                  return {
                    count: edits.count + 1,
                    edits: [
                      ...edits.edits.slice(0, index),
                      editedAoiAnalysis,
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

                    if (!deconSketchLayer) return;
                    setEdits((edits) => {
                      const index = edits.edits.findIndex(
                        (item) =>
                          item.type === 'layer-aoi-analysis' &&
                          item.layerId === deconSketchLayer.layerId,
                      );
                      const editedAoiAnalysis = edits.edits[
                        index
                      ] as LayerAoiAnalysisEditsType;

                      const importedAoi = edits.edits.find(
                        (l) =>
                          l.type === 'layer' &&
                          l.layerType === 'Area of Interest' &&
                          l.layerId === (ev as LayerType).layerId,
                      );

                      if (importedAoi)
                        editedAoiAnalysis.importedAoiLayer =
                          importedAoi as LayerEditsType;
                      return {
                        count: edits.count + 1,
                        edits: [
                          ...edits.edits.slice(0, index),
                          editedAoiAnalysis,
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
                  onClick={(_ev) => {
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
                  onClick={(_ev) => {
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
              {calculateResultsDecon.status === 'failure' &&
                webServiceErrorMessage(calculateResultsDecon.error)}
              <div css={submitButtonStyles}>
                <button
                  disabled={calculateResultsDecon.status === 'fetching'}
                  onClick={assessAoi}
                >
                  {aoiCharacterizationData.status !== 'fetching' && 'Submit'}
                  {aoiCharacterizationData.status === 'fetching' && (
                    <Fragment>
                      <i className="fas fa-spinner fa-pulse" />
                      &nbsp;&nbsp;Loading...
                    </Fragment>
                  )}
                </button>
              </div>
            </Fragment>
          )}
        </Fragment>
      )}
    </Fragment>
  );
}

export default CharacterizeAOI;
