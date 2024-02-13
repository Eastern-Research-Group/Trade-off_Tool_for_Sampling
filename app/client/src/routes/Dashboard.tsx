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
import Highcharts from 'highcharts';
import highchartsAccessibility from 'highcharts/modules/accessibility';
import highchartsExporting from 'highcharts/modules/exporting';
import highchartsMore from 'highcharts/highcharts-more';
import HighchartsReact from 'highcharts-react-official';
import solidGauge from 'highcharts/modules/solid-gauge';
import RGL, { WidthProvider } from 'react-grid-layout';
import { AsyncPaginate, wrapMenuList } from 'react-select-async-paginate';
import { css } from '@emotion/react';
import { useWindowSize } from '@reach/window-size';
import CSVLayer from '@arcgis/core/layers/CSVLayer';
import Field from '@arcgis/core/layers/support/Field';
import GeoRSSLayer from '@arcgis/core/layers/GeoRSSLayer';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import KMLLayer from '@arcgis/core/layers/KMLLayer';
import Layer from '@arcgis/core/layers/Layer';
import Portal from '@arcgis/core/portal/Portal';
import PortalItem from '@arcgis/core/portal/PortalItem';
import WMSLayer from '@arcgis/core/layers/WMSLayer';
import * as rendererJsonUtils from '@arcgis/core/renderers/support/jsonUtils';
// components
import MapDashboard from 'components/MapDashboard';
import { MenuList as CustomMenuList } from 'components/MenuList';
import Toolbar from 'components/Toolbar';
import TestingToolbar from 'components/TestingToolbar';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { settingDefaults } from 'contexts/Calculate';
import { DialogContext } from 'contexts/Dialog';
import { useLayerProps } from 'contexts/LookupFiles';
import { SketchContext } from 'contexts/Sketch';
// utilities
import {
  buildCustomAttributeFromField,
  deleteFeatureLayer,
  getAllFeatures,
  getFeatureLayer,
  getFeatureLayers,
} from 'utils/arcGisRestUtils';
import { useAbort, useDynamicPopup, useSessionStorage } from 'utils/hooks';
import {
  calculatePlan,
  convertToPoint,
  getSimplePopupTemplate,
} from 'utils/sketchUtils';
import { isAbort } from 'utils/utils';
// types
import { Attributes, DefaultSymbolsType } from 'config/sampleAttributes';
import { AttributesType } from 'types/Publish';
import type { LoadOptions } from 'react-select-async-paginate';
// config
import { dashboardLoadFailed, notLoggedInMessage } from 'config/errorMessages';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import LoadingSpinner from 'components/LoadingSpinner';
// styles
import { linkButtonStyles } from 'styles';

// add features for highcharts
highchartsAccessibility(Highcharts);
highchartsExporting(Highcharts);
highchartsMore(Highcharts);
solidGauge(Highcharts);

const ReactGridLayout = WidthProvider(RGL);

type LayerGraphics = {
  [key: string]: __esri.Graphic[];
};

function appendToQuery(query: string, part: string, separator: string = 'AND') {
  // nothing to append
  if (part.length === 0) return query;

  // append the query part
  if (query.length > 0) return `${query} ${separator} (${part})`;
  else return `(${part})`;
}

function roundNumber(num: number) {
  return parseFloat((num ?? 0).toLocaleString().replaceAll(',', ''));
}

