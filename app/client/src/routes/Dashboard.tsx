/** @jsxImportSource @emotion/react */

import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { debounce } from 'lodash';
import { AsyncPaginate, wrapMenuList } from 'react-select-async-paginate';
import { css } from '@emotion/react';
import { useWindowSize } from '@reach/window-size';
import Portal from '@arcgis/core/portal/Portal';
// components
import MapDashboard from 'components/MapDashboard';
import { MenuList as CustomMenuList } from 'components/MenuList';
import Toolbar from 'components/Toolbar';
import TestingToolbar from 'components/TestingToolbar';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { DialogContext } from 'contexts/Dialog';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// utilities
import { useAbort, useSessionStorage } from 'utils/hooks';
import { isAbort } from 'utils/utils';
// types
import type { LoadOptions } from 'react-select-async-paginate';
// config
import { notLoggedInMessage } from 'config/errorMessages';

function appendToQuery(query: string, part: string, separator: string = 'AND') {
  // nothing to append
  if (part.length === 0) return query;

  // append the query part
  if (query.length > 0) return `${query} ${separator} (${part})`;
  else return `(${part})`;
}

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
  width: 100%;
`;

const mapHeightStyles = css`
  height: 100%;
`;

function Dashboard() {
  const { abort } = useAbort();
  const { portal, signedIn } = useContext(AuthenticationContext);
  const { tablePanelExpanded, tablePanelHeight } =
    useContext(NavigationContext);
  const {
    layers,
    mapDashboard,
    mapViewDashboard,
    sceneViewDashboard,
    selectedScenario,
  } = useContext(SketchContext);
  useSessionStorage();

  const { height, width } = useWindowSize();

  // calculate height of div holding actions info
  const [contentHeight, setContentHeight] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(0);

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

  const [selectedPlan, setSelectedPlan] = useState<Option | null>(null);

  // Create the filter function from the HOF
  const filterFunc: FilterFunction = useMemo(() => {
    const localPortal = portal ? portal : new Portal();
    return filterOptions(localPortal);
  }, [portal]);

  const fetchOptions = useCallback(
    async (
      inputValue: string,
      loadedOptions: readonly (Option | GroupBase<Option>)[],
    ) => {
      abort();
      try {
        return await filterFunc(inputValue, loadedOptions);
      } catch (err) {
        if (!isAbort(err)) console.error(err);
        return { options: [], hasMore: true };
      }
    },
    [abort, filterFunc],
  );

  const debouncedFetchOptions = useMemo(() => {
    return debounce(fetchOptions, 250, {
      leading: true,
      trailing: true,
    });
  }, [fetchOptions]);

  useEffect(() => {
    return function cleanup() {
      debouncedFetchOptions?.cancel();
    };
  }, [debouncedFetchOptions]);

  const loadOptions = debouncedFetchOptions ?? fetchOptions;

  // Filters options by search input, returning a maximum number of options
  function filterOptions(portal: Portal) {
    return async function (
      inputValue: string,
      loadedOptions: readonly (Option | GroupBase<Option>)[],
    ) {
      // type selection
      const categories: string[] = ['contains-epa-tots-sample-layer'];
      const defaultTypePart =
        'type:"Map Service" OR type:"Feature Service" OR type:"Image Service" ' +
        'OR type:"Vector Tile Service" OR type:"KML" OR type:"WMS" OR type:"Scene Service"';

      let query = '';
      // search box
      if (inputValue) {
        query = appendToQuery(query, inputValue);
      }

      // add the type selection to the query, use all types if all types are set to false
      query = appendToQuery(query, defaultTypePart);

      // build the query parameters
      let queryParams = {
        categories: [categories],
        query,
        sortField: 'title',
        sortOrder: 'asc',
        start: loadedOptions.length + 1,
      } as __esri.PortalQueryParams;

      // perform the query
      const response = await portal.queryItems(queryParams);
      const options = response.results.map((item: Record<string, string>) => {
        return { label: item.title, value: item.id };
      });

      return {
        options,
        hasMore: loadedOptions.length < response.total,
      };
    };
  }

  // count the number of samples
  const sampleData: any[] = [];
  layers.forEach((layer) => {
    if (!layer.sketchLayer || layer.sketchLayer.type === 'feature') return;
    if (layer?.parentLayer?.id !== selectedScenario?.layerId) return;
    if (layer.layerType === 'Samples' || layer.layerType === 'VSP') {
      const graphics = layer.sketchLayer.graphics.toArray();
      graphics.sort((a, b) =>
        a.attributes.PERMANENT_IDENTIFIER.localeCompare(
          b.attributes.PERMANENT_IDENTIFIER,
        ),
      );
      graphics.forEach((sample) => {
        sampleData.push({
          graphic: sample,
          ...sample.attributes,
        });
      });
    }
  });

  return (
    <div className="tots" ref={totsRef}>
      <div css={appStyles(offset)}>
        <div css={containerStyles}>
          <div ref={toolbarRef}>
            {window.location.search.includes('devMode=true') && (
              <TestingToolbar />
            )}
            <Toolbar
              isDashboard={true}
              map={mapDashboard}
              mapView={mapViewDashboard}
              sceneView={sceneViewDashboard}
            />

            <div
              css={css`
                min-width: 268px;
                width: 50%;
                margin: 10px;
              `}
            >
              {signedIn ? (
                <Fragment>
                  <label htmlFor="plan-select">Plan:</label>
                  <AsyncPaginate
                    aria-label="Plan input"
                    className="width-full"
                    classNames={{
                      container: () => 'font-ui-xs',
                      menuList: () => 'font-ui-xs',
                    }}
                    components={{ MenuList: wrapMenuList(CustomMenuList) }}
                    inputId="plan-select"
                    instanceId="plan-select"
                    loadOptions={loadOptions}
                    menuPortalTarget={document.body}
                    onChange={(ev) => setSelectedPlan(ev as any)}
                    onMenuClose={abort}
                    styles={{
                      control: (base) => ({
                        ...base,
                        border: '1px solid #adadad',
                        borderRadius: '4px',
                      }),
                      menuPortal: (base) => ({
                        ...base,
                        zIndex: 9999,
                      }),
                      placeholder: (base) => ({
                        ...base,
                        color: '#71767a',
                      }),
                    }}
                    value={selectedPlan}
                  />
                </Fragment>
              ) : (
                notLoggedInMessage
              )}
            </div>
          </div>
          <div
            css={mapPanelStyles(
              toolbarHeight + (tablePanelExpanded ? tablePanelHeight : 0),
            )}
          >
            <div id="tots-map-div" css={mapHeightStyles}>
              {toolbarHeight && (
                <MapDashboard
                  height={
                    contentHeight -
                    (tablePanelExpanded ? tablePanelHeight : 0) -
                    toolbarHeight
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

/*
## Types
*/

type FilterFunction = LoadOptions<Option, GroupBase<Option>, unknown>;

interface GroupBase<Option> {
  readonly options: readonly Option[];
  readonly label?: string;
}

type Option = {
  label: string;
  value: string | number;
};
