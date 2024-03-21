/** @jsxImportSource @emotion/react */

import React, { useContext, useEffect, useRef, useState } from 'react';
import { css } from '@emotion/react';
import { useWindowSize } from '@reach/window-size';
// components
import NavBar from 'components/NavBar';
import Toolbar from 'components/Toolbar';
import SplashScreen from 'components/SplashScreen';
import TestingToolbar from 'components/TestingToolbar';
import Map from 'components/Map';
import { ReactTable } from 'components/ReactTable';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { DialogContext } from 'contexts/Dialog';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// utilities
import { useSessionStorage } from 'utils/hooks';
import { getSampleTableColumns } from 'utils/sketchUtils';
import { parseSmallFloat } from 'utils/utils';
// config
import { navPanelWidth } from 'config/appConfig';
import { ScenarioEditsType } from 'types/Edits';

const resizerHeight = 10;
const esrifooterheight = 16;
const expandButtonHeight = 32;
const minMapHeight = 180;
var startY = 0;

const appStyles = (offset: number) => css`
  display: flex;
  flex-direction: column;
  height: calc(100vh - ${offset}px);
  min-height: 675px;
  width: 100%;
`;

const containerStyles = css`
  height: 100%;
  position: relative;
`;

const mapPanelStyles = (tableHeight: number) => css`
  float: right;
  position: relative;
  height: calc(100% - ${tableHeight}px);
  width: calc(100% - ${navPanelWidth});
`;

const mapHeightStyles = css`
  height: 100%;
`;

const floatPanelStyles = ({
  width,
  height,
  left,
  expanded,
  zIndex,
}: {
  width: number;
  height: number;
  left: string;
  expanded: boolean;
  zIndex: number;
}) => {
  return css`
    display: ${expanded ? 'block' : 'none'};
    z-index: ${zIndex};
    position: absolute;
    height: ${height}px;
    bottom: 0;
    left: ${left};
    width: calc(100% - ${width}px);
    pointer-events: none;
    overflow: hidden;
  `;
};

const floatButtonPanelStyles = ({
  width,
  height,
  left,
  expanded,
  zIndex,
}: {
  width: number;
  height: number;
  left: string;
  expanded: boolean;
  zIndex: number;
}) => {
  return css`
    display: flex;
    z-index: ${zIndex};
    position: absolute;
    height: 32px;
    bottom: ${(expanded ? height : 0) + esrifooterheight}px;
    left: ${left};
    width: calc(100% - ${width}px);
    pointer-events: none;
    justify-content: center;
  `;
};

const floatPanelContentStyles = (includeOverflow: boolean = true) => {
  return css`
    float: left;
    position: relative;
    height: 100%;
    ${includeOverflow ? 'overflow: auto;' : ''}
    pointer-events: all;
    /* styles to be overridden */
    width: 100%;
    color: black;
    background-color: white;
  `;
};

const floatPanelScrollContainerStyles = css`
  height: 100%;
`;

const collapsePanelButton = css`
  margin: 0;
  height: ${expandButtonHeight}px;
  width: 64px;
  border-radius: 0;
  background-color: white;
  color: black;
  pointer-events: all;
`;

const resizerContainerStyles = css`
  height: ${resizerHeight}px;
  width: 100%;
  display: flex;
  justify-content: center;
  pointer-events: auto;
  cursor: row-resize;
`;

const resizerButtonStyles = css`
  height: 2px;
  width: 25px;
  margin-top: 4px;
  background: #b0b0b0 none;
`;

const tablePanelHeaderStyles = css`
  height: 30px;
  width: 100%;
  color: #444;
  background-color: #efefef;
  border: 1px solid #afafaf;
  padding: 0;
`;

const sampleTableHeaderStyles = css`
  margin: 0 10px;
  font-weight: bold;
`;

const zoomButtonContainerStyles = css`
  text-align: center;
`;

const zoomButtonStyles = css`
  background-color: transparent;
  color: black;
  margin: 0;
  padding: 3px 6px;
  font-size: 16px;
`;