function Dashboard() {
  const { abort } = useAbort();
  const { hasCheckedSignInStatus, portal, signedIn } = useContext(
    AuthenticationContext,
  );
  const {
    defaultSymbols,
    displayDimensions,
    displayGeometryType,
    layers,
    mapDashboard,
    mapViewDashboard,
    sampleAttributes,
    sceneViewDashboard,
    sceneViewForAreaDashboard,
    selectedScenario,
  } = useContext(SketchContext);
  useSessionStorage();
  const layerProps = useLayerProps();
  const getPopupTemplate = useDynamicPopup();

  const { height, width } = useWindowSize();

  // calculate height of div holding actions info
  const [contentHeight, setContentHeight] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  // calculate height of div holding actions info
  const toolbarRef = useCallback((node: HTMLDivElement) => {
    if (!node) return;
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { height } = entries[0].contentRect;
        setToolbarHeight(height);
      }
    });
    resizeObserver.observe(node);
  }, []);

  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const elementRef = useCallback((node: HTMLDivElement) => {
    if (!node) return;
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { height, width } = entries[0].contentRect;
        setContainerHeight(height);
        setContainerWidth(width);
      }
    });
    resizeObserver.observe(node);
  }, []);

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
  useEffect(() => {
    if (!totsRef?.current) return;

    const clientHeight = totsRef.current.clientHeight;
    if (contentHeight !== clientHeight) setContentHeight(clientHeight);
  }, [contentHeight, height, totsRef, width]);

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
        return {
          created: item.created,
          label: item.title,
          value: item.id,
          url: item.url,
        };
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

  async function loadPlan(selectedPlan: Option) {
    if (!selectedPlan || !portal || !mapDashboard) return;

    const tempPortal = portal as any;
    const token = tempPortal.credential.token;

    // get the list of feature layers in this feature server
    const featureLayersRes: any = await getFeatureLayers(
      selectedPlan.url,
      token,
    );

    // fire off requests to get the details and features for each layer
    const layerPromises: Promise<any>[] = [];

    // ensure -points layer calls are done last
    const resPolys: any[] = [];
    const resPoints: any[] = [];
    featureLayersRes.layers.forEach((layer: any) => {
      if (layer.geometryType === 'esriGeometryPoint') {
        resPoints.push(layer);
      } else {
        resPolys.push(layer);
      }
    });

    const resSampleTypes: any[] = [];
    const resRefLayersTypes: any[] = [];
    const resCalculateSettings: any[] = [];
    featureLayersRes.tables.forEach((table: any) => {
      if (table.name.endsWith('-sample-types')) {
        resSampleTypes.push(table);
      }
      if (table.name.endsWith('-reference-layers')) {
        resRefLayersTypes.push(table);
      }
      if (table.name.endsWith('-calculate-settings')) {
        resCalculateSettings.push(table);
      }
    });

    // fire off the calls with the points layers last
    const resCombined = [
      ...resCalculateSettings,
      ...resRefLayersTypes,
      ...resSampleTypes,
      ...resPolys,
      ...resPoints,
    ];
    resCombined.forEach((layer: any) => {
      // get the layer details promise
      const layerCall = getFeatureLayer(selectedPlan.url, token, layer.id);
      layerPromises.push(layerCall);
    });

    // wait for layer detail promises to resolve
    const layerDetailResponses = await Promise.all(layerPromises);

    // fire off requests for features of each layer using the objectIdField
    const featurePromises: any[] = [];
    layerDetailResponses.forEach((layerDetails: any) => {
      // get the layer features promise
      const featuresCall = getAllFeatures(
        portal,
        selectedPlan.url + '/' + layerDetails.id,
        layerDetails.objectIdField,
      );
      featurePromises.push(featuresCall);
    });

    // wait for feature promises to resolve
    const featureResponses = await Promise.all(featurePromises);

    // load tables into tables property of group layer of plan
    // define items used for updating states
    const newAttributes: Attributes = {};
    const newCustomAttributes: AttributesType[] = [];
    const zoomToGraphics: __esri.Graphic[] = [];

    let isSampleLayer = false;
    let isVspLayer = false;
    let isPointsSampleLayer = false;
    let isVspPointsSampleLayer = false;
    const typesLoop = (type: __esri.FeatureType) => {
      if (type.id === 'epa-tots-vsp-layer') isVspLayer = true;
      if (type.id === 'epa-tots-sample-layer') isSampleLayer = true;
      if (type.id === 'epa-tots-sample-points-layer')
        isPointsSampleLayer = true;
      if (type.id === 'epa-tots-vsp-points-layer')
        isVspPointsSampleLayer = true;
    };

    let fields: __esri.Field[] = [];
    const fieldsLoop = (field: __esri.Field) => {
      fields.push(Field.fromJSON(field));
    };

    // get the popup template
    const popupTemplate = getPopupTemplate('Samples', false, false);

    const planLayer = new GroupLayer({
      title: selectedPlan.label,
      id: selectedPlan.value,
    });

    const layersToAdd: __esri.Layer[] = [];

    // create the layers to be added to the map
    for (let i = 0; i < layerDetailResponses.length; i++) {
      const layerDetails = layerDetailResponses[i];
      const layerFeatures = featureResponses[i];
      const scenarioName = layerDetails.name;

      // figure out if this layer is a sample layer or not
      isSampleLayer = false;
      isVspLayer = false;
      if (layerDetails?.types) {
        layerDetails.types.forEach(typesLoop);
      }

      // add sample layers as graphics layers
      if (layerDetails.type === 'Table') {
        if (layerDetails.name.endsWith('-reference-layers')) {
          for (const f of layerFeatures.features) {
            const { TYPE, URL: url, URLTYPE, LAYERID: id } = f.attributes;

            if (TYPE === 'arcgis') {
              const layer = await Layer.fromPortalItem({
                portalItem: new PortalItem({ id }),
              });
              layersToAdd.push(layer);
            }

            if (TYPE === 'url') {
              if (URLTYPE === 'tots') continue;

              let layer;
              if (URLTYPE === 'ArcGIS') {
                layer = await Layer.fromArcGISServerUrl({
                  url,
                  properties: { id },
                });
              }
              if (URLTYPE === 'WMS') {
                layer = new WMSLayer({ url, id });
              }
              /* // not supported in 4.x js api
                if(TYPE === 'WFS') {
                  layer = new WFSLayer({ url, id });
                } */
              if (URLTYPE === 'KML') {
                layer = new KMLLayer({ url, id });
              }
              if (URLTYPE === 'GeoRSS') {
                layer = new GeoRSSLayer({ url, id });
              }
              if (URLTYPE === 'CSV') {
                layer = new CSVLayer({ url, id });
              }

              if (layer) layersToAdd.push(layer);
            }
          }
        } else {
          planLayer.tables.add(
            new FeatureLayer({
              title: layerDetails.name,
              url: `${selectedPlan.url}/${layerDetails.id}`,
            }),
          );

          if (layerDetails.name.endsWith('-sample-types')) {
            layerFeatures.features.forEach((feature: any) => {
              const typeUuid = feature.attributes.TYPEUUID;
              if (!newAttributes.hasOwnProperty(typeUuid)) {
                newAttributes[typeUuid] = feature.attributes;
              }
            });
          }
        }
      } else if (isPointsSampleLayer || isVspPointsSampleLayer) {
        // Do nothing
      } else if (isSampleLayer || isVspLayer) {
        let newDefaultSymbols: DefaultSymbolsType = {
          editCount: defaultSymbols.editCount + 1,
          symbols: { ...defaultSymbols.symbols },
        };

        // add symbol styles if necessary
        const uniqueValueInfos =
          layerDetails?.drawingInfo?.renderer?.uniqueValueInfos;
        if (uniqueValueInfos) {
          uniqueValueInfos.forEach((value: any) => {
            // exit if value exists already
            if (defaultSymbols.symbols.hasOwnProperty(value.value)) {
              return;
            }

            newDefaultSymbols.symbols[value.value] = {
              type: 'simple-fill',
              color: [
                value.symbol.color[0],
                value.symbol.color[1],
                value.symbol.color[2],
                value.symbol.color[3] / 255,
              ],
              outline: {
                color: [
                  value.symbol.outline.color[0],
                  value.symbol.outline.color[1],
                  value.symbol.outline.color[2],
                  value.symbol.outline.color[3] / 255,
                ],
                width: value.symbol.outline.width,
              },
            };
          });
        }

        // get the graphics from the layer
        const graphics: LayerGraphics = {};
        for (const feature of layerFeatures.features) {
          // layerFeatures.features.forEach((feature: any) => {
          const graphic: any = Graphic.fromJSON(feature);
          if (graphic.geometry) {
            graphic.geometry.spatialReference = {
              wkid: 3857,
            };
          }
          graphic.popupTemplate = popupTemplate;

          const newGraphic: any = {
            geometry: graphic.geometry,
            symbol: graphic.symbol,
            popupTemplate: graphic.popupTemplate,
          };

          // Add the user defined type if it does not exist
          const typeUuid = feature.attributes.TYPEUUID;
          let customAttributes = {};
          if (newAttributes.hasOwnProperty(typeUuid)) {
            customAttributes = newAttributes[typeUuid];
          } else if (sampleAttributes.hasOwnProperty(typeUuid)) {
            customAttributes = sampleAttributes[typeUuid];
          }
          newGraphic.attributes = {
            ...customAttributes,
            ...graphic.attributes,
          };

          newGraphic.symbol =
            newDefaultSymbols.symbols[
              newDefaultSymbols.symbols.hasOwnProperty(typeUuid)
                ? typeUuid
                : 'Samples'
            ];
          if (newDefaultSymbols.symbols.hasOwnProperty(typeUuid)) {
            graphic.symbol = newDefaultSymbols.symbols[typeUuid];
          }

          zoomToGraphics.push(graphic);

          // add the graphic to the correct layer uuid
          const decisionUuid = newGraphic.attributes.DECISIONUNITUUID;
          if (graphics.hasOwnProperty(decisionUuid)) {
            graphics[decisionUuid].push(newGraphic);
          } else {
            graphics[decisionUuid] = [newGraphic];
          }
        }

        // need to build the scenario and group layer here
        const defaultFields = layerProps.data.defaultFields;
        let index = 0;
        for (const field of layerDetails.fields) {
          if (['Shape__Area', 'Shape__Length'].includes(field.name)) continue;

          const wasAlreadyAdded =
            newCustomAttributes.findIndex((f: any) => f.name === field.name) >
            -1;
          if (wasAlreadyAdded) continue;

          const isDefaultField =
            defaultFields.findIndex((f: any) => f.name === field.name) > -1;
          if (isDefaultField) continue;

          newCustomAttributes.push(buildCustomAttributeFromField(field, index));
          index += 1;
        }

        // loop through the graphics uuids and add the necessary
        // layers to the scenario along with the graphics
        const keys = Object.keys(graphics);
        for (let j = 0; j < keys.length; j++) {
          const uuid = keys[j];
          const graphicsList = graphics[uuid];
          const firstAttributes = graphicsList[0].attributes;
          const layerName = firstAttributes.DECISIONUNIT
            ? firstAttributes.DECISIONUNIT
            : scenarioName;

          // build the graphics layer
          const graphicsLayer = new GraphicsLayer({
            id: firstAttributes.DECISIONUNITUUID,
            graphics: graphicsList,
            title: layerName,
          });

          // convert the polygon graphics into points
          let pointGraphics: __esri.Graphic[] = [];
          let hybridGraphics: __esri.Graphic[] = [];
          graphicsList.forEach((graphicParams) => {
            const graphic = new Graphic(graphicParams);
            pointGraphics.push(convertToPoint(graphic));
            hybridGraphics.push(
              graphic.attributes.ShapeType === 'point'
                ? convertToPoint(graphic)
                : graphic.clone(),
            );
          });

          const pointsLayer = new GraphicsLayer({
            id: firstAttributes.DECISIONUNITUUID + '-points',
            graphics: pointGraphics,
            title: layerName,
            visible: false,
            listMode: 'hide',
          });

          const hybridLayer = new GraphicsLayer({
            id: firstAttributes.DECISIONUNITUUID + '-hybrid',
            graphics: hybridGraphics,
            title: layerName,
            visible: false,
            listMode: 'hide',
          });

          planLayer.addMany([graphicsLayer, pointsLayer, hybridLayer]);
        }
      } else {
        // add non-sample layers as feature layers
        fields = [];
        layerDetails.fields.forEach(fieldsLoop);

        const source: __esri.Graphic[] = [];
        layerFeatures.features.forEach((feature: any) => {
          const graphic: any = Graphic.fromJSON(feature);
          if (graphic?.geometry) {
            graphic.geometry.spatialReference = {
              wkid: 3857,
            };
          }
          source.push(graphic);
        });

        // use jsonUtils to convert the REST API renderer to an ArcGIS JS renderer
        const renderer: __esri.Renderer = rendererJsonUtils.fromJSON(
          layerDetails.drawingInfo.renderer,
        );

        // create the popup template if popup information was provided
        let popupTemplate;
        if (layerDetails.popupInfo) {
          popupTemplate = {
            title: layerDetails.popupInfo.title,
            content: layerDetails.popupInfo.description,
          };
        }
        // if no popup template, then make the template all of the attributes
        if (!layerDetails.popupInfo && source.length > 0) {
          popupTemplate = getSimplePopupTemplate(source[0].attributes);
        }

        // add the feature layer
        const featureLayerProps: __esri.FeatureLayerProperties = {
          fields,
          source,
          objectIdField: layerFeatures.objectIdFieldName,
          outFields: ['*'],
          title: layerDetails.name,
          renderer,
          popupTemplate,
        };
        const featureLayer = new FeatureLayer(featureLayerProps);
        layersToAdd.push(featureLayer);
      }
    }

    // get the age of the layer in seconds
    const created: number = new Date(selectedPlan.created).getTime();
    const curTime: number = Date.now();
    const duration = (curTime - created) / 1000;

    mapDashboard.removeAll();
    layersToAdd.push(planLayer);
    mapDashboard.layers.addMany(layersToAdd);

    // validate the area and attributes of features of the uploads. If there is an
    // issue, display a popup asking the user if they would like the samples to be updated.
    if (zoomToGraphics.length > 0) {
      // zoom to the graphics layer
      if (mapViewDashboard && displayDimensions === '2d')
        mapViewDashboard.goTo(zoomToGraphics);
      if (sceneViewDashboard && displayDimensions === '3d')
        sceneViewDashboard.goTo(zoomToGraphics);
    } else if (zoomToGraphics.length === 0 && duration < 300) {
      // display a message if the layer is empty and the layer is less
      // than 5 minutes old
      setOptions({
        title: 'No Data',
        ariaLabel: 'No Data',
        description: `The "${selectedPlan.label}" layer was recently added and currently does not have any data. This could be due to a delay in processing the new data. Please try again later.`,
        // onCancel: () => setStatus('no-data'), // TODO
      });
    }

    return planLayer;
  }

  const [planCalculations, setPlanCalculations] = useState<any>(null);
  async function refreshData(plan: Option) {
    setStatus('fetching');

    try {
      const planLayer = await loadPlan(plan);

      if (planLayer && sceneViewForAreaDashboard) {
        const layersParam = planLayer.layers
          .filter(
            (l) =>
              !l.id?.includes('-points') &&
              !l.id?.includes('-hybrid') &&
              l.type === 'graphics',
          )
          .toArray() as __esri.GraphicsLayer[];

        let calculateSettings = settingDefaults;

        // get calculate settings
        const calcSettingsTable = planLayer.tables.find((l) =>
          l.title.endsWith('-calculate-settings'),
        ) as __esri.FeatureLayer;
        if (calcSettingsTable) {
          try {
            const tmp = await calcSettingsTable.queryFeatures({
              where: '1=1',
              outFields: ['*'],
            });

            if (tmp.features.length > 0) {
              calculateSettings = tmp.features[0].attributes;
            }
          } catch (ex) {}
        }

        const output = await calculatePlan(
          layersParam,
          sceneViewForAreaDashboard,
          calculateSettings,
        );
        setPlanCalculations(output);
      }

      setStatus('success');
    } catch (ex) {
      console.error(ex);
      setStatus('failure');
      window.logErrorToGa(ex);
    }
  }

  useEffect(() => {
    console.log('planCalculations: ', planCalculations);
  }, [planCalculations]);

  useEffect(() => {
    if (!mapDashboard || !selectedPlan) return;

    // Loop through the layers and switch between point/polygon representations
    const tmpLayer = mapDashboard.layers.find(
      (l) => l.id === selectedPlan.value,
    );
    if (!tmpLayer || tmpLayer.type !== 'group') return;

    (tmpLayer as __esri.GroupLayer).layers.forEach((layer) => {
      const isPointsLayer = layer.id.endsWith('-points');
      const isHybridLayer = layer.id.endsWith('-hybrid');

      if (displayGeometryType === 'points') {
        if (isPointsLayer) {
          layer.listMode = 'show';
          layer.visible = true;
        } else if (isHybridLayer) {
          layer.listMode = 'hide';
          layer.visible = false;
        } else {
          layer.listMode = 'hide';
          layer.visible = false;
        }
      } else if (displayGeometryType === 'polygons') {
        if (isPointsLayer) {
          layer.listMode = 'hide';
          layer.visible = false;
        } else if (isHybridLayer) {
          layer.listMode = 'hide';
          layer.visible = false;
        } else {
          layer.listMode = 'show';
          layer.visible = true;
        }
      } else if (displayGeometryType === 'hybrid') {
        if (isPointsLayer) {
          layer.listMode = 'hide';
          layer.visible = false;
        } else if (isHybridLayer) {
          layer.listMode = 'show';
          layer.visible = true;
        } else {
          layer.listMode = 'hide';
          layer.visible = false;
        }
      }
    });
  }, [displayGeometryType, mapDashboard, selectedPlan]);

  const [layerToDeleteId, setLayerToDeleteId] = useState(-1);

  const layout = [
    {
      i: 'a',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      static: true,
      contents: <CostsChart planCalculations={planCalculations} />,
    },
    {
      i: 'b',
      x: 0,
      y: 1,
      w: 1,
      h: 1,
      static: true,
      contents: <Gauge planCalculations={planCalculations} />,
    },
    {
      i: 'c',
      x: 1,
      y: 0,
      w: 1,
      h: 2,
      static: true,
      contents: (
        <div id="tots-map-div" css={mapHeightStyles}>
          <MapDashboard height={containerHeight - 33} />
        </div>
      ),
    },
  ];
  const originalGridLayout = layout.map((l) => {
    return {
      ...l,
      contents: undefined,
    };
  });

  const [gridLayout, setGridLayout] = useState<any>(originalGridLayout);
  const [fullscreenKey, setFullscreenKey] = useState('');
  const [hoverKey, setHoverKey] = useState('');
  const [status, setStatus] = useState<
    'none' | 'fetching' | 'success' | 'failure'
  >('none');

  return (
    <div className="tots" ref={totsRef}>
      <div css={appStyles}>
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

          <div css={toolbarContainerStyles}>
            <div css={planSelectSectionStyles}>
              {signedIn ? (
                <Fragment>
                  <label htmlFor="plan-select">Plan:</label>
                  <div css={planSelectContainerStyles}>
                    <AsyncPaginate
                      aria-label="Plan input"
                      className="width-full"
                      classNames={{
                        container: () => 'font-ui-xs',
                        menuList: () => 'font-ui-xs',
                      }}
                      components={{ MenuList: wrapMenuList(CustomMenuList) }}
                      isDisabled={status === 'fetching'}
                      inputId="plan-select"
                      instanceId="plan-select"
                      loadOptions={loadOptions}
                      menuPortalTarget={document.body}
                      onChange={(ev) => {
                        const plan = ev as Option;
                        setSelectedPlan(plan);
                        refreshData(plan);
                      }}
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
                    {selectedPlan && (
                      <button
                        css={refreshButtonStyles}
                        disabled={status === 'fetching'}
                        onClick={() => {
                          refreshData(selectedPlan);
                        }}
                      >
                        <i
                          className={`esri-icon-refresh ${status === 'fetching' && 'esri-rotating'}`}
                        />
                      </button>
                    )}
                  </div>
                </Fragment>
              ) : hasCheckedSignInStatus ? (
                notLoggedInMessage
              ) : (
                <LoadingSpinner />
              )}
            </div>
            {status === 'failure' && dashboardLoadFailed}
            {false && window.location.search.includes('devMode=true') && (
              <div
                css={css`
                  align-items: center;
                `}
              >
                <input
                  type="number"
                  value={layerToDeleteId}
                  onChange={(ev: any) => setLayerToDeleteId(ev.target.value)}
                />
                <button
                  onClick={() => {
                    if (layerToDeleteId === -1 || !portal || !selectedPlan)
                      return;

                    deleteFeatureLayer(
                      portal,
                      selectedPlan.url,
                      layerToDeleteId,
                    );

                    setLayerToDeleteId(-1);
                  }}
                >
                  Test
                </button>
              </div>
            )}
          </div>
        </div>
        <div ref={elementRef} css={containerStyles(toolbarHeight)}>
          <ReactGridLayout
            className="layout"
            allowOverlap={true}
            layout={gridLayout}
            useCSSTransforms={true}
            cols={2}
            rowHeight={containerHeight / 2 - 20}
            width={containerWidth - 20}
          >
            {layout.map((item: any) => {
              const isFullscreen = item.i === fullscreenKey;
              return (
                <div
                  key={item.i}
                  css={gridCellStyles(fullscreenKey !== '' && !isFullscreen)}
                  onMouseEnter={() => setHoverKey(item.i)}
                  onMouseLeave={() => setHoverKey('')}
                >
                  {hoverKey === item.i && (
                    <button
                      css={fullscreenButtonStyles}
                      onClick={() => {
                        if (gridLayout.length === 1) {
                          setGridLayout(originalGridLayout);
                          setFullscreenKey('');
                        } else {
                          setGridLayout([
                            {
                              i: item.i,
                              x: 0,
                              y: 0,
                              w: 2,
                              h: 2,
                              isDraggable: false,
                              isResizable: false,
                            },
                          ]);
                          setFullscreenKey(item.i);
                        }
                      }}
                    >
                      {isFullscreen ? collapseIcon : expandIcon}
                    </button>
                  )}
                  {item.contents}
                </div>
              );
            })}
          </ReactGridLayout>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

const collapseIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width="12px"
    height="12px"
  >
    <path
      vectorEffect="non-scaling-stroke"
      d="M11.719 11.06l3.633 3.585-.704.71L11 11.756v3.205h-1v-4.9h5v1zM5 4.245L1.352.644l-.704.711L4.281 4.94H1v1h5v-4.9H5zM14.96 5h-3.204l3.6-3.648-.711-.704-3.584 3.633V1h-1v5h4.9zM1.04 11h3.204l-3.6 3.648.711.704 3.584-3.633V15h1v-5h-4.9z"
    ></path>
  </svg>
);

const expandIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width="12px"
    height="12px"
  >
    <path
      vectorEffect="non-scaling-stroke"
      d="M9.645 5.648L13.244 2h-3.205V1h4.9v5h-1V2.719l-3.584 3.633zm-4 4L2.06 13.281V10h-1v5h4.9v-1H2.756l3.6-3.648zM14 10.04v3.205l-3.648-3.6-.704.711 3.633 3.584H10v1h5v-4.9zM2 2.756l3.648 3.6.704-.711L2.719 2.06H6v-1H1v4.9h1z"
    ></path>
  </svg>
);

function CostsChart({ planCalculations }: { planCalculations: any }) {
  if (planCalculations?.status !== 'success' || !planCalculations?.data)
    return null;

  Highcharts.setOptions({
    plotOptions: {
      series: {
        animation: false,
      },
    },
  });

  const data = [
    { label: 'Total Cost', key: 'Total Cost' },
    { label: 'Total Sampling Cost', key: 'Total Sampling Cost' },
    { label: 'Sampling Material Cost', key: 'Sampling Material Cost' },
    { label: 'Sampling Labor Cost', key: 'Total Labor Cost' },
    { label: 'Total Analysis Cost', key: 'Total Analysis Cost' },
    { label: 'Analysis Material Cost', key: 'Analysis Material Cost' },
    { label: 'Analysis Labor Cost', key: 'Analysis Labor Cost' },
  ];

  return (
    <HighchartsReact
      highcharts={Highcharts}
      containerProps={{ style: { height: '100%', width: '100%' } }}
      options={{
        title: { text: 'Costs' },
        credits: { enabled: false },
        chart: {
          animation: false,
          type: 'bar',
          // style: { fontFamily: fonts.primary },
          // height: responsiveBarChartHeight,
          plotBackgroundColor: null,
          plotBorderWidth: null,
          plotShadow: false,
        },
        // exporting: {
        //   buttons: {
        //     contextButton: {
        //       menuItems: [
        //         'downloadPNG',
        //         'downloadJPEG',
        //         'downloadPDF',
        //         'downloadSVG',
        //       ],
        //       theme: {
        //         fill: 'rgba(0, 0, 0, 0)',
        //         states: {
        //           hover: {
        //             fill: 'rgba(0, 0, 0, 0)',
        //           },
        //           select: {
        //             fill: 'rgba(0, 0, 0, 0)',
        //             stroke: '#666666',
        //           },
        //         },
        //       },
        //     },
        //   },
        //   chartOptions: {
        //     plotOptions: {
        //       series: {
        //         dataLabels: {
        //           enabled: true,
        //         },
        //       },
        //     },
        //   },
        //   // filename: `${activeState.label.replaceAll(
        //   //   ' ',
        //   //   '_',
        //   // )}_Site_Specific`,
        // },
        tooltip: {
          //   formatter: function () {
          //     return `${(this as any).key}<br/>
          // ${(this as any).series.name}: <b>${(this as any).y.toLocaleString()}</b>`;
          //   },
          formatter: function () {
            /* Build the 'header'.  Note that you can wrap this.x in something
             * like Highcharts.dateFormat('%A, %b %e, %H:%M:%S', this.x)
             * if you are dealing with a time series to display a more
             * prettily-formatted date value.
             */
            let s = `${(this as any).key}<br/>`;

            for (let i = 0; i < (this as any).points.length; i++) {
              const myPoint = (this as any).points[i];
              s +=
                '<span style="color:' +
                myPoint.series.color +
                '">\u25CF</span>' +
                myPoint.series.name +
                ': ';

              /* Need to check whether or not we are dealing with an
               * area range plot and display a range if we are
               */
              s += '<strong>';
              if (myPoint.point.low && myPoint.point.high) {
                s +=
                  myPoint.point.low.toLocaleString() +
                  ' - ' +
                  myPoint.point.high.toLocaleString();
              } else {
                s += myPoint.y.toLocaleString();
              }
              s += '</strong>';
            }

            return s;
          },
          shared: true,
        },
        xAxis: {
          lineWidth: 0,
          categories: data.map((i) => i.label),
          labels: { style: { fontSize: '15px' } },
        },
        yAxis: {
          labels: { enabled: false },
          title: { text: null },
          gridLineWidth: 0,
        },
        plotOptions: {
          series: {
            pointPadding: 0.05,
            groupPadding: 0,
            pointWidth: 45,
            minPointLength: 3,
            inside: true,
            shadow: false,
            borderWidth: 1,
            edgeWidth: 0,
            dataLabels: {
              enabled: true,
              style: {
                // fontSize: responsiveBarChartFontSize,
                textOutline: false,
              },
              formatter: function () {
                return (this as any).y.toLocaleString();
              },
            },
          },
        },

        series: [
          {
            name: '',
            colorByPoint: true,
            data: data.map((i) => ({
              name: i.label,
              y: roundNumber(planCalculations.data[i.key]),
            })),
          },
        ],
        legend: { enabled: false },
      }}
    />
  );
}

