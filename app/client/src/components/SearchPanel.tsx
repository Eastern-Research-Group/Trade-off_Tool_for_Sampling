/** @jsxImportSource @emotion/react */

import React, { Fragment, useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import Collection from '@arcgis/core/core/Collection';
import Portal from '@arcgis/core/portal/Portal';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import IconAngleDoubleLeft from '~icons/fa7-solid/angle-double-left';
import IconAngleLeft from '~icons/fa7-solid/angle-left';
import IconAngleRight from '~icons/fa7-solid/angle-right';
import IconLongArrowAltDown from '~icons/fa7-solid/long-arrow-alt-down';
import IconLongArrowAltUp from '~icons/fa7-solid/long-arrow-alt-up';
import IconSearch from '~icons/fa7-solid/search';
// components
import LoadingSpinner from 'components/LoadingSpinner';
import Select from 'components/Select';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { DialogContext } from 'contexts/Dialog';
import { NavigationContext } from 'contexts/Navigation';
import { PublishContext } from 'contexts/Publish';
import { SketchContext } from 'contexts/Sketch';
// utils
import { useTotsLayerAdder } from 'utils/hooks';
import { getNextScenarioLayer, updateLayerEdits } from 'utils/sketchUtils';
import { createErrorObject, escapeForLucene } from 'utils/utils';
// types
import {
  EditsType,
  LayerAoiAnalysisEditsType,
  LayerDeconEditsType,
  ScenarioEditsType,
} from 'types/Edits';
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
import { AppType, LayerTypeOption } from 'types/Navigation';
// config
import {
  notLoggedInMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
import { layerTypeOptions } from 'config/navigation';
// styles
import { reactSelectStyles } from 'styles';

// --- styles (SearchPanel) ---
const searchContainerStyles = css`
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const searchInputStyles = css`
  margin: 0;
  padding-left: 8px;
  border: none;
  border-radius: 4px;
  height: 36px;

  /* width = 100% - width of search button  */
  width: calc(100% - 37px);
`;

const searchSeparatorStyles = css`
  align-self: stretch;
  background-color: #ccc;
  margin-bottom: 8px;
  margin-top: 8px;
  padding-right: 1px;
  box-sizing: border-box;
`;

const searchButtonStyles = css`
  margin: 0;
  height: 36px;
  width: 36px;
  padding: 10px;
  background-color: white;
  color: #ccc;
  border: none;
  border-radius: 4px;
`;

const filterContainerStyles = css`
  /* This is disabled and only ever enabled for testing.
   * In development, it is sometimes helpful enable
   * this to test out specific layer types.
   * Add "?devMode=true" to the end of the url to enable. */
  display: ${window.location.search.includes('devMode=true')
    ? 'block'
    : 'none'};

  > div {
    margin-right: 15px;
  }
`;

const sortContainerStyles = css`
  display: flex;
`;

const sortSelectStyles = css`
  width: calc(100% - 10px);
  padding-right: 10px;
`;

const sortOrderStyles = css`
  color: black;
  width: 10px;
  background-color: white;
  padding: 0;
  margin: 0 5px;

  &:disabled {
    cursor: default;
  }
`;

const footerBar = css`
  display: flex;
  align-items: center;
`;

const fullWidthSelectStyles = css`
  width: 100%;
  margin-right: 10px;
`;

const multiSelectStyles = css`
  ${fullWidthSelectStyles}
  margin-bottom: 10px;
`;

const pageControlStyles = css`
  display: flex;
  align-items: center;
  color: black;
  background-color: white;
  padding: 0;
  margin: 0 5px;

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }

  svg {
    font-size: 17px;
    margin-top: 2px;
  }
`;

const totalStyles = css`
  margin-left: 10px;
`;

const exitDisclaimerStyles = css`
  margin: 1.5em 0;
  padding: 0.75em 0.5em;
  text-align: center;

  a {
    margin: 0 0 0 0.3333333333em;
  }
`;

const highContrastSpan = css`
  color: black;
  background-color: white;
`;

// --- components (SearchPanel) ---
type LocationType =
  | { value: 'ArcGIS Online'; label: 'ArcGIS Online' }
  | { value: 'My Content'; label: 'My Content' }
  | { value: 'My Organization'; label: 'My Organization' }
  | { value: 'My Groups'; label: 'My Groups' };

type GroupType = {
  value: string;
  label: string;
};

type SortByType = {
  value: 'none' | 'title' | 'owner' | 'avgrating' | 'numviews' | 'modified';
  label: 'Relevance' | 'Title' | 'Owner' | 'Rating' | 'Views' | 'Date';
  defaultSort: 'asc' | 'desc';
};

type SearchResultsType = {
  status: 'none' | 'fetching' | 'success' | 'failure' | 'not-logged-in';
  error?: ErrorType;
  data: __esri.PortalQueryResult | null;
};

type Props = {
  appType: AppType;
};

function SearchPanel({ appType }: Props) {
  const { portal, userInfo } = useContext(AuthenticationContext);
  const { goToOptions, setGoToOptions } = useContext(NavigationContext);
  const { mapView, sceneView } = useContext(SketchContext);

  // filters
  const [
    location,
    setLocation, //
  ] = useState<LocationType>({
    value: 'ArcGIS Online',
    label: 'ArcGIS Online',
  });
  const [group, setGroup] = useState<GroupType | null>(null);
  const [search, setSearch] = useState('');
  const [searchText, setSearchText] = useState('');
  const [withinMap, setWithinMap] = useState(false);

  const [
    searchResults,
    setSearchResults, //
  ] = useState<SearchResultsType>({ status: 'none', data: null });
  const [currentExtent, setCurrentExtent] = useState<__esri.Extent | null>(
    null,
  );
  const [pageNumber, setPageNumber] = useState(1);
  const [sortBy, setSortBy] = useState<SortByType>({
    value: 'none',
    label: 'Relevance',
    defaultSort: 'desc',
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [layerTypeSelections, setLayerTypeSelections] = useState<
    LayerTypeOption[] | null
  >(null);

  // Handle navigation options
  useEffect(() => {
    if (goToOptions?.from !== 'search') return;
    if (goToOptions.layerTypesAgo)
      setLayerTypeSelections(goToOptions.layerTypesAgo);
    setGoToOptions(null);
  }, [goToOptions, setGoToOptions]);

  // Initializes the group selection
  useEffect(() => {
    if (group || !userInfo?.groups || userInfo.groups.length === 0) return;

    const firstGroup = userInfo.groups.sort((a: any, b: any) =>
      a.title.localeCompare(b.title),
    )[0];

    setGroup({
      value: firstGroup.id,
      label: firstGroup.title,
    });
  }, [group, userInfo]);

  // Builds and executes the search query on search button click
  useEffect(() => {
    if (goToOptions) return;

    setSearchResults({ status: 'fetching', data: null });

    const tmpPortal = portal ? portal : new Portal();

    function appendToQuery(
      query: string,
      part: string,
      separator: string = 'AND',
    ) {
      // nothing to append
      if (part.length === 0) return query;

      // append the query part
      if (query.length > 0) return `${query} ${separator} (${part})`;
      else return `(${part})`;
    }

    let query = '';
    // search box
    if (search) {
      query = appendToQuery(query, search);
    }

    // where to search ArcGISOnline is the default
    if (location.value === 'My Content') {
      if (!tmpPortal?.user?.username) {
        setSearchResults({ status: 'not-logged-in', data: null });
        return;
      }
      query = appendToQuery(
        query,
        `owner:${escapeForLucene(tmpPortal.user.username)}`,
      );
    }
    if (location.value === 'My Organization') {
      if (!tmpPortal?.user?.username) {
        setSearchResults({ status: 'not-logged-in', data: null });
        return;
      }
      query = appendToQuery(
        query,
        `orgid:${escapeForLucene(tmpPortal.user.orgId)}`,
      );
    }
    if (location.value === 'My Groups') {
      if (!group) {
        setSearchResults({ status: 'success', data: null });
        return;
      }

      query = appendToQuery(query, `group:${escapeForLucene(group.value)}`);
    }

    // type selection
    const categories: string[] = [];
    let typePart = '';
    const defaultTypePart =
      'type:"Map Service" OR type:"Feature Service" OR type:"Image Service" ' +
      'OR type:"Vector Tile Service" OR type:"KML" OR type:"WMS" OR type:"Scene Service"';
    layerTypeSelections?.forEach((layerType) => {
      if (layerType?.type === 'category') {
        categories.push(layerType.value);
      } else {
        typePart = appendToQuery(typePart, `type:"${layerType.value}"`, 'OR');
      }
    });

    // add the type selection to the query, use all types if all types are set to false
    if (typePart.length > 0) query = appendToQuery(query, typePart);
    else query = appendToQuery(query, defaultTypePart);

    // build the query parameters
    const queryParams = {
      query,
      sortOrder,
      categories: [categories],
    } as __esri.PortalQueryParams;

    if (withinMap && currentExtent) queryParams.extent = currentExtent;

    // if a sort by (other than relevance) is selected, add it to the query params
    if (sortBy.value !== 'none') {
      queryParams.sortField = sortBy.value as any;
    } else {
      if (!withinMap) {
        queryParams.sortField = 'num-views';
      }
    }

    // perform the query
    tmpPortal
      .queryItems(queryParams)
      .then((res: __esri.PortalQueryResult) => {
        if (res.total > 0) {
          setSearchResults({ status: 'success', data: res });
          setPageNumber(1);
        } else {
          setSearchResults({ status: 'success', data: null });
          setPageNumber(1);
        }
      })
      .catch((err) => {
        console.error(err);
        setSearchResults({
          status: 'failure',
          error: {
            error: createErrorObject(err),
            message: err.message,
          },
          data: null,
        });

        window.logErrorToGa(err);
      });
  }, [
    currentExtent,
    goToOptions,
    group,
    layerTypeSelections,
    location,
    portal,
    search,
    setSearchResults,
    sortBy,
    sortOrder,
    userInfo,
    withinMap,
  ]);

  // Runs the query for changing pages of the result set
  const [lastPageNumber, setLastPageNumber] = useState(1);
  useEffect(() => {
    if (!searchResults.data || pageNumber === lastPageNumber) return;

    // prevent running the same query multiple times
    setLastPageNumber(pageNumber);

    // get the query
    let queryParams = searchResults.data.queryParams;
    if (pageNumber === 1) {
      // going to first page
      queryParams.start = 1;
    }
    if (pageNumber > lastPageNumber) {
      // going to next page
      queryParams = searchResults.data.nextQueryParams;
    }
    if (pageNumber < lastPageNumber) {
      // going to previous page
      queryParams.start = queryParams.start - queryParams.num;
    }

    // perform the query
    const tmpPortal = portal ? portal : new Portal();
    tmpPortal
      .queryItems(queryParams)
      .then((res) => {
        setSearchResults({ status: 'success', data: res });
      })
      .catch((err) => {
        console.error(err);
        setSearchResults({
          status: 'failure',
          error: {
            error: createErrorObject(err),
            message: err.message,
          },
          data: null,
        });

        window.logErrorToGa(err);
      });
  }, [pageNumber, lastPageNumber, portal, searchResults]);

  // Defines a watch event for filtering results based on the map extent
  const [watchViewInitialized, setWatchViewInitialized] = useState(false);
  useEffect(() => {
    if (!mapView || !sceneView || watchViewInitialized) return;

    const watchEvent2d = reactiveUtils.when(
      () => mapView.stationary,
      () => {
        if (mapView.stationary) setCurrentExtent(mapView.extent);
      },
    );

    const watchEvent3d = reactiveUtils.when(
      () => sceneView.stationary,
      () => {
        if (sceneView.stationary) setCurrentExtent(sceneView.extent);
      },
    );

    setWatchViewInitialized(true);

    // remove watch event to prevent it from running after component unmounts
    return function cleanup() {
      watchEvent2d.remove();
      watchEvent3d.remove();
    };
  }, [mapView, sceneView, watchViewInitialized]);

  return (
    <Fragment>
      <label htmlFor="locations-select">Data Location</label>
      <Select
        inputId="locations-select"
        value={location}
        styles={reactSelectStyles as any}
        onChange={(ev) => setLocation(ev as LocationType)}
        options={[
          { value: 'ArcGIS Online', label: 'ArcGIS Online' },
          { value: 'My Content', label: 'My Content' },
          { value: 'My Organization', label: 'My Organization' },
          { value: 'My Groups', label: 'My Groups' },
        ]}
      />
      {location.value === 'My Groups' && (
        <Fragment>
          <label htmlFor="group-select">Group</label>
          <Select
            inputId="group-select"
            value={group}
            styles={reactSelectStyles as any}
            onChange={(ev) => setGroup(ev as GroupType)}
            options={
              userInfo?.groups?.length > 0
                ? userInfo.groups
                    .sort((a: any, b: any) => a.title.localeCompare(b.title))
                    .map((group: any) => {
                      return {
                        value: group.id,
                        label: group.title,
                      };
                    })
                : []
            }
          />
        </Fragment>
      )}
      <div css={filterContainerStyles}>
        <div>
          <input
            id="within_map_filter"
            type="checkbox"
            checked={withinMap}
            onChange={(_ev) => setWithinMap(!withinMap)}
          />{' '}
          <label htmlFor="within_map_filter">Within map...</label>
        </div>
      </div>
      <div>
        <label htmlFor="layer-type-select">Layer Type</label>
        <Select
          inputId="layer-type-select"
          isMulti={true}
          isSearchable={false}
          options={layerTypeOptions}
          value={layerTypeSelections}
          onChange={(ev) => setLayerTypeSelections(ev as any)}
          css={multiSelectStyles}
          styles={reactSelectStyles as any}
        />
      </div>
      <label htmlFor="search-input">Search</label>
      <form
        css={searchContainerStyles}
        onSubmit={(ev) => {
          ev.preventDefault();
        }}
      >
        <input
          id="search-input"
          css={searchInputStyles}
          value={searchText}
          placeholder={'Search...'}
          onChange={(ev) => setSearchText(ev.target.value)}
        />
        <span css={searchSeparatorStyles} />
        <button
          css={searchButtonStyles}
          type="submit"
          onClick={(_ev) => setSearch(searchText)}
        >
          <IconSearch />
          <span className="sr-only" css={highContrastSpan}>
            Search
          </span>
        </button>
      </form>
      <label htmlFor="sort-by-select">Sort By</label>
      <div css={sortContainerStyles}>
        <Select
          inputId="sort-by-select"
          css={sortSelectStyles}
          styles={reactSelectStyles as any}
          value={sortBy}
          onChange={(ev) => {
            const evTyped = ev as SortByType;
            setSortBy(evTyped);
            setSortOrder(evTyped.defaultSort);
          }}
          options={
            [
              { value: 'none', label: 'Relevance', defaultSort: 'desc' },
              { value: 'title', label: 'Title', defaultSort: 'asc' },
              { value: 'owner', label: 'Owner', defaultSort: 'asc' },
              { value: 'avgrating', label: 'Rating', defaultSort: 'desc' },
              { value: 'numviews', label: 'Views', defaultSort: 'desc' },
              { value: 'modified', label: 'Date', defaultSort: 'desc' },
            ] as SortByType[]
          }
        />
        {sortBy.value !== 'none' && (
          <button
            css={sortOrderStyles}
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          >
            {sortOrder === 'desc' ? (
              <IconLongArrowAltUp />
            ) : (
              <IconLongArrowAltDown />
            )}
            <span className="sr-only">
              {sortOrder === 'desc' ? 'Sort Ascending' : 'Sort Descending'}
            </span>
          </button>
        )}
      </div>
      {searchResults?.data?.results &&
        searchResults.data.results.length > 0 && (
          <span className="disclaimer" css={exitDisclaimerStyles}>
            The following links exit the site{' '}
            <a
              className="exit-disclaimer"
              href="https://www.epa.gov/home/exit-epa"
              target="_blank"
              rel="noopener noreferrer"
            >
              Exit
            </a>
          </span>
        )}
      <hr />
      <div>
        {searchResults.status === 'fetching' && <LoadingSpinner />}
        {searchResults.status === 'not-logged-in' && notLoggedInMessage}
        {searchResults.status === 'failure' &&
          webServiceErrorMessage(searchResults.error)}
        {searchResults.status === 'success' && (
          <Fragment>
            <div>
              {searchResults.data?.results.map((result, index) => {
                return (
                  <Fragment key={index}>
                    <ResultCard result={result} appType={appType} />
                    <hr />
                  </Fragment>
                );
              })}
            </div>
            {!searchResults.data && (
              <div>No items for this search criteria.</div>
            )}
            {searchResults.data && (
              <div css={footerBar}>
                <button
                  css={pageControlStyles}
                  disabled={pageNumber === 1}
                  onClick={() => setPageNumber(1)}
                >
                  <IconAngleDoubleLeft />
                  <span className="sr-only">Go to first page</span>
                </button>
                <button
                  css={pageControlStyles}
                  disabled={pageNumber === 1}
                  onClick={() => setPageNumber(pageNumber - 1)}
                >
                  <IconAngleLeft />
                  <span className="sr-only">Previous</span>
                </button>
                <span>{pageNumber}</span>
                <button
                  css={pageControlStyles}
                  disabled={searchResults.data.nextQueryParams.start === -1}
                  onClick={() => setPageNumber(pageNumber + 1)}
                >
                  <IconAngleRight />
                  <span className="sr-only">Next</span>
                </button>
                <span css={totalStyles}>
                  {searchResults.data.total.toLocaleString()} Items
                </span>
              </div>
            )}
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

// --- styles (ResultCard) ---
const cardThumbnailStyles = css`
  float: left;
  margin-right: 10px;
  height: 60px;
  width: 90px;
`;

const cardTitleStyles = css`
  margin: 0 5px;
  padding: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
`;

const cardInfoStyles = css`
  font-size: 11px;
  color: #545454;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding-top: 3px;
`;

const cardButtonContainerStyles = css`
  text-align: right;
`;

const cardMessageStyles = css`
  font-size: 11px;
  font-style: italic;
  margin-left: 4px;
  margin-right: 4px;
`;

const cardButtonStyles = css`
  display: inline-block;
  font-size: 11px;
  padding: 5px;
  margin: 0 5px 0 0;

  &:disabled {
    cursor: default;
  }
`;

// --- components (ResultCard) ---
type ResultCardProps = {
  appType: AppType;
  result: any;
};

function ResultCard({ appType, result }: ResultCardProps) {
  const { portal } = useContext(AuthenticationContext);
  const { setOptions } = useContext(DialogContext);
  const { setSampleTypeSelections } = useContext(PublishContext);
  const {
    edits,
    setEdits,
    layers,
    setLayers,
    map,
    portalLayers,
    setPortalLayers,
    setReferenceLayers,
    setSelectedScenario,
    setSketchLayer,
    userDefinedOptions,
    setUserDefinedOptions,
    userDefinedAttributes,
    setUserDefinedAttributes,
  } = useContext(SketchContext);
  const { addTotsLayerAutoSelect } = useTotsLayerAdder(appType);

  // Used to determine if the layer for this card has been added or not
  const [added, setAdded] = useState(false);
  useEffect(() => {
    let added =
      portalLayers.findIndex((portalLayer) => portalLayer.id === result.id) !==
      -1;

    // check if result was added as a user defined sample type
    Object.values(userDefinedAttributes.sampleTypes).forEach((sample) => {
      if (sample.serviceId === result.id && sample.status === 'published-ago')
        added = true;
    });

    setAdded(added);
  }, [portalLayers, result, userDefinedAttributes]);

  // removes the esri watch handle when the card is removed from the DOM.
  const [status, setStatus] = useState('');

  /**
   * Removes layers that were published through TOTS. These are more complicated
   * because the layer is a hybrid between a portal layer and an editable sketch layer.
   */
  function removeTotsLayer() {
    if (!map) return;

    // get portal ids of analysis layers to remove
    const planLayer = edits.edits.find(
      (l) => l.portalId === result.id && l.type === 'scenario',
    ) as ScenarioEditsType | undefined;
    const portalIdsToRemove: string[] = [];
    planLayer?.referenceLayersTable.referenceLayers.forEach((l) => {
      if (l.type !== 'tots' || !l.layerId) return;
      portalIdsToRemove.push(l.layerId);
    });

    const newEdits = {
      count: edits.count + 1,
      edits: edits.edits.filter(
        (layer) =>
          layer.portalId !== result.id &&
          !portalIdsToRemove.includes(layer.portalId),
      ),
    };

    setLayers((layers) => {
      // remove the layers from the map and set the next sketchLayer
      const mapLayersToRemove: __esri.Layer[] = [];
      let newSketchLayer: LayerType | null = null;
      const parentLayerIds: string[] = [];
      layers.forEach((layer) => {
        if (
          layer.portalId === result.id ||
          portalIdsToRemove.includes(layer.portalId)
        ) {
          if (!layer.parentLayer && layer.sketchLayer) {
            mapLayersToRemove.push(layer.sketchLayer);
            return;
          }

          if (
            !layer.parentLayer ||
            parentLayerIds.includes(layer.parentLayer.id)
          )
            return;

          mapLayersToRemove.push(layer.parentLayer);
          parentLayerIds.push(layer.parentLayer.id);
        } else {
          if (
            !newSketchLayer &&
            (layer.layerType === 'Samples' || layer.layerType === 'VSP')
          ) {
            newSketchLayer = layer;
          }
        }
      });

      const newLayers = layers.filter(
        (layer) =>
          layer.portalId !== result.id &&
          !portalIdsToRemove.includes(layer.portalId),
      );

      // select the next scenario and active sampling layer
      const { nextScenario, nextLayer } = getNextScenarioLayer(
        newEdits,
        newLayers,
        null,
        null,
      );

      if (nextScenario) setSelectedScenario(nextScenario);
      else setSelectedScenario(null);

      if (nextLayer) setSketchLayer(nextLayer);
      else setSketchLayer(null);

      map.removeMany(mapLayersToRemove);

      // set the state
      return newLayers;
    });

    setReferenceLayers((layers) => {
      // find the feature layer ids to remove using the portal id
      const idsToRemove: string[] = [];
      layers.forEach((layer) => {
        if (layer.portalId === result.id) idsToRemove.push(layer.layerId);
      });

      // remove the map layers to remove using the list of layer ids from the
      // previous step
      const mapLayersToRemove: __esri.Layer[] = [];
      map.allLayers.forEach((layer) => {
        if (idsToRemove.includes(layer.id)) mapLayersToRemove.push(layer);
      });
      map.removeMany(mapLayersToRemove);

      // set the state
      return layers.filter((layer) => layer.portalId !== result.id);
    });

    // remove the layer from edits
    setEdits(newEdits);

    // remove the layer from portal layers
    setPortalLayers((portalLayers) =>
      portalLayers.filter(
        (portalLayer) =>
          portalLayer.id !== result.id &&
          !portalIdsToRemove.includes(portalLayer.id),
      ),
    );
  }

  function removeTotsLayerForTods() {
    if (!map) return;

    // get analysis layers linked to sample plan
    const portalLayer = portalLayers.find((l) => l.id === result.id);
    const portalIds = portalLayer?.linkedIds ?? [];
    const analysisLayers = edits.edits.filter(
      (e) => e.type === 'layer-aoi-analysis' && portalIds.includes(e.portalId),
    );
    const analysisLayerIds = analysisLayers.map((l) => {
      return {
        layerId: l.layerId,
        portalId: l.portalId,
      };
    });

    // get analysis layer ids of layers that aren't in use elswhere
    const analysisLayerIdsToRemove: string[] = [];
    const analysisPortalIdsToRemove: string[] = [];
    analysisLayerIds.forEach((ids) => {
      const inUse =
        edits.edits.findIndex(
          (e) => e.type === 'layer-decon' && e.analysisLayerId === ids.layerId,
        ) !== -1;
      if (inUse) return;

      analysisLayerIdsToRemove.push(ids.layerId);
      if (ids.portalId) analysisPortalIdsToRemove.push(ids.portalId);
    });

    // get the layers to be removed
    const layersToRemove = map.allLayers.filter((layer: any) => {
      // had to use any, since some layer types don't have portalItem
      if (
        layer?.portalItem?.id === result.id ||
        analysisLayerIdsToRemove.includes(layer?.id)
      ) {
        return true;
      } else {
        return false;
      }
    });

    setEdits((edits) => {
      return {
        count: edits.count + 1,
        edits: edits.edits.filter(
          (l) => !analysisLayerIdsToRemove.includes(l.layerId),
        ),
      };
    });

    setLayers((layers) => {
      // remove the layers from the map and set the next sketchLayer
      const mapLayersToRemove: __esri.Layer[] = [];
      const parentLayerIds: string[] = [];
      layers.forEach((layer) => {
        if (
          layer.portalId === result.id ||
          analysisPortalIdsToRemove.includes(layer.portalId)
        ) {
          if (!layer.parentLayer && layer.sketchLayer) {
            mapLayersToRemove.push(layer.sketchLayer);
            return;
          }

          if (
            !layer.parentLayer ||
            parentLayerIds.includes(layer.parentLayer.id)
          )
            return;

          mapLayersToRemove.push(layer.parentLayer);
          parentLayerIds.push(layer.parentLayer.id);
        }
      });

      const newLayers = layers.filter(
        (layer) =>
          layer.portalId !== result.id &&
          !analysisPortalIdsToRemove.includes(layer.portalId),
      );

      map.removeMany(mapLayersToRemove);

      // set the state
      return newLayers;
    });

    // remove the layers from the map and session storage.
    if (layersToRemove.length > 0) {
      map.removeMany(layersToRemove.toArray());
      setPortalLayers((portalLayers) =>
        portalLayers.filter(
          (portalLayer) =>
            portalLayer.id !== result.id &&
            !analysisPortalIdsToRemove.includes(portalLayer.id),
        ),
      );
    }
  }

  /**
   * Removes user defined sample types that were published through TOTS.
   */
  function removeTotsSampleType() {
    // Build list of sample types that need to be removed
    const typesToRemove: string[] = [];
    Object.values(userDefinedAttributes.sampleTypes).forEach((type) => {
      if (type.serviceId === result.id && type?.attributes?.TYPEUUID) {
        typesToRemove.push(type.attributes.TYPEUUID);
      }
    });

    type RemovalObject = {
      layer: LayerType;
      graphics: __esri.Graphic[];
      pointsGraphics: __esri.Graphic[];
      hybridGraphics: __esri.Graphic[];
    };
    const removalObject: RemovalObject[] = [];

    // check if any of these sample types have been used
    layers.forEach((layer) => {
      if (
        !['Samples', 'VSP'].includes(layer.layerType) ||
        !layer.sketchLayer ||
        layer.sketchLayer.type !== 'graphics'
      ) {
        return;
      }

      const graphicsToRemove: __esri.Graphic[] = [];
      layer.sketchLayer.graphics.forEach((graphic) => {
        if (typesToRemove.includes(graphic.attributes.TYPEUUID)) {
          graphicsToRemove.push(graphic);
        }
      });

      const pointsGraphicsToRemove: __esri.Graphic[] = [];
      if (layer.pointsLayer) {
        layer.pointsLayer.graphics.forEach((graphic) => {
          if (typesToRemove.includes(graphic.attributes.TYPEUUID)) {
            pointsGraphicsToRemove.push(graphic);
          }
        });
      }

      const hybridGraphicsToRemove: __esri.Graphic[] = [];
      if (layer.hybridLayer) {
        layer.hybridLayer.graphics.forEach((graphic) => {
          if (typesToRemove.includes(graphic.attributes.TYPEUUID)) {
            hybridGraphicsToRemove.push(graphic);
          }
        });
      }

      if (
        graphicsToRemove.length > 0 ||
        pointsGraphicsToRemove.length > 0 ||
        hybridGraphicsToRemove.length > 0
      ) {
        removalObject.push({
          layer: layer,
          graphics: graphicsToRemove,
          pointsGraphics: pointsGraphicsToRemove,
          hybridGraphics: hybridGraphicsToRemove,
        });
      }
    });

    function removeFromUdtOptions() {
      setSampleTypeSelections([]);
      setUserDefinedOptions(
        userDefinedOptions.filter(
          (option) => !typesToRemove.includes(option.value),
        ),
      );
      setUserDefinedAttributes((userDefined) => {
        const newUserDefined = {
          ...userDefined,
        };

        typesToRemove.forEach((typeUuid) => {
          delete newUserDefined.sampleTypes[typeUuid];
        });
        newUserDefined.editCount = newUserDefined.editCount + 1;

        return newUserDefined;
      });
    }

    // no related samples have been added, delete the sample
    // types associated with result.id (i.e. serviceId === result.id)
    if (removalObject.length === 0) {
      removeFromUdtOptions();
      return;
    }

    // some samples have been placed using these sample types
    // ask the user if they would like to continue with deleting
    setOptions({
      title: 'Would you like to continue?',
      ariaLabel: 'Would you like to continue?',
      description:
        'Samples using one or more of these sample types have been placed on the map. This operation will delete any samples associated with these sample types.',
      onContinue: () => {
        // Update the attributes of the graphics on the map on edits
        let editsCopy: EditsType = edits;
        removalObject.forEach((object) => {
          if (object.layer.sketchLayer?.type === 'graphics') {
            object.layer.sketchLayer.removeMany(object.graphics);
            if (object.layer.pointsLayer)
              object.layer.pointsLayer.removeMany(object.pointsGraphics);
            if (object.layer.hybridLayer)
              object.layer.hybridLayer.removeMany(object.hybridGraphics);

            const collection = new Collection<__esri.Graphic>();
            collection.addMany(object.graphics);
            editsCopy = updateLayerEdits({
              appType,
              edits: editsCopy,
              layer: object.layer,
              type: 'delete',
              changes: collection,
            });
          }
        });

        setEdits(editsCopy);
        removeFromUdtOptions();
      },
    });
  }

  /**
   * Removes layers that were published through TOTS. These are more complicated
   * because the layer is a hybrid between a portal layer and an editable sketch layer.
   */
  function removeTodsLayer() {
    if (!map) return;

    // figure out what aoi characterizations are linked to the plan
    const linkedDeconLayers = edits.edits.filter(
      (l) => l.portalId === result.id && l.type === 'layer-decon',
    ) as LayerDeconEditsType[];
    const linkedAnalysisLayerIds = linkedDeconLayers.map(
      (l: LayerDeconEditsType) => {
        const analysisLayer = edits.edits.find(
          (e) =>
            e.type === 'layer-aoi-analysis' && e.layerId === l.analysisLayerId,
        ) as LayerAoiAnalysisEditsType | undefined;
        return {
          layerId: l.analysisLayerId,
          portalId: analysisLayer?.portalId,
        };
      },
    );

    // remove the plan and linked decon operations from edits
    const newEdits = {
      count: edits.count + 1,
      edits: edits.edits.filter((layer) => layer.portalId !== result.id),
    };

    const analysisLayerIdsToRemove: string[] = [];
    const analysisPortalIdsToRemove: string[] = [];
    linkedAnalysisLayerIds.forEach((ids) => {
      const inUse =
        newEdits.edits.findIndex(
          (e) => e.type === 'layer-decon' && e.analysisLayerId === ids.layerId,
        ) !== -1;
      if (inUse) return;

      analysisLayerIdsToRemove.push(ids.layerId);
      if (ids.portalId) analysisPortalIdsToRemove.push(ids.portalId);
    });

    // remove analysis layers that are linked to this plan but not other plans
    newEdits.edits = newEdits.edits.filter(
      (l) => !analysisLayerIdsToRemove.includes(l.layerId),
    );

    setLayers((layers) => {
      // remove the layers from the map and set the next sketchLayer
      const mapLayersToRemove: __esri.Layer[] = [];
      let newSketchLayer: LayerType | null = null;
      const parentLayerIds: string[] = [];
      layers.forEach((layer) => {
        if (
          layer.portalId === result.id ||
          analysisPortalIdsToRemove.includes(layer.portalId)
        ) {
          if (!layer.parentLayer && layer.sketchLayer) {
            mapLayersToRemove.push(layer.sketchLayer);
            return;
          }

          if (
            !layer.parentLayer ||
            parentLayerIds.includes(layer.parentLayer.id)
          )
            return;

          mapLayersToRemove.push(layer.parentLayer);
          parentLayerIds.push(layer.parentLayer.id);
        } else {
          if (
            !newSketchLayer &&
            (layer.layerType === 'Samples' || layer.layerType === 'VSP')
          ) {
            newSketchLayer = layer;
          }
        }
      });

      const newLayers = layers.filter(
        (layer) =>
          layer.portalId !== result.id &&
          !analysisPortalIdsToRemove.includes(layer.portalId),
      );

      // select the next scenario and active sampling layer
      const { nextScenario, nextLayer } = getNextScenarioLayer(
        newEdits,
        newLayers,
        null,
        null,
      );

      if (nextScenario) setSelectedScenario(nextScenario);
      else setSelectedScenario(null);

      if (nextLayer) setSketchLayer(nextLayer);
      else setSketchLayer(null);

      map.removeMany(mapLayersToRemove);

      // set the state
      return newLayers;
    });

    setReferenceLayers((layers) => {
      // find the feature layer ids to remove using the portal id
      const idsToRemove: string[] = [];
      layers.forEach((layer) => {
        if (layer.portalId === result.id) idsToRemove.push(layer.layerId);
      });

      // remove the map layers to remove using the list of layer ids from the
      // previous step
      const mapLayersToRemove: __esri.Layer[] = [];
      map.allLayers.forEach((layer) => {
        if (idsToRemove.includes(layer.id)) mapLayersToRemove.push(layer);
      });
      map.removeMany(mapLayersToRemove);

      // set the state
      return layers.filter((layer) => layer.portalId !== result.id);
    });

    // remove the layer from edits
    setEdits(newEdits);

    // remove the layer from portal layers
    setPortalLayers((portalLayers) =>
      portalLayers.filter(
        (portalLayer) =>
          portalLayer.id !== result.id &&
          !analysisPortalIdsToRemove.includes(portalLayer.id),
      ),
    );
  }

  /**
   * Removes user defined sample types that were published through TOTS.
   */
  function removeTodsDeconType() {
    // Build list of sample types that need to be removed
    const typesToRemove: string[] = [];
    Object.values(userDefinedAttributes.sampleTypes).forEach((type) => {
      if (type.serviceId === result.id && type?.attributes?.TYPEUUID) {
        typesToRemove.push(type.attributes.TYPEUUID);
      }
    });

    type RemovalObject = {
      layer: LayerType;
      graphics: __esri.Graphic[];
      pointsGraphics: __esri.Graphic[];
      hybridGraphics: __esri.Graphic[];
    };
    const removalObject: RemovalObject[] = [];

    // check if any of these sample types have been used
    layers.forEach((layer) => {
      if (
        !['Samples', 'VSP'].includes(layer.layerType) ||
        layer.sketchLayer?.type !== 'graphics'
      ) {
        return;
      }

      const graphicsToRemove: __esri.Graphic[] = [];
      layer.sketchLayer.graphics.forEach((graphic) => {
        if (typesToRemove.includes(graphic.attributes.TYPEUUID)) {
          graphicsToRemove.push(graphic);
        }
      });

      const pointsGraphicsToRemove: __esri.Graphic[] = [];
      if (layer.pointsLayer) {
        layer.pointsLayer.graphics.forEach((graphic) => {
          if (typesToRemove.includes(graphic.attributes.TYPEUUID)) {
            pointsGraphicsToRemove.push(graphic);
          }
        });
      }

      const hybridGraphicsToRemove: __esri.Graphic[] = [];
      if (layer.hybridLayer) {
        layer.hybridLayer.graphics.forEach((graphic) => {
          if (typesToRemove.includes(graphic.attributes.TYPEUUID)) {
            hybridGraphicsToRemove.push(graphic);
          }
        });
      }

      if (
        graphicsToRemove.length > 0 ||
        pointsGraphicsToRemove.length > 0 ||
        hybridGraphicsToRemove.length > 0
      ) {
        removalObject.push({
          layer: layer,
          graphics: graphicsToRemove,
          pointsGraphics: pointsGraphicsToRemove,
          hybridGraphics: hybridGraphicsToRemove,
        });
      }
    });

    function removeFromUdtOptions() {
      setSampleTypeSelections([]);
      setUserDefinedOptions(
        userDefinedOptions.filter(
          (option) => !typesToRemove.includes(option.value),
        ),
      );
      setUserDefinedAttributes((userDefined) => {
        const newUserDefined = {
          ...userDefined,
        };

        typesToRemove.forEach((typeUuid) => {
          delete newUserDefined.sampleTypes[typeUuid];
        });
        newUserDefined.editCount = newUserDefined.editCount + 1;

        return newUserDefined;
      });
    }

    // no related samples have been added, delete the sample
    // types associated with result.id (i.e. serviceId === result.id)
    if (removalObject.length === 0) {
      removeFromUdtOptions();
      return;
    }

    // some samples have been placed using these sample types
    // ask the user if they would like to continue with deleting
    setOptions({
      title: 'Would you like to continue?',
      ariaLabel: 'Would you like to continue?',
      description:
        'Decon Applications using one or more of these decon technologies have been placed on the map. This operation will delete any decon technologies associated with these decon technologies.',
      onContinue: () => {
        // Update the attributes of the graphics on the map on edits
        let editsCopy: EditsType = edits;
        removalObject.forEach((object) => {
          if (object.layer.sketchLayer?.type === 'graphics') {
            object.layer.sketchLayer.removeMany(object.graphics);
            if (object.layer.pointsLayer)
              object.layer.pointsLayer.removeMany(object.pointsGraphics);
            if (object.layer.hybridLayer)
              object.layer.hybridLayer.removeMany(object.hybridGraphics);

            const collection = new Collection<__esri.Graphic>();
            collection.addMany(object.graphics);
            editsCopy = updateLayerEdits({
              appType,
              edits: editsCopy,
              layer: object.layer,
              type: 'delete',
              changes: collection,
            });
          }
        });

        setEdits(editsCopy);
        removeFromUdtOptions();
      },
    });
  }

  /**
   * Removes the aoi characterization layer.
   */
  function removeAoiCharacterizationLayer() {
    if (!map) return;

    // prevent removal if it is linked to something
    const aoiEditId = edits.edits.find(
      (e) => e.type === 'layer-aoi-analysis' && e.portalId === result.id,
    )?.layerId;
    const linkedAoiLayers = edits.edits.filter(
      (e) => e.type === 'layer-decon' && e.analysisLayerId === aoiEditId,
    );

    if (linkedAoiLayers.length > 0) {
      setOptions({
        title: 'Cannot Remove',
        ariaLabel: 'Cannot Remove',
        description: `Cannot remove the "${result.title}" layer since it is linked to at least one decon operation. Please unlink the layer and try again.`,
        onCancel: () => {},
      });
      return;
    }

    const newEdits = {
      count: edits.count + 1,
      edits: edits.edits.filter((layer) => layer.portalId !== result.id),
    };

    setLayers((layers) => {
      // remove the layers from the map and set the next sketchLayer
      const mapLayersToRemove: __esri.Layer[] = [];
      let newSketchLayer: LayerType | null = null;
      const parentLayerIds: string[] = [];
      layers.forEach((layer) => {
        if (layer.portalId === result.id) {
          if (!layer.parentLayer && layer.sketchLayer) {
            mapLayersToRemove.push(layer.sketchLayer);
            return;
          }

          if (
            !layer.parentLayer ||
            parentLayerIds.includes(layer.parentLayer.id)
          )
            return;

          mapLayersToRemove.push(layer.parentLayer);
          parentLayerIds.push(layer.parentLayer.id);
        } else {
          if (
            !newSketchLayer &&
            (layer.layerType === 'Samples' || layer.layerType === 'VSP')
          ) {
            newSketchLayer = layer;
          }
        }
      });

      const newLayers = layers.filter((layer) => layer.portalId !== result.id);
      map.removeMany(mapLayersToRemove);

      // set the state
      return newLayers;
    });

    // remove the layer from edits
    setEdits(newEdits);

    // remove the layer from portal layers
    setPortalLayers((portalLayers) =>
      portalLayers.filter((portalLayer) => portalLayer.id !== result.id),
    );
  }

  /**
   * Removes the staging area layer.
   */
  function removeStagingAreaLayer() {
    if (!map) return;

    const newEdits = {
      count: edits.count + 1,
      edits: edits.edits.filter((layer) => layer.portalId !== result.id),
    };

    setLayers((layers) => {
      // remove the layers from the map and set the next sketchLayer
      const mapLayersToRemove: __esri.Layer[] = [];
      const parentLayerIds: string[] = [];
      layers.forEach((layer) => {
        if (layer.portalId === result.id) {
          if (!layer.parentLayer && layer.sketchLayer) {
            mapLayersToRemove.push(layer.sketchLayer);
            return;
          }

          if (
            !layer.parentLayer ||
            parentLayerIds.includes(layer.parentLayer.id)
          )
            return;

          mapLayersToRemove.push(layer.parentLayer);
          parentLayerIds.push(layer.parentLayer.id);
        }
      });

      const newLayers = layers.filter((layer) => layer.portalId !== result.id);
      map.removeMany(mapLayersToRemove);

      // set the state
      return newLayers;
    });

    // remove the layer from edits
    setEdits(newEdits);

    // remove the layer from portal layers
    setPortalLayers((portalLayers) =>
      portalLayers.filter((portalLayer) => portalLayer.id !== result.id),
    );
  }

  /**
   * Removes the reference portal layers.
   */
  function removeRefLayer() {
    if (!map) return;

    // get the layers to be removed
    const layersToRemove = map.allLayers.filter((layer: any) => {
      // had to use any, since some layer types don't have portalItem
      if (layer?.portalItem?.id === result.id) {
        return true;
      } else {
        return false;
      }
    });

    // remove the layers from the map and session storage.
    if (layersToRemove.length > 0) {
      map.removeMany(layersToRemove.toArray());
      setPortalLayers((portalLayers) =>
        portalLayers.filter((portalLayer) => portalLayer.id !== result.id),
      );
    }
  }

  let resultType = result.type;
  if (
    result?.categories?.includes('contains-epa-tots-user-defined-sample-types')
  ) {
    resultType = 'Sample Types';
  }

  return (
    <div>
      <img
        css={cardThumbnailStyles}
        src={result.thumbnailUrl}
        alt={`${result.title} Thumbnail`}
      />
      <h3 css={cardTitleStyles}>{result.title}</h3>
      <span css={cardInfoStyles}>
        {resultType} by {result.owner}
      </span>
      <br />
      <div css={cardButtonContainerStyles}>
        <span css={cardMessageStyles}>
          {status === 'loading' && 'Adding...'}
          {status === 'error' && 'Add Failed'}
          {status === 'canceled' && 'Canceled'}
          {status === 'no-data' && 'No Data'}
        </span>
        {map && (
          <Fragment>
            {!added && (
              <button
                css={cardButtonStyles}
                disabled={status === 'loading'}
                onClick={() =>
                  addTotsLayerAutoSelect(result, portal, setStatus)
                }
              >
                Add
              </button>
            )}
            {added && !status && (
              <button
                css={cardButtonStyles}
                onClick={() => {
                  // determine whether the layer has a tots sample layer or not
                  // and add the layer accordingly
                  const categories = result?.categories;
                  if (categories?.includes('contains-epa-tots-sample-layer')) {
                    if (appType === 'sampling') removeTotsLayer();
                    if (appType === 'decon') removeTotsLayerForTods();
                  } else if (
                    categories?.includes(
                      'contains-epa-tots-user-defined-sample-types',
                    )
                  ) {
                    removeTotsSampleType();
                  } else if (
                    categories?.includes('contains-epa-tods-decon-layer')
                  ) {
                    removeTodsLayer();
                  } else if (
                    categories?.includes(
                      'contains-epa-tots-aoi-characterization',
                    )
                  ) {
                    removeAoiCharacterizationLayer();
                  } else if (
                    categories?.includes('contains-epa-tots-staging-area')
                  ) {
                    removeStagingAreaLayer();
                  } else if (
                    categories?.includes(
                      'contains-epa-tods-user-defined-decon-tech',
                    )
                  ) {
                    removeTodsDeconType();
                  } else {
                    removeRefLayer();
                  }
                }}
              >
                Remove
              </button>
            )}
          </Fragment>
        )}
        <a
          css={cardButtonStyles}
          href={`https://arcgis.com/home/item.html?id=${result.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Layer Details
        </a>
      </div>
    </div>
  );
}

export default SearchPanel;