function App() {
  const { calculateResults } = useContext(CalculateContext);
  const {
    currentPanel,
    panelExpanded,
    resultsExpanded,
    tablePanelExpanded,
    setTablePanelExpanded,
    tablePanelHeight,
    setTablePanelHeight,
    // trainingMode,
  } = useContext(NavigationContext);
  const {
    displayDimensions,
    edits,
    layers,
    map,
    mapView,
    sceneView,
    selectedSampleIds,
    setSelectedSampleIds,
    // selectedScenario,
  } = useContext(SketchContext);

  useSessionStorage();

  const { height, width } = useWindowSize();

  // calculate height of div holding actions info
  const [contentHeight, setContentHeight] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mapRef?.current) return;

    // adjust the table height if necessary
    const maxTableHeight =
      contentHeight - esrifooterheight - toolbarHeight - expandButtonHeight;
    if (maxTableHeight > 0 && tablePanelHeight >= maxTableHeight) {
      setTablePanelHeight(maxTableHeight);
    }
  }, [
    width,
    height,
    mapRef,
    contentHeight,
    tablePanelHeight,
    setTablePanelHeight,
    toolbarHeight,
  ]);

  // calculate height of div holding actions info
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toolbarRef?.current) return;

    const barHeight = toolbarRef.current.getBoundingClientRect().height;
    if (toolbarHeight !== barHeight) setToolbarHeight(barHeight);
  }, [width, height, toolbarRef, toolbarHeight]);

  const [
    sizeCheckInitialized,
    setSizeCheckInitialized, //
  ] = useState(false);
  const { setOptions } = useContext(DialogContext);
  useEffect(() => {
    if (sizeCheckInitialized) return;

    if (width < 1024 || height < 600) {
      setOptions({
        title: '',
        ariaLabel: 'Small Screen Warning',
        description:
          'This site contains data uploading and map editing features best used in a desktop web browser.',
      });
    }

    setSizeCheckInitialized(true);
  }, [width, height, sizeCheckInitialized, setOptions]);

  const totsRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!totsRef?.current) return;

    const offsetTop = totsRef.current.offsetTop;
    const clientHeight = totsRef.current.clientHeight;
    if (contentHeight !== clientHeight) setContentHeight(clientHeight);
    if (offset !== offsetTop) setOffset(offsetTop);
  }, [contentHeight, height, offset, totsRef, width]);

  // count the number of samples
  const sampleData: any[] = [];
  const scenarios = edits.edits.filter(
    (e) => e.type === 'scenario',
  ) as ScenarioEditsType[];
  scenarios.forEach((scenario) => {
    const aoiAssessed = scenario.layers.find(
      (l) => l.layerType === 'AOI Assessed',
    );
    const aoiAssessedLayer = layers.find(
      (l) =>
        l.layerType === 'AOI Assessed' && l.layerId === aoiAssessed?.layerId,
    );
    if (!aoiAssessedLayer) return;

    (aoiAssessedLayer.sketchLayer as __esri.GraphicsLayer).graphics.forEach(
      (sample) => {
        sampleData.push({
          graphic: sample,
          ...sample.attributes,
          ground_elv: parseSmallFloat(
            sample.attributes.ground_elv,
            2,
          ).toLocaleString(),
          ground_elv_m: parseSmallFloat(
            sample.attributes.ground_elv_m,
            2,
          ).toLocaleString(),
          footprintSqM: parseSmallFloat(
            sample.attributes.footprintSqM,
            2,
          ).toLocaleString(),
          floorsSqM: parseSmallFloat(
            sample.attributes.floorsSqM,
            2,
          ).toLocaleString(),
          totalSqM: parseSmallFloat(
            sample.attributes.totalSqM,
            2,
          ).toLocaleString(),
          extWallsSqM: parseSmallFloat(
            sample.attributes.extWallsSqM,
            2,
          ).toLocaleString(),
          intWallsSqM: parseSmallFloat(
            sample.attributes.intWallsSqM,
            2,
          ).toLocaleString(),
          roofSqM: parseSmallFloat(
            sample.attributes.roofSqM,
            2,
          ).toLocaleString(),
          footprintSqFt: parseSmallFloat(
            sample.attributes.footprintSqFt,
            2,
          ).toLocaleString(),
          floorsSqFt: parseSmallFloat(
            sample.attributes.floorsSqFt,
            2,
          ).toLocaleString(),
          extWallsSqFt: parseSmallFloat(
            sample.attributes.extWallsSqFt,
            2,
          ).toLocaleString(),
          intWallsSqFt: parseSmallFloat(
            sample.attributes.intWallsSqFt,
            2,
          ).toLocaleString(),
        });
      },
    );
  });

  // map?.layers.forEach((layer) => {
  //   if (layer.id !== selectedScenario?.layerId) return;
  //   if (layer.type !== 'group') return;
  //   (layer as __esri.GroupLayer).layers.forEach((layer) => {
  //     if (layer.title !== 'AOI Assessment') return;

  //     const graphics = (layer as __esri.GraphicsLayer).graphics.toArray();
  //     graphics.forEach((sample) => {
  //       sampleData.push({
  //         graphic: sample,
  //         ...sample.attributes,
  //         ground_elv: parseSmallFloat(
  //           sample.attributes.ground_elv,
  //           2,
  //         ).toLocaleString(),
  //         ground_elv_m: parseSmallFloat(
  //           sample.attributes.ground_elv_m,
  //           2,
  //         ).toLocaleString(),
  //         footprintSqM: parseSmallFloat(
  //           sample.attributes.footprintSqM,
  //           2,
  //         ).toLocaleString(),
  //         floorsSqM: parseSmallFloat(
  //           sample.attributes.floorsSqM,
  //           2,
  //         ).toLocaleString(),
  //         totalSqM: parseSmallFloat(
  //           sample.attributes.totalSqM,
  //           2,
  //         ).toLocaleString(),
  //         extWallsSqM: parseSmallFloat(
  //           sample.attributes.extWallsSqM,
  //           2,
  //         ).toLocaleString(),
  //         intWallsSqM: parseSmallFloat(
  //           sample.attributes.intWallsSqM,
  //           2,
  //         ).toLocaleString(),
  //         roofSqM: parseSmallFloat(
  //           sample.attributes.roofSqM,
  //           2,
  //         ).toLocaleString(),
  //         footprintSqFt: parseSmallFloat(
  //           sample.attributes.footprintSqFt,
  //           2,
  //         ).toLocaleString(),
  //         floorsSqFt: parseSmallFloat(
  //           sample.attributes.floorsSqFt,
  //           2,
  //         ).toLocaleString(),
  //         extWallsSqFt: parseSmallFloat(
  //           sample.attributes.extWallsSqFt,
  //           2,
  //         ).toLocaleString(),
  //         intWallsSqFt: parseSmallFloat(
  //           sample.attributes.intWallsSqFt,
  //           2,
  //         ).toLocaleString(),
  //       });
  //     });
  //   });
  // });

  // calculate the width of the table
  let tablePanelWidth = 150;
  if (currentPanel && panelExpanded) tablePanelWidth += 325;
  if (
    resultsExpanded &&
    currentPanel?.value === 'calculate' &&
    calculateResults.panelOpen === true
  ) {
    tablePanelWidth += 500;
  }

  // determine which rows of the table should be selected
  const ids: { [key: string]: boolean } = {};
  let selectionMethod: 'row-click' | 'sample-click' = 'sample-click';
  sampleData.forEach((sample, index) => {
    const selectedIndex = selectedSampleIds.findIndex(
      (item) => item.PERMANENT_IDENTIFIER === sample.PERMANENT_IDENTIFIER,
    );
    const selectedItem = selectedSampleIds.find(
      (item) => item.PERMANENT_IDENTIFIER === sample.PERMANENT_IDENTIFIER,
    );
    if (selectedItem && selectedIndex !== -1) {
      ids[selectedItem.PERMANENT_IDENTIFIER] = true;
      selectionMethod = selectedSampleIds[selectedIndex].selection_method;
    }
  });
  const initialSelectedRowIds = {
    selectionMethod,
    ids,
  };

  return (
    <div className="tots" ref={totsRef}>
      <SplashScreen />
      <div css={appStyles(offset)}>
        <div css={containerStyles}>
          <div ref={toolbarRef}>
            {window.location.search.includes('devMode=true') && (
              <TestingToolbar />
            )}
            <Toolbar map={map} mapView={mapView} sceneView={sceneView} />
          </div>
          <NavBar height={contentHeight - toolbarHeight} />
          <div
            css={mapPanelStyles(
              toolbarHeight + (tablePanelExpanded ? tablePanelHeight : 0),
            )}
            ref={mapRef}
          >
            <div id="tots-map-div" css={mapHeightStyles}>
              {toolbarHeight && (
                <Map
                  height={
                    contentHeight -
                    (tablePanelExpanded ? tablePanelHeight : 0) -
                    toolbarHeight
                  }
                />
              )}
            </div>
          </div>
          {sampleData.length > 0 && (
            <div
              id="tots-table-button-div"
              css={floatButtonPanelStyles({
                width: tablePanelWidth,
                height: tablePanelHeight,
                left: `${tablePanelWidth}px`,
                expanded: tablePanelExpanded,
                zIndex: 1,
              })}
            >
              <button
                css={collapsePanelButton}
                aria-label={`${
                  tablePanelExpanded ? 'Collapse' : 'Expand'
                } Table Panel`}
                onClick={() => setTablePanelExpanded(!tablePanelExpanded)}
              >
                <i
                  className={
                    tablePanelExpanded
                      ? 'fas fa-chevron-down'
                      : 'fas fa-chevron-up'
                  }
                />
              </button>
            </div>
          )}
          {tablePanelExpanded && (
            <div
              id="tots-table-div"
              css={floatPanelStyles({
                width: tablePanelWidth,
                height: tablePanelHeight,
                left: `${tablePanelWidth}px`,
                expanded: true,
                zIndex: 2,
              })}
            >
              <div css={floatPanelContentStyles(false)}>
                <div
                  css={resizerContainerStyles}
                  onMouseDown={(e) => {
                    e = e || window.event;
                    e.preventDefault();
                    startY = e.clientY;

                    const mapDiv = document.getElementById('tots-map-div'); // adjust height
                    const tableDiv = document.getElementById('tots-table-div'); // adjust height
                    const reactTableElm =
                      document.getElementById('tots-samples-table');
                    const buttonDiv = document.getElementById(
                      'tots-table-button-div',
                    ); // move top

                    let mapHeight = 0;
                    let tableHeight = 0;
                    if (!mapDiv || !tableDiv || !buttonDiv) return;

                    mapHeight = mapDiv.clientHeight;
                    tableHeight = tableDiv.clientHeight;

                    document.onmouseup = () => {
                      /* stop moving when mouse button is released:*/
                      document.onmouseup = null;
                      document.onmousemove = null;

                      // clear the styles set
                      tableDiv.style.height = '';
                      mapDiv.style.height = '';
                      buttonDiv.style.bottom = '';
                    };
                    // call a function whenever the cursor moves:
                    document.onmousemove = (e: MouseEvent) => {
                      e = e || window.event;
                      e.preventDefault();

                      if (!mapDiv || !tableDiv || !buttonDiv) return;

                      // get size info
                      const panelHeight = contentHeight - toolbarHeight;
                      const mouseOffset = startY - e.clientY;
                      let newMapHeight = mapHeight - mouseOffset;
                      let newTableHeight = tableHeight + mouseOffset;
                      const maxTableHeight = panelHeight - minMapHeight;

                      // prevent map being taller then content box
                      if (newMapHeight + resizerHeight >= contentHeight) {
                        newMapHeight = contentHeight - resizerHeight;
                        newTableHeight = resizerHeight;
                      }

                      // prevent table being taller then content box
                      if (newTableHeight >= maxTableHeight) {
                        newMapHeight = contentHeight - maxTableHeight;
                        newTableHeight = maxTableHeight;
                      }

                      // set the height directly for faster performance
                      mapDiv.style.height = `${newMapHeight}px`;
                      tableDiv.style.height = `${newTableHeight}px`;
                      buttonDiv.style.bottom = `${
                        newTableHeight + esrifooterheight
                      }px`;

                      if (reactTableElm) {
                        reactTableElm.style.height = `${
                          newTableHeight - resizerHeight - 30
                        }px`;
                      }

                      setTablePanelHeight(tableDiv.clientHeight);
                    };
                  }}
                >
                  <div css={resizerButtonStyles}></div>
                </div>
                <div
                  id="tots-attributes-panel-scroll-container"
                  css={floatPanelScrollContainerStyles}
                >
                  <div css={tablePanelHeaderStyles}>
                    <span css={sampleTableHeaderStyles}>
                      Samples (Count: {sampleData.length})
                    </span>
                  </div>
                  <div>
                    <ReactTable
                      id="tots-samples-table"
                      data={sampleData}
                      idColumn={'bid'}
                      striped={true}
                      height={tablePanelHeight - resizerHeight - 30}
                      initialSelectedRowIds={initialSelectedRowIds}
                      onSelectionChange={(row: any) => {
                        const PERMANENT_IDENTIFIER =
                          row.original.PERMANENT_IDENTIFIER;
                        const DECISIONUNITUUID = row.original.DECISIONUNITUUID;
                        setSelectedSampleIds((selectedSampleIds) => {
                          if (
                            selectedSampleIds.findIndex(
                              (item) =>
                                item.PERMANENT_IDENTIFIER ===
                                PERMANENT_IDENTIFIER,
                            ) !== -1
                          ) {
                            const samples = selectedSampleIds.filter(
                              (item) =>
                                item.PERMANENT_IDENTIFIER !==
                                PERMANENT_IDENTIFIER,
                            );

                            return samples.map((sample) => {
                              return {
                                PERMANENT_IDENTIFIER,
                                DECISIONUNITUUID,
                                selection_method: 'row-click',
                                graphic: sample.graphic,
                              };
                            });
                          }

                          return [
                            // ...selectedSampleIds, // Uncomment this line to allow multiple selections
                            {
                              PERMANENT_IDENTIFIER,
                              DECISIONUNITUUID,
                              selection_method: 'row-click',
                              graphic: row.original.graphic,
                            },
                          ];
                        });
                      }}
                      sortBy={[
                        {
                          id: 'cbfips',
                          desc: false,
                        },
                        {
                          id: 'bldgtype',
                          desc: false,
                        },
                        {
                          id: 'bid',
                          desc: false,
                        },
                      ]}
                      getColumns={(tableWidth: any) => {
                        return [
                          {
                            Header: () => null,
                            id: 'zoom-button',
                            renderCell: true,
                            width: 30,
                            Cell: ({ row }: { row: any }) => (
                              <div css={zoomButtonContainerStyles}>
                                <button
                                  css={zoomButtonStyles}
                                  onClick={(event) => {
                                    event.stopPropagation();

                                    // select the sample
                                    setSelectedSampleIds([
                                      {
                                        PERMANENT_IDENTIFIER:
                                          row.original.PERMANENT_IDENTIFIER,
                                        DECISIONUNITUUID:
                                          row.original.DECISIONUNITUUID,
                                        selection_method: 'row-click',
                                        graphic: row.original.graphic,
                                      },
                                    ]);

                                    // zoom to the graphic
                                    if (displayDimensions === '2d' && mapView) {
                                      mapView.goTo(row.original.graphic);
                                      mapView.zoom = 16;
                                    } else if (
                                      displayDimensions === '3d' &&
                                      sceneView
                                    ) {
                                      sceneView.goTo(row.original.graphic);
                                    }
                                  }}
                                >
                                  <i className="fas fa-search-plus" />
                                  <span className="sr-only">
                                    Zoom to sample
                                  </span>
                                </button>
                              </div>
                            ),
                          },
                          ...getSampleTableColumns({
                            tableWidth,
                            includeContaminationFields: false, // trainingMode,
                          }),
                        ];
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