function Gauge({ planCalculations }: { planCalculations: any }) {
  if (planCalculations?.status !== 'success' || !planCalculations?.data)
    return null;

  Highcharts.setOptions({
    plotOptions: {
      series: {
        animation: false,
      },
    },
  });

  return (
    <HighchartsReact
      highcharts={Highcharts}
      containerProps={{ style: { height: '100%', width: '100%' } }}
      options={{
        title: { text: 'Percent Sampling Complete' },
        credits: { enabled: false },
        chart: {
          animation: false,
          type: 'gauge',
          // style: { fontFamily: fonts.primary },
          // height: responsiveBarChartHeight,
          plotBackgroundColor: null,
          plotBorderWidth: null,
          plotShadow: false,
        },
        // exporting: {
        //   buttons: {
        //     contextButton: {
        //       menuItems: [
        //         'downloadPNG',
        //         'downloadJPEG',
        //         'downloadPDF',
        //         'downloadSVG',
        //       ],
        //       theme: {
        //         fill: 'rgba(0, 0, 0, 0)',
        //         states: {
        //           hover: {
        //             fill: 'rgba(0, 0, 0, 0)',
        //           },
        //           select: {
        //             fill: 'rgba(0, 0, 0, 0)',
        //             stroke: '#666666',
        //           },
        //         },
        //       },
        //     },
        //   },
        //   chartOptions: {
        //     plotOptions: {
        //       series: {
        //         dataLabels: {
        //           enabled: true,
        //         },
        //       },
        //     },
        //   },
        //   // filename: `${activeState.label.replaceAll(
        //   //   ' ',
        //   //   '_',
        //   // )}_Site_Specific`,
        // },
        // tooltip: {
        //   //   formatter: function () {
        //   //     return `${(this as any).key}<br/>
        //   // ${(this as any).series.name}: <b>${(this as any).y.toLocaleString()}</b>`;
        //   //   },
        //   formatter: function () {
        //     /* Build the 'header'.  Note that you can wrap this.x in something
        //      * like Highcharts.dateFormat('%A, %b %e, %H:%M:%S', this.x)
        //      * if you are dealing with a time series to display a more
        //      * prettily-formatted date value.
        //      */
        //     let s = `${(this as any).key}<br/>`;

        //     for (let i = 0; i < (this as any).points.length; i++) {
        //       const myPoint = (this as any).points[i];
        //       s +=
        //         '<span style="color:' +
        //         myPoint.series.color +
        //         '">\u25CF</span>' +
        //         myPoint.series.name +
        //         ': ';

        //       /* Need to check whether or not we are dealing with an
        //        * area range plot and display a range if we are
        //        */
        //       s += '<strong>';
        //       if (myPoint.point.low && myPoint.point.high) {
        //         s +=
        //           myPoint.point.low.toLocaleString() +
        //           ' - ' +
        //           myPoint.point.high.toLocaleString();
        //       } else {
        //         s += myPoint.y.toLocaleString();
        //       }
        //       s += '</strong>';
        //     }

        //     return s;
        //   },
        //   shared: true,
        // },
        pane: {
          startAngle: -90,
          endAngle: 89.9,
          background: null,
          center: ['50%', '75%'],
          size: '110%',
        },

        // the value axis
        yAxis: {
          min: 0,
          max: 100,
          tickPixelInterval: 72,
          tickPosition: 'inside',
          // tickColor: Highcharts.defaultOptions.chart.backgroundColor || '#FFFFFF',
          tickLength: 20,
          tickWidth: 2,
          minorTickInterval: null,
          labels: {
            distance: 20,
            style: {
              fontSize: '14px',
            },
          },
          lineWidth: 0,
          // plotBands: [{
          //     from: 0,
          //     to: 120,
          //     color: '#55BF3B', // green
          //     thickness: 20
          // }, {
          //     from: 120,
          //     to: 160,
          //     color: '#DDDF0D', // yellow
          //     thickness: 20
          // }, {
          //     from: 160,
          //     to: 200,
          //     color: '#DF5353', // red
          //     thickness: 20
          // }]
        },

        series: [
          {
            name: 'Percent Complete',
            data: [
              Math.round(
                (planCalculations.data['Sampling Material Cost'] /
                  planCalculations.data['Total Sampling Cost']) *
                  100,
              ),
            ],
            tooltip: {
              valueSuffix: ' %',
            },
            dataLabels: {
              format: '{y} %',
              borderWidth: 0,
              color:
                (Highcharts.defaultOptions.title &&
                  Highcharts.defaultOptions.title.style &&
                  Highcharts.defaultOptions.title.style.color) ||
                '#333333',
              style: {
                fontSize: '16px',
              },
            },
            dial: {
              radius: '63%',
              backgroundColor: 'gray',
              baseWidth: 12,
              baseLength: '0%',
              rearLength: '0%',
            },
            pivot: {
              backgroundColor: 'gray',
              radius: 6,
            },
          },
        ],
      }}
    />
  );
}

