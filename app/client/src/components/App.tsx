/** @jsxImportSource @emotion/react */

import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { css } from '@emotion/react';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@reach/tabs';
import { useWindowSize } from '@reach/window-size';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import IconChevronDown from '~icons/fa7-solid/chevron-down';
import IconChevronUp from '~icons/fa7-solid/chevron-up';
import IconSearchPlus from '~icons/fa7-solid/search-plus';
// components
import ErrorIcon from 'components/ErrorIcon';
import LoadingSpinner from 'components/LoadingSpinner';
import Map from 'components/Map';
import NavBar from 'components/NavBar';
import { ReactTable } from 'components/ReactTable';
import SplashScreen from 'components/SplashScreen';
import TestingToolbar from 'components/TestingToolbar';
import Toolbar from 'components/Toolbar';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { DialogContext } from 'contexts/Dialog';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// utilities
import { useSessionStorage } from 'utils/browserStorage';
import {
  getBuildingTableColumns,
  getSampleTableColumns,
} from 'utils/sketchUtils';
import { parseSmallFloat } from 'utils/utils';
// config
import { navPanelWidth } from 'config/appConfig';
// types
import { EditsType, LayerDeconEditsType } from 'types/Edits';
import { LayerType } from 'types/Layer';
import { AppType } from 'types/Navigation';
// styles
import '@reach/tabs/styles.css';

const resizerHeight = 10;
const esrifooterheight = 16;
const expandButtonHeight = 32;
const minMapHeight = 180;
const tableFilterHeight = 34;
let startY = 0;

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

  [data-reach-tab-list] {
    background: none;
  }
`;

const loadingContainerStyles = css`
  position: absolute;
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  vertical-align: middle;

  background-color: rgba(255, 255, 255, 0.75);
  z-index: 3;
`;

const collapsePanelButton = css`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  height: ${expandButtonHeight}px;
  width: 64px;
  border-radius: 0;
  background-color: white;
  color: black;
  pointer-events: all;
  font-size: 17px;
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
  height: 32px;
  width: 100%;
  border-top: 1px solid #afafaf;
  border-bottom: 1px solid #afafaf;
  padding: 0;
`;

const sampleTableHeaderStyles = (active: boolean) => css`
  height: 30px;
  margin: 0;
  padding: 0.2em 1.1765em;
  background-color: white;
  color: black;
  font-weight: bold;
  border-bottom: 3px solid ${active ? '#01213b' : 'transparent'} !important;
`;

const zoomButtonContainerStyles = css`
  text-align: center;
`;

const zoomButtonStyles = css`
  background-color: transparent;
  color: black;
  margin: 0;
  padding: 0;
  font-size: 17px;
`;

// --- components (NavBar) ---
type Props = {
  appType: AppType;
};

function App({ appType }: Props) {
  const { calculateResults } = useContext(CalculateContext);
  const {
    appLoading,
    currentPanel,
    panelExpanded,
    resultsExpanded,
    tablePanelExpanded,
    setTablePanelExpanded,
    tablePanelHeight,
    setTablePanelHeight,
    tablePanelSelectedTab,
    setTablePanelSelectedTab,
    tableShowSelectedScenarioOnly,
    setTableShowSelectedScenarioOnly,
    trainingMode,
  } = useContext(NavigationContext);
  const {
    displayDimensions,
    edits,
    layers,
    map,
    mapView,
    portalLayers,
    sceneView,
    selectedSampleIds,
    selectedScenario,
    setSelectedSampleIds,
  } = useContext(SketchContext);

  useSessionStorage(appType);

  const { height, width } = useWindowSize();

  const [mapDiv, setMapDiv] = useState<HTMLDivElement | null>(null);
  const mapRef = useCallback((node: HTMLDivElement) => {
    if (node === null) return;
    setMapDiv(node);
  }, []);

  // calculate height of div holding actions info
  const [contentHeight, setContentHeight] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  useEffect(() => {
    if (!mapDiv) return;

    // adjust the table height if necessary
    const maxTableHeight =
      contentHeight - esrifooterheight - toolbarHeight - expandButtonHeight;
    if (maxTableHeight > 0 && tablePanelHeight >= maxTableHeight) {
      setTablePanelHeight(maxTableHeight);
    }
  }, [
    width,
    height,
    mapDiv,
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

  const [totsDiv, setTotsDiv] = useState<HTMLDivElement | null>(null);
  const totsRef = useCallback((node: HTMLDivElement) => {
    if (node === null) return;
    setTotsDiv(node);
  }, []);

  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!totsDiv) return;

    const offsetTop = totsDiv.offsetTop;
    const clientHeight = totsDiv.clientHeight;
    if (contentHeight !== clientHeight) setContentHeight(clientHeight);
    if (offset !== offsetTop) setOffset(offsetTop);
  }, [contentHeight, height, offset, totsDiv, width]);

  // changes tablePanelSelectedTab in the case of a tab being removed
  useEffect(() => {
    if (edits.count === 0 || layers.length === 0) return;

    let newSelectedTab = tablePanelSelectedTab;

    // determine if there is data for the selected tab
    const buildingData = getBuildingRecords(edits, layers);
    const sampleData = getSampleRecords(layers);

    if (
      tablePanelSelectedTab === 'buildings' &&
      buildingData.length === 0 &&
      sampleData.length > 0
    )
      newSelectedTab = 'samples';
    else if (
      tablePanelSelectedTab === 'samples' &&
      sampleData.length === 0 &&
      buildingData.length > 0
    )
      newSelectedTab = 'buildings';
    else if (sampleData.length === 0 && buildingData.length === 0)
      newSelectedTab = null;

    if (newSelectedTab !== tablePanelSelectedTab)
      setTablePanelSelectedTab(newSelectedTab);
  }, [edits, layers, tablePanelSelectedTab, setTablePanelSelectedTab]);

  // ONLY NEEDED FOR TODS. Tracks layers added to map to make syncing
  // table with tots sample layers in tods more reliable.
  const [numMapLayers, setNumMapLayers] = useState(0);
  const [watcherInitialized, setWatcherInitialized] = useState(false);
  useEffect(() => {
    if (!map || appType !== 'decon' || watcherInitialized) return;

    setWatcherInitialized(true);
    reactiveUtils.watch(
      () => map.layers.length,
      () => setNumMapLayers(map.layers.length),
    );
  }, [appType, map, watcherInitialized]);

  // ONLY NEEDED FOR TODS. Syncs the table with tots sample layers.
  // This is needed because TOTS sample layers are pulled into TODS
  // from AGO as a feature layer and not as graphics layers like
  // everything else.
  const [tableError, setTableError] = useState('');
  const [totsIdsLoaded, setTotsIdsLoaded] = useState<string[]>([]);
  const [portalGraphics, setPortalGraphics] = useState<__esri.Graphic[]>([]);
  useEffect(() => {
    if (!map || appType !== 'decon') return;

    setTableError('');

    // find ids that are no longer in portalLayers
    const currentPortalIds = portalLayers.map((p) => p.id);
    const idsToRemove = totsIdsLoaded.filter(
      (id) => !currentPortalIds.includes(id),
    );

    // remove any items that have been removed from portalLayers
    if (idsToRemove.length > 0) {
      setTotsIdsLoaded((prev) =>
        prev.filter((id) => !idsToRemove.includes(id)),
      );
      setPortalGraphics((prev) =>
        prev.filter((g) => !idsToRemove.includes(g.attributes['scenarioId'])),
      );
    }

    if (portalLayers.length === 0) return;

    const loadAndQueryLayers = async () => {
      const requests: Promise<__esri.FeatureSet>[] = [];
      const processedIds: string[] = [];
      const layerInfo: { id: string; title: string | nullish }[] = [];

      for (const pLayer of portalLayers) {
        if (
          pLayer.type !== 'tots' ||
          !pLayer.categories.includes('contains-epa-tots-sample-layer') ||
          totsIdsLoaded.includes(pLayer.id)
        )
          continue;

        const layer = map.layers.find(
          (l) => (l as any).portalItem?.id === pLayer.id,
        ) as __esri.GroupLayer;

        if (!layer) continue;

        try {
          await layer.loadAll();

          const sampleLayer = layer.layers.find(
            (l) => l.title?.endsWith('-points') ?? false,
          ) as __esri.FeatureLayer;

          if (sampleLayer) {
            // execute query and save scenario level metadata
            requests.push(
              sampleLayer.queryFeatures({
                where: '1=1',
                returnGeometry: true,
                outFields: ['*'],
              }),
            );
            layerInfo.push({ id: pLayer.id, title: layer.title });
            processedIds.push(pLayer.id);
          }
        } catch (err) {
          console.error(`table layer load failed ${pLayer.id}:`, err);
          setTableError(
            `Failed to load TOTS Sample data for ${pLayer.label}. Please check developer console for more information.`,
          );
        }
      }

      if (requests.length > 0) {
        try {
          const responses = await Promise.all(requests);

          setPortalGraphics((prev) => [
            ...prev,
            ...responses.flatMap((r, index) => {
              return r.features.map((f) => {
                // apply scenario level metadata to each feature
                f.attributes['scenarioId'] = layerInfo[index].id;
                f.attributes['scenarioName'] = layerInfo[index].title;
                return f;
              });
            }),
          ]);
          setTotsIdsLoaded((prev) => [...prev, ...processedIds]);
        } catch (error) {
          console.error('table query failed:', error);
          setTableError(
            `Failed to load TOTS Sample data for. Please check developer console for more information.`,
          );
        }
      }
    };

    loadAndQueryLayers();
  }, [appType, map, numMapLayers, portalLayers, totsIdsLoaded]);

  // count the number of samples
  const tableData: BuildingTableDataType[] = [];
  type BuildingTableDataType = {
    data: any[];
    key: 'buildings' | 'samples';
    label: string;
    primary: boolean;
    scenarioData: any[];
  };

  const sampleData = getSampleRecords(layers, portalGraphics);
  if (sampleData.length > 0)
    tableData.push({
      key: 'samples',
      label: 'Samples',
      primary: appType === 'sampling',
      data: sampleData,
      scenarioData:
        appType === 'sampling'
          ? sampleData.filter((s) => s.scenarioId === selectedScenario?.layerId)
          : [],
    });

  const buildingData = getBuildingRecords(edits, layers);
  if (buildingData.length > 0)
    tableData.push({
      key: 'buildings',
      label: 'Buildings',
      primary: appType === 'decon',
      data: buildingData,
      scenarioData:
        appType === 'decon'
          ? buildingData.filter((b) =>
              b.scenarioIds.includes(selectedScenario?.value),
            )
          : [],
    });

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

  const tabIndex = tableData.findIndex(
    (table) => table.key === tablePanelSelectedTab,
  );
  const layoutKey = tableData.map((t) => t.key).join('-');

  return (
    <div className="tots" ref={totsRef}>
      <SplashScreen />
      <div css={appStyles(offset)}>
        <div css={containerStyles}>
          {appLoading && (
            <div css={loadingContainerStyles}>
              <LoadingSpinner />
            </div>
          )}
          <div ref={toolbarRef}>
            {window.location.search.includes('devMode=true') && (
              <TestingToolbar />
            )}
            <Toolbar appType={appType} />
          </div>
          <NavBar height={contentHeight - toolbarHeight} appType={appType} />
          <div
            css={mapPanelStyles(
              toolbarHeight + (tablePanelExpanded ? tablePanelHeight : 0),
            )}
            ref={mapRef}
          >
            <div id="tots-map-div" css={mapHeightStyles}>
              {toolbarHeight ? (
                <Map
                  appType={appType}
                  height={
                    contentHeight -
                    (tablePanelExpanded ? tablePanelHeight : 0) -
                    toolbarHeight
                  }
                />
              ) : (
                ''
              )}
            </div>
          </div>
          {tableData.length > 0 && (
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
                {tablePanelExpanded ? <IconChevronDown /> : <IconChevronUp />}
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
                  <Tabs
                    key={layoutKey}
                    index={tabIndex >= 0 ? tabIndex : 0}
                    onChange={(index) => {
                      setTablePanelSelectedTab(tableData[index]?.key ?? null);
                    }}
                  >
                    <div css={tablePanelHeaderStyles}>
                      <TabList>
                        {tableData.map((table, index) => (
                          <Tab
                            key={table.key}
                            onClick={() => setTablePanelSelectedTab(table.key)}
                            css={sampleTableHeaderStyles(
                              tablePanelSelectedTab === table.key ||
                                (!tablePanelSelectedTab && index === 0),
                            )}
                          >
                            {table.label} (Count:{' '}
                            {table.primary && tableShowSelectedScenarioOnly
                              ? table.scenarioData.length
                              : table.data.length}
                            )
                          </Tab>
                        ))}
                        {tableError && (
                          <div
                            css={css`
                              position: absolute;
                              right: 10px;
                              top: 16px;
                            `}
                          >
                            <ErrorIcon
                              id="error"
                              text="ERROR"
                              tooltip={tableError}
                            />
                          </div>
                        )}
                      </TabList>
                    </div>

                    <TabPanels>
                      {tableData.map((table) => {
                        const filterVisible =
                          (appType === 'sampling' && table.key === 'samples') ||
                          (appType === 'decon' && table.key === 'buildings');
                        return (
                          <TabPanel key={table.key}>
                            {filterVisible && (
                              <label
                                css={css`
                                  height: ${tableFilterHeight}px;
                                  display: flex;
                                  align-items: center;
                                  gap: 4px;
                                  padding: 5px 0 5px 10px;
                                `}
                              >
                                <input
                                  type="checkbox"
                                  checked={tableShowSelectedScenarioOnly}
                                  onChange={(e) =>
                                    setTableShowSelectedScenarioOnly(
                                      e.target.checked,
                                    )
                                  }
                                />
                                <span>Show Selected Scenario Only</span>
                              </label>
                            )}
                            <ReactTable
                              id="tots-samples-table"
                              data={
                                table.primary && tableShowSelectedScenarioOnly
                                  ? table.scenarioData
                                  : table.data
                              }
                              striped={true}
                              height={
                                tablePanelHeight -
                                resizerHeight -
                                (filterVisible ? tableFilterHeight : 0) -
                                30
                              }
                              initialSelectedRowIds={selectedSampleIds}
                              onSelectionChange={(row: any) => {
                                const PERMANENT_IDENTIFIER =
                                  row.original.PERMANENT_IDENTIFIER;
                                const DECISIONUNITUUID =
                                  row.original.DECISIONUNITUUID;
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
                              sortBy={
                                table.key === 'buildings'
                                  ? [
                                      {
                                        id: 'scenarioName',
                                        desc: false,
                                      },
                                      {
                                        id: 'layerName',
                                        desc: false,
                                      },
                                      {
                                        id: 'OCC_CLS',
                                        desc: false,
                                      },
                                      {
                                        id: 'PRIM_OCC',
                                        desc: false,
                                      },
                                    ]
                                  : [
                                      {
                                        id: 'scenarioName',
                                        desc: false,
                                      },
                                      {
                                        id: 'DECISIONUNIT',
                                        desc: false,
                                      },
                                      {
                                        id: 'TYPE',
                                        desc: false,
                                      },
                                    ]
                              }
                              getColumns={(tableWidth: any) => {
                                const tableColumns =
                                  table.key === 'buildings'
                                    ? getBuildingTableColumns({
                                        tableWidth,
                                        trainingMode,
                                      })
                                    : getSampleTableColumns({
                                        appType,
                                        tableWidth,
                                        includeContaminationFields:
                                          trainingMode,
                                      });

                                return [
                                  {
                                    header: () => (
                                      <span className="sr-only">Zoom</span>
                                    ),
                                    id: 'zoom-button',
                                    size: 30,
                                    cell: ({ row }: { row: any }) => (
                                      <div css={zoomButtonContainerStyles}>
                                        <button
                                          css={zoomButtonStyles}
                                          onClick={(event) => {
                                            event.stopPropagation();

                                            // select the sample
                                            setSelectedSampleIds([
                                              {
                                                PERMANENT_IDENTIFIER:
                                                  row.original
                                                    .PERMANENT_IDENTIFIER,
                                                DECISIONUNITUUID:
                                                  row.original.DECISIONUNITUUID,
                                                selection_method: 'row-click',
                                                graphic: row.original.graphic,
                                              },
                                            ]);

                                            // zoom to the graphic
                                            if (
                                              displayDimensions === '2d' &&
                                              mapView
                                            ) {
                                              mapView.goTo(
                                                row.original.graphic,
                                              );
                                              mapView.zoom =
                                                appType === 'decon'
                                                  ? 16
                                                  : mapView.zoom - 1;
                                            } else if (
                                              displayDimensions === '3d' &&
                                              sceneView
                                            ) {
                                              sceneView.goTo(
                                                row.original.graphic,
                                              );
                                            }
                                          }}
                                        >
                                          <IconSearchPlus />
                                          <span className="sr-only">
                                            Zoom to sample
                                          </span>
                                        </button>
                                      </div>
                                    ),
                                  },
                                  ...tableColumns,
                                ];
                              }}
                            />
                          </TabPanel>
                        );
                      })}
                    </TabPanels>
                  </Tabs>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getSampleRecords(
  layers: LayerType[],
  portalGraphics: __esri.Graphic[] = [],
) {
  const tempData: any[] = [];
  layers.forEach((layer) => {
    if (!layer.sketchLayer || layer.sketchLayer.type !== 'graphics') return;
    if (layer.layerType === 'Samples' || layer.layerType === 'VSP') {
      const graphics = layer.sketchLayer.graphics.toArray();
      graphics.sort((a, b) =>
        a.attributes.PERMANENT_IDENTIFIER.localeCompare(
          b.attributes.PERMANENT_IDENTIFIER,
        ),
      );
      graphics.forEach((sample) => {
        tempData.push({
          graphic: sample,
          ...sample.attributes,
          scenarioId: layer.parentLayer?.id ?? '',
          scenarioName: layer.parentLayer?.title ?? '',
        });
      });
    }
  });

  portalGraphics.forEach((sample) => {
    tempData.push({
      graphic: sample,
      ...sample.attributes,
    });
  });

  return tempData;
}

function getBuildingRecords(edits: EditsType, layers: LayerType[]) {
  const tempData: any[] = [];
  edits.edits
    .filter((e) => e.type === 'layer-aoi-analysis')
    .forEach((edit) => {
      const aoiLayersProcessed: string[] = [];

      // find decon layers linked to this AOI analysis layer
      const deconLayerIds = edits.edits
        .filter(
          (e) => e.type === 'layer-decon' && e.analysisLayerId === edit.value,
        )
        .map((d) => (d as LayerDeconEditsType).value);

      const scenarioIds: string[] = [];
      const scenarioNames: string[] = [];
      edits.edits.forEach((s) => {
        if (s.type !== 'scenario-decon') return;

        let scenarioLinked = false;
        s.linkedLayerIds.forEach((linkedLayerId) => {
          if (!deconLayerIds.includes(linkedLayerId)) return;
          scenarioLinked = true;
        });
        if (!scenarioLinked) return;

        scenarioIds.push(s.value);
        scenarioNames.push(s.scenarioName);
      });

      const aoiAssessed = edit.layers.find(
        (l) => l.layerType === 'AOI Assessed',
      );
      const aoiAssessedLayer = layers.find(
        (l) =>
          l.layerType === 'AOI Assessed' && l.layerId === aoiAssessed?.layerId,
      );
      if (!aoiAssessedLayer) return;
      if (aoiLayersProcessed.includes(aoiAssessedLayer.layerId)) return;

      aoiLayersProcessed.push(aoiAssessedLayer.layerId);
      (aoiAssessedLayer.sketchLayer as __esri.GraphicsLayer).graphics.forEach(
        (building) => {
          tempData.push({
            graphic: building,
            ...building.attributes,
            scenarioIds,
            scenarioNames,
            scenarioName: scenarioNames.sort().join(', '),
            layerName:
              aoiAssessedLayer.parentLayer?.title ?? aoiAssessedLayer.label,
            H_ADJ_ELEV:
              parseSmallFloat(
                building.attributes.H_ADJ_ELEV,
                2,
              )?.toLocaleString() ?? '',
            L_ADJ_ELEV:
              parseSmallFloat(
                building.attributes.L_ADJ_ELEV,
                2,
              )?.toLocaleString() ?? '',
            HEIGHT:
              parseSmallFloat(
                building.attributes.HEIGHT,
                2,
              )?.toLocaleString() ?? '',
            SQMETERS:
              parseSmallFloat(
                building.attributes.SQMETERS,
                2,
              )?.toLocaleString() ?? '',
            footprintSqM:
              parseSmallFloat(
                building.attributes.footprintSqM,
                2,
              )?.toLocaleString() ?? '',
            floorsSqM:
              parseSmallFloat(
                building.attributes.floorsSqM,
                2,
              )?.toLocaleString() ?? '',
            totalSqM:
              parseSmallFloat(
                building.attributes.totalSqM,
                2,
              )?.toLocaleString() ?? '',
            extWallsSqM:
              parseSmallFloat(
                building.attributes.extWallsSqM,
                2,
              )?.toLocaleString() ?? '',
            intWallsSqM:
              parseSmallFloat(
                building.attributes.intWallsSqM,
                2,
              )?.toLocaleString() ?? '',
            extSqM:
              parseSmallFloat(
                building.attributes.extSqM,
                2,
              )?.toLocaleString() ?? '',
            intSqM:
              parseSmallFloat(
                building.attributes.intSqM,
                2,
              )?.toLocaleString() ?? '',
            roofSqM:
              parseSmallFloat(
                building.attributes.roofSqM,
                2,
              )?.toLocaleString() ?? '',
            ceilingsSqM:
              parseSmallFloat(
                building.attributes.ceilingsSqM,
                2,
              )?.toLocaleString() ?? '',
            extVolumeCubM:
              parseSmallFloat(
                building.attributes.extVolumeCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeCubM:
              parseSmallFloat(
                building.attributes.intVolumeCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeContentsCubM:
              parseSmallFloat(
                building.attributes.intVolumeContentsCubM,
                2,
              )?.toLocaleString() ?? '',
            footprintSqFt:
              parseSmallFloat(
                building.attributes.footprintSqFt,
                2,
              )?.toLocaleString() ?? '',
            SQFEET:
              parseSmallFloat(
                building.attributes.SQFEET,
                2,
              )?.toLocaleString() ?? '',
            heightFt:
              parseSmallFloat(
                building.attributes.heightFt,
                2,
              )?.toLocaleString() ?? '',
            floorsSqFt:
              parseSmallFloat(
                building.attributes.floorsSqFt,
                2,
              )?.toLocaleString() ?? '',
            totalSqFt:
              parseSmallFloat(
                building.attributes.totalSqFt,
                2,
              )?.toLocaleString() ?? '',
            extWallsSqFt:
              parseSmallFloat(
                building.attributes.extWallsSqFt,
                2,
              )?.toLocaleString() ?? '',
            intWallsSqFt:
              parseSmallFloat(
                building.attributes.intWallsSqFt,
                2,
              )?.toLocaleString() ?? '',
            extSqFt:
              parseSmallFloat(
                building.attributes.extSqFt,
                2,
              )?.toLocaleString() ?? '',
            intSqFt:
              parseSmallFloat(
                building.attributes.intSqFt,
                2,
              )?.toLocaleString() ?? '',
            roofSqFt:
              parseSmallFloat(
                building.attributes.roofSqFt,
                2,
              )?.toLocaleString() ?? '',
            ceilingsSqFt:
              parseSmallFloat(
                building.attributes.ceilingsSqFt,
                2,
              )?.toLocaleString() ?? '',
            extVolumeCubFt:
              parseSmallFloat(
                building.attributes.extVolumeCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeCubFt:
              parseSmallFloat(
                building.attributes.intVolumeCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeContentsCubFt:
              parseSmallFloat(
                building.attributes.intVolumeContentsCubFt,
                2,
              )?.toLocaleString() ?? '',
            intBrickSqM:
              parseSmallFloat(
                building.attributes.intBrickSqM,
                2,
              )?.toLocaleString() ?? '',
            extBrickSqM:
              parseSmallFloat(
                building.attributes.extBrickSqM,
                2,
              )?.toLocaleString() ?? '',
            extVolumeBrickCubM:
              parseSmallFloat(
                building.attributes.extVolumeBrickCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeBrickCubM:
              parseSmallFloat(
                building.attributes.intVolumeBrickCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeBrickContentsCubM:
              parseSmallFloat(
                building.attributes.intVolumeBrickContentsCubM,
                2,
              )?.toLocaleString() ?? '',
            intConcreteSqM:
              parseSmallFloat(
                building.attributes.intConcreteSqM,
                2,
              )?.toLocaleString() ?? '',
            extConcreteSqM:
              parseSmallFloat(
                building.attributes.extConcreteSqM,
                2,
              )?.toLocaleString() ?? '',
            extVolumeConcreteCubM:
              parseSmallFloat(
                building.attributes.extVolumeConcreteCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeConcreteCubM:
              parseSmallFloat(
                building.attributes.intVolumeConcreteCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeConcreteContentsCubM:
              parseSmallFloat(
                building.attributes.intVolumeConcreteContentsCubM,
                2,
              )?.toLocaleString() ?? '',
            intSteelSqM:
              parseSmallFloat(
                building.attributes.intSteelSqM,
                2,
              )?.toLocaleString() ?? '',
            extSteelSqM:
              parseSmallFloat(
                building.attributes.extSteelSqM,
                2,
              )?.toLocaleString() ?? '',
            extVolumeSteelCubM:
              parseSmallFloat(
                building.attributes.extVolumeSteelCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeSteelCubM:
              parseSmallFloat(
                building.attributes.intVolumeSteelCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeSteelContentsCubM:
              parseSmallFloat(
                building.attributes.intVolumeSteelContentsCubM,
                2,
              )?.toLocaleString() ?? '',
            intWoodSqM:
              parseSmallFloat(
                building.attributes.intWoodSqM,
                2,
              )?.toLocaleString() ?? '',
            extWoodSqM:
              parseSmallFloat(
                building.attributes.extWoodSqM,
                2,
              )?.toLocaleString() ?? '',
            extVolumeWoodCubM:
              parseSmallFloat(
                building.attributes.extVolumeWoodCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeWoodCubM:
              parseSmallFloat(
                building.attributes.intVolumeWoodCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeWoodContentsCubM:
              parseSmallFloat(
                building.attributes.intVolumeWoodContentsCubM,
                2,
              )?.toLocaleString() ?? '',
            intOtherSqM:
              parseSmallFloat(
                building.attributes.intOtherSqM,
                2,
              )?.toLocaleString() ?? '',
            extOtherSqM:
              parseSmallFloat(
                building.attributes.extOtherSqM,
                2,
              )?.toLocaleString() ?? '',
            extVolumeOtherCubM:
              parseSmallFloat(
                building.attributes.extVolumeOtherCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeOtherCubM:
              parseSmallFloat(
                building.attributes.intVolumeOtherCubM,
                2,
              )?.toLocaleString() ?? '',
            intVolumeOtherContentsCubM:
              parseSmallFloat(
                building.attributes.intVolumeOtherContentsCubM,
                2,
              )?.toLocaleString() ?? '',

            intBrickSqFt:
              parseSmallFloat(
                building.attributes.intBrickSqFt,
                2,
              )?.toLocaleString() ?? '',
            extBrickSqFt:
              parseSmallFloat(
                building.attributes.extBrickSqFt,
                2,
              )?.toLocaleString() ?? '',
            extVolumeBrickCubFt:
              parseSmallFloat(
                building.attributes.extVolumeBrickCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeBrickCubFt:
              parseSmallFloat(
                building.attributes.intVolumeBrickCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeBrickContentsCubFt:
              parseSmallFloat(
                building.attributes.intVolumeBrickContentsCubFt,
                2,
              )?.toLocaleString() ?? '',
            intConcreteSqFt:
              parseSmallFloat(
                building.attributes.intConcreteSqFt,
                2,
              )?.toLocaleString() ?? '',
            extConcreteSqFt:
              parseSmallFloat(
                building.attributes.extConcreteSqFt,
                2,
              )?.toLocaleString() ?? '',
            extVolumeConcreteCubFt:
              parseSmallFloat(
                building.attributes.extVolumeConcreteCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeConcreteCubFt:
              parseSmallFloat(
                building.attributes.intVolumeConcreteCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeConcreteContentsCubFt:
              parseSmallFloat(
                building.attributes.intVolumeConcreteContentsCubFt,
                2,
              )?.toLocaleString() ?? '',
            intSteelSqFt:
              parseSmallFloat(
                building.attributes.intSteelSqFt,
                2,
              )?.toLocaleString() ?? '',
            extSteelSqFt:
              parseSmallFloat(
                building.attributes.extSteelSqFt,
                2,
              )?.toLocaleString() ?? '',
            extVolumeSteelCubFt:
              parseSmallFloat(
                building.attributes.extVolumeSteelCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeSteelCubFt:
              parseSmallFloat(
                building.attributes.intVolumeSteelCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeSteelContentsCubFt:
              parseSmallFloat(
                building.attributes.intVolumeSteelContentsCubFt,
                2,
              )?.toLocaleString() ?? '',
            intWoodSqFt:
              parseSmallFloat(
                building.attributes.intWoodSqFt,
                2,
              )?.toLocaleString() ?? '',
            extWoodSqFt:
              parseSmallFloat(
                building.attributes.extWoodSqFt,
                2,
              )?.toLocaleString() ?? '',
            extVolumeWoodCubFt:
              parseSmallFloat(
                building.attributes.extVolumeWoodCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeWoodCubFt:
              parseSmallFloat(
                building.attributes.intVolumeWoodCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeWoodContentsCubFt:
              parseSmallFloat(
                building.attributes.intVolumeWoodContentsCubFt,
                2,
              )?.toLocaleString() ?? '',
            intOtherSqFt:
              parseSmallFloat(
                building.attributes.intOtherSqFt,
                2,
              )?.toLocaleString() ?? '',
            extOtherSqFt:
              parseSmallFloat(
                building.attributes.extOtherSqFt,
                2,
              )?.toLocaleString() ?? '',
            extVolumeOtherCubFt:
              parseSmallFloat(
                building.attributes.extVolumeOtherCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeOtherCubFt:
              parseSmallFloat(
                building.attributes.intVolumeOtherCubFt,
                2,
              )?.toLocaleString() ?? '',
            intVolumeOtherContentsCubFt:
              parseSmallFloat(
                building.attributes.intVolumeOtherContentsCubFt,
                2,
              )?.toLocaleString() ?? '',
          });
        },
      );
    });

  return tempData;
}

export default App;