/*
## Styles
*/

const appStyles = css`
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 675px;
  width: 100%;
  background-color: #f8f8f8;
`;

const containerStyles = (toolbarheight: number) => css`
  height: calc(100vh - ${toolbarheight}px);
  width: 100%;
`;

const fullscreenButtonStyles = css`
  ${linkButtonStyles}
  color: black;
  background-color: white;
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 100%;
  border: 1px solid #757575;
  z-index: 620;
  padding-top: 2px;
`;

const gridCellStyles = (visible: boolean) => css`
  background-color: white;
  border: 1px solid #adadad;
  ${visible && 'display: none;'}
`;

const mapHeightStyles = css`
  height: 100%;
`;

const planSelectContainerStyles = css`
  display: flex;
`;

const planSelectSectionStyles = css`
  width: 50%;
`;

const refreshButtonStyles = css`
  background-color: transparent;
  color: black;
  margin: 0;
  padding: 0.5rem 0.75rem;
`;

const toolbarContainerStyles = css`
  margin: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

/*
## Types
*/

type FilterFunction = LoadOptions<Option, GroupBase<Option>, unknown>;

interface GroupBase<Option> {
  readonly options: readonly Option[];
  readonly label?: string;
}

type Option = {
  created: string;
  label: string;
  value: string;
  url: string;
};
