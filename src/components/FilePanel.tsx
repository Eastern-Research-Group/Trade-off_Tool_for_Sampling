/** @jsx jsx */

import React from 'react';
import { jsx, css } from '@emotion/core';
import { useDropzone } from 'react-dropzone';
import LoadingSpinner from 'components/LoadingSpinner';
import MessageBox from 'components/MessageBox';
import Select from 'components/Select';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { useEsriModulesContext } from 'contexts/EsriModules';
import { SketchContext } from 'contexts/Sketch';
// contexts
import { NavigationContext } from 'contexts/Navigation';
// utils
import { fetchPost, fetchPostFile } from 'utils/fetchUtils';
import {
  generateUUID,
  getPopupTemplate,
  updateLayerEdits,
} from 'utils/sketchUtils';
// types
import { LayerType, LayerSelectType, LayerTypeName } from 'types/Layer';
// config
import { totsGPServer } from 'config/webService';
import { SampleSelectOptions, SampleSelectType } from 'config/sampleAttributes';
import { polygonSymbol } from 'config/symbols';

/**
 * Determines if the desired name has already been used. If it has
 * it appends in index to the end (i.e. '<desiredName> (2)').
 */
function getLayerName(layers: LayerType[], desiredName: string) {
  // get a list of names in use
  let usedNames: string[] = [];
  layers.forEach((layer) => {
    usedNames.push(layer.label);
  });

  // Find a name where there is not a collision.
  // Most of the time this loop will be skipped.
  let duplicateCount = 0;
  let newName = desiredName;
  while (usedNames.includes(newName)) {
    duplicateCount += 1;
    newName = `${desiredName} (${duplicateCount})`;
  }

  return newName;
}

const layerOptions: LayerSelectType[] = [
  { value: 'Contamination Map', label: 'Contamination Map' },
  { value: 'Samples', label: 'Samples' },
  { value: 'Reference Layer', label: 'Reference Layer' },
  { value: 'Area of Interest', label: 'Area of Interest' },
  { value: 'VSP', label: 'VSP' },
];

function fileVerification(type: LayerTypeName, attributes: any) {
  const contaminationRequiredFields = ['CONTAMTYPE', 'CONTAMVAL', 'CONTAMUNIT'];
  const samplesRequiredFields = [
    'TYPE',
    'TTPK',
    'TTC',
    'TTA',
    'TTPS',
    'LOD_P',
    'LOD_NON',
    'MCPS',
    'TCPS',
    'WVPS',
    'WWPS',
    'SA',
    'Notes',
    'ALC',
    'AMC',
  ];

  const missingFields: string[] = [];
  if (type === 'Contamination Map') {
    contaminationRequiredFields.forEach((field) => {
      // check if the required field is in the attributes object
      if (!(field in attributes)) {
        // build a list of fields that are missing
        if (missingFields.indexOf(field) === -1) missingFields.push(field);
      }
    });
  }
  if (type === 'Samples') {
    samplesRequiredFields.forEach((field) => {
      // check if the required field is in the attributes object
      if (!(field in attributes)) {
        // build a list of fields that are missing
        if (missingFields.indexOf(field) === -1) missingFields.push(field);
      }
    });
  }

  return missingFields;
}

// --- styles (FileIcon) ---
const fileIconOuterContainer = css`
  width: 2em;
  line-height: 1;
  margin: 5px;
`;

const fileIconContainer = css`
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  vertical-align: middle;
`;

const fileIcon = css`
  color: #e6e8ed;
  width: 100%;
`;

const fileIconText = css`
  font-size: 16px;
  color: #9ea4b3;
  margin-top: 5px;
  width: 100%;
`;

// --- components (FileIcon) ---
type FileIconProps = {
  label: string;
};

function FileIcon({ label }: FileIconProps) {
  return (
    <span className="fa-stack fa-2x" css={fileIconOuterContainer}>
      <span css={fileIconContainer}>
        <i className="fas fa-file fa-stack-2x" css={fileIcon}></i>
        <span className="fa-stack-text fa-stack-1x" css={fileIconText}>
          {label}
        </span>
      </span>
    </span>
  );
}

// --- styles (FilePanel) ---
const searchContainerStyles = css`
  .dropzone {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    border-width: 2px;
    border-radius: 2px;
    border-color: #eee;
    border-style: dashed;
    background-color: #fafafa;
    color: #bdbdbd;
    outline: none;
    transition: border 0.24s ease-in-out;
    text-align: center;
  }
`;

const selectStyles = css`
  margin-bottom: 10px;
`;

// --- components (FilePanel) ---
type UploadStatusType =
  | ''
  | 'fetching'
  | 'success'
  | 'failure'
  | 'no-data'
  | 'invalid-file-type'
  | 'import-error'
  | 'missing-attributes'
  | 'file-read-error';

function FilePanel() {
  const { portal } = React.useContext(AuthenticationContext);
  const { goToOptions, setGoToOptions } = React.useContext(NavigationContext);
  const {
    edits,
    setEdits,
    layers,
    setLayers,
    map,
    mapView,
    referenceLayers,
    setReferenceLayers,
  } = React.useContext(SketchContext);
  const {
    GraphicsLayer,
    FeatureLayer,
    FeatureSet,
    Field,
    geometryJsonUtils,
    Graphic,
    Geoprocessor,
    KMLLayer,
    PopupTemplate,
    rendererJsonUtils,
    SpatialReference,
  } = useEsriModulesContext();

  const [generalizeFeatures, setGeneralizeFeatures] = React.useState(false);
  const [analyzeResponse, setAnalyzeResponse] = React.useState<any>(null);
  const [generateResponse, setGenerateResponse] = React.useState<any>(null);
  const [analyzeCalled, setAnalyzeCalled] = React.useState(false);
  const [generateCalled, setGenerateCalled] = React.useState(false);
  const [featuresAdded, setFeaturesAdded] = React.useState(false);
  const [uploadStatus, setUploadStatus] = React.useState<UploadStatusType>('');
  const [missingAttributes, setMissingAttributes] = React.useState('');

  const [
    layerType,
    setLayerType, //
  ] = React.useState<LayerSelectType | null>(null);

  // Handle navigation options
  React.useEffect(() => {
    if (goToOptions?.from !== 'file') return;

    let optionValue: LayerSelectType | null = null;
    layerOptions.forEach((option) => {
      if (option.value === goToOptions.layerType) optionValue = option;
    });
    if (optionValue) setLayerType(optionValue);

    setGoToOptions(null);
  }, [goToOptions, setGoToOptions]);

  // Handles the user uploading a file
  const [file, setFile] = React.useState<any>(null);
  const [lastFileName, setLastFileName] = React.useState('');
  const onDrop = React.useCallback((acceptedFiles) => {
    // Do something with the files
    if (
      !acceptedFiles ||
      acceptedFiles.length === 0 ||
      !acceptedFiles[0].name
    ) {
      return;
    }

    // get the filetype
    const file = acceptedFiles[0];
    let fileType = '';
    if (file.name.endsWith('.zip')) fileType = 'shapefile';
    if (file.name.endsWith('.csv')) fileType = 'csv';
    if (file.name.endsWith('.kml')) fileType = 'kml';
    if (file.name.endsWith('.geojson')) fileType = 'geojson';
    if (file.name.endsWith('.geo.json')) fileType = 'geojson';
    if (file.name.endsWith('.gpx')) fileType = 'gpx';

    // set the file state
    file['esriFileType'] = fileType;
    setFile(file);

    // reset state management values
    setUploadStatus('fetching');
    setLastFileName('');
    setAnalyzeResponse(null);
    setGenerateResponse(null);
    setAnalyzeCalled(false);
    setGenerateCalled(false);
    setFeaturesAdded(false);
    setMissingAttributes('');

    if (!fileType) {
      setUploadStatus('invalid-file-type');
      return;
    }
  }, []);

  // Configuration for the dropzone component
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop,
  });

  // Retreive the geocode services from the user's portal
  const [
    batchGeocodeServices,
    setBatchGeocodeServices, //
  ] = React.useState<any>(null);
  const [
    firstGeocodeService,
    setFirstGeocodeService, //
  ] = React.useState<any>(null);
  const [
    sharingUrl,
    setSharingUrl, //
  ] = React.useState('https://www.arcgis.com/sharing/rest');
  React.useEffect(() => {
    if (!portal || batchGeocodeServices) return;

    const worldExp = /(arcgis.com\/arcgis\/rest\/services\/world\/geocodeserver).*/gi;
    const worldProxyExp = /(\/servers\/[\da-z.-]+\/rest\/services\/world\/geocodeserver).*/gi;

    // get batch geocode services
    const newBatchGeocodeServices: any[] = [];
    if (portal?.helperServices?.geocode) {
      // workaround for accessing portal.user.privileges since privileges doesn't exist on
      // the type definition.
      const user = portal.user as any;
      const hasGeocodePrivileges =
        user.privileges.indexOf('premium:user:geocode') > -1;

      portal.helperServices.geocode.forEach((service: any) => {
        const isWorld = service.url.match(worldExp);
        const isWorldProxy = service.url.match(worldProxyExp);
        if (
          (isWorld && !portal.isPortal && hasGeocodePrivileges) ||
          isWorldProxy ||
          service.batch
        ) {
          newBatchGeocodeServices.push({
            isWorldGeocodeServer: isWorld || isWorldProxy,
            isWorldGeocodeServerProxy: isWorldProxy,
            label: service.name,
            value: service.url,
            url: service.url,
            name: service.name,
          });
        }
      });
    }

    setSharingUrl(
      `${portal ? portal.url : 'https://www.arcgis.com'}/sharing/rest`,
    );
    setBatchGeocodeServices(newBatchGeocodeServices);
    if (newBatchGeocodeServices.length > 0) {
      setFirstGeocodeService(newBatchGeocodeServices[0]);
    }
  }, [portal, batchGeocodeServices]);

  // analyze csv files
  React.useEffect(() => {
    if (!file?.esriFileType || !sharingUrl || analyzeCalled) return;
    if (file.name === lastFileName || file.esriFileType !== 'csv') return;
    setAnalyzeCalled(true);

    // build request
    const analyzeParams: any = { enableGlobalGeocoding: true };
    if (firstGeocodeService) {
      analyzeParams['geocodeServiceUrl'] = firstGeocodeService.url;
      if (firstGeocodeService.isWorldGeocodeServer) {
        analyzeParams['sourceCountry'] = 'world';
        analyzeParams['sourceCountryHint'] = '';
      }
    }

    const params: any = {
      f: 'json',
      fileType: file.esriFileType,
      analyzeParameters: analyzeParams,
    };

    const analyzeUrl = `${sharingUrl}/content/features/analyze`;
    fetchPostFile(analyzeUrl, params, file)
      .then((res: any) => {
        console.log('analyzeResponse: ', res);
        setAnalyzeResponse(res);
      })
      .catch((err) => {
        console.error(err);
        setUploadStatus('failure');
      });
  }, [
    file,
    lastFileName,
    firstGeocodeService,
    portal,
    analyzeCalled,
    sharingUrl,
  ]);

  // get features from file
  const [
    sampleType,
    setSampleType, //
  ] = React.useState<SampleSelectType | null>(null);
  React.useEffect(() => {
    if (
      !mapView ||
      !layerType ||
      !file?.esriFileType ||
      !sharingUrl ||
      file.name === lastFileName ||
      generateCalled
    ) {
      return;
    }
    if (file.esriFileType === 'kml') return; // KML doesn't need to do this
    if (file.esriFileType === 'csv' && !analyzeResponse) return; // CSV needs to wait for the analyze response
    if (layerType.value === 'VSP' && !sampleType) return; // VSP layers need a sample type

    setGenerateCalled(true);
    setLastFileName(file.name);

    const generateUrl = `${sharingUrl}/content/features/generate`;

    let resParameters = {};
    if (analyzeResponse) resParameters = analyzeResponse.publishParameters;
    const fileForm = new FormData();
    fileForm.append('file', file);
    const publishParameters: any = {
      ...resParameters,
      name: file.name,
      targetSR: mapView.spatialReference,
      maxRecordCount: 4000, // 4000 is the absolute max for this service.
      enforceInputFileSizeLimit: true,
      enforceOutputJsonSizeLimit: true,
    };

    // generalize features since this option was selected
    if (generalizeFeatures) {
      // save the current scale
      const originalScale = mapView.scale;

      // get the width for a scale of 40000
      mapView.scale = 40000;
      const extent = mapView.extent;

      // revert the scale back to the original value
      mapView.scale = originalScale;

      // get the resolution
      let resolution = extent.width / mapView.width;

      // append the publish parameters
      publishParameters['generalize'] = true;
      publishParameters['maxAllowableOffset'] = resolution;
      publishParameters['reducePrecision'] = true;

      // get the number of digits after the decimal
      let numDecimals = 0;
      while (resolution < 1) {
        resolution = resolution * 10;
        numDecimals++;
      }
      publishParameters['numberOfDigitsAfterDecimal'] = numDecimals;
    }

    let fileTypeToSend = file.esriFileType;

    console.log('fileTypeToSend: ', fileTypeToSend);
    // generate the features
    const params = {
      f: 'json',
      filetype: fileTypeToSend,
      publishParameters,
    };
    fetchPostFile(generateUrl, params, file)
      .then((res: any) => {
        console.log('generate res: ', res);
        console.log('file.esriFileType: ', file.esriFileType);
        if (res.error) {
          setUploadStatus('import-error');
          return;
        }
        if (layerType.value !== 'VSP') {
          console.log('basic');
          setGenerateResponse(res);
          return;
        }

        const features: __esri.Graphic[] = [];
        let layerDefinition: any;
        res.featureCollection.layers.forEach((layer: any) => {
          layerDefinition = layer.layerDefinition;
          layer.featureSet.features.forEach((feature: any) => {
            features.push(
              new Graphic({
                attributes: feature.attributes,
                geometry: geometryJsonUtils.fromJSON(feature.geometry),
              }),
            );
          });
        });
        console.log('features: ', features);

        // get the list of fields
        let fields: __esri.Field[] = [];
        layerDefinition.fields.forEach((field: __esri.Field) => {
          // Using Field.fromJSON to convert the Rest fields to the ArcGIS JS fields
          fields.push(Field.fromJSON(field));
        });

        // create a feature set for communicating with the GPServer
        const inputVspSet = new FeatureSet({
          displayFieldName: '',
          geometryType: layerDefinition.geometryType
            .toLowerCase()
            .replace('esrigeometry', ''),
          spatialReference: {
            wkid: 3857,
          },
          fields,
          features,
        });
        console.log('inputVspSet: ', inputVspSet);

        const params = {
          f: 'json',
          Input_VSP: inputVspSet,
          Sample_Type: sampleType && sampleType.value,
        };

        const goeprocessor = new Geoprocessor({
          url: `${totsGPServer}/VSP%20Import/execute`,
          outSpatialReference: { wkid: 3857 },
        });

        goeprocessor
          .execute(params)
          .then((res: any) => {
            console.log('res: ', res);

            const layers: any[] = [];
            res.results.forEach((result: any) => {
              layerDefinition.fields = result.value.fields;
              layerDefinition.objectIdField = 'OBJECTID';
              layers.push({
                layerDefinition,
                featureSet: {
                  features: result.value.features,
                  geometryType: result.value.geometryType,
                },
              });
            });

            setGenerateResponse({
              featureCollection: {
                layers,
              },
            });
          })
          .catch((err) => {
            console.error(err);
            setUploadStatus('failure');
          });
      })
      .catch((err) => {
        console.error(err);
        setUploadStatus('failure');
      });
  }, [
    generalizeFeatures,
    generateCalled,
    analyzeResponse,
    file,
    lastFileName,
    portal,
    mapView,
    sharingUrl,

    // new
    layerType,
    Graphic,
    Field,
    geometryJsonUtils,
    Geoprocessor,
    FeatureSet,
    SpatialReference,
    map,
    sampleType,
  ]);

  // add features to the map as graphics layers. This is for every layer type
  // except for reference layers. This is so users can edit the features.
  const [newLayerName, setNewLayerName] = React.useState('');
  React.useEffect(() => {
    if (
      !map ||
      !mapView ||
      !layerType ||
      !file?.esriFileType ||
      featuresAdded
    ) {
      return;
    }
    if (layerType.value === 'Reference Layer') return;
    if (!generateResponse) return;
    if (
      !generateResponse.featureCollection?.layers ||
      generateResponse.featureCollection.layers.length === 0
    ) {
      setUploadStatus('no-data');
      return;
    }

    console.log('generateResponse: ', generateResponse);
    setFeaturesAdded(true);

    const graphics: __esri.Graphic[] = [];
    let missingAttributes: string[] = [];
    generateResponse.featureCollection.layers.forEach((layer: any) => {
      if (
        !layer?.featureSet?.features ||
        layer.featureSet.features.length === 0
      ) {
        return;
      }

      // get the features from the response and add the correct type value
      layer.featureSet.features.forEach((feature: any, index: number) => {
        if (
          !feature?.geometry?.spatialReference &&
          file.esriFileType === 'kml'
        ) {
          feature.geometry['spatialReference'] =
            generateResponse.lookAtExtent.spatialReference;
        }

        // non-VSP layers need to be converted from ArcGIS Rest to ArcGIS JS
        let graphic: any = feature;
        if (layerType.value !== 'VSP') graphic = Graphic.fromJSON(feature);

        // add a layer type to the graphic
        if (!graphic?.attributes?.TYPE) {
          graphic.attributes['TYPE'] = layerType.value;
        }

        // add ids to the graphic, if the graphic doesn't already have them
        const uuid = generateUUID();
        if (!graphic.attributes.PERMANENT_IDENTIFIER) {
          graphic.attributes['PERMANENT_IDENTIFIER'] = uuid;
        }
        if (!graphic.attributes.GLOBALID) {
          graphic.attributes['GLOBALID'] = uuid;
        }
        if (!graphic.attributes.OBJECTID) {
          graphic.attributes['OBJECTID'] = index.toString();
        }

        // add sample layer specific attributes
        if (layerType.value === 'Samples') {
          const {
            CONTAMTYPE,
            CONTAMVAL,
            CONTAMUNIT,
            CREATEDDATE,
            UPDATEDDATE,
            USERNAME,
            ORGANIZATION,
            SURFACEAREAUNIT,
            ELEVATIONSERIES,
          } = graphic.attributes;
          if (!CONTAMTYPE) graphic.attributes['CONTAMTYPE'] = null;
          if (!CONTAMVAL) graphic.attributes['CONTAMVAL'] = null;
          if (!CONTAMUNIT) graphic.attributes['CONTAMUNIT'] = null;
          if (!CREATEDDATE) graphic.attributes['CREATEDDATE'] = null;
          if (!UPDATEDDATE) graphic.attributes['UPDATEDDATE'] = null;
          if (!USERNAME) graphic.attributes['USERNAME'] = null;
          if (!ORGANIZATION) graphic.attributes['ORGANIZATION'] = null;
          if (!SURFACEAREAUNIT) graphic.attributes['SURFACEAREAUNIT'] = null;
          if (!ELEVATIONSERIES) graphic.attributes['ELEVATIONSERIES'] = null;
        }

        // verify the graphic has all required attributes
        const missingFields = fileVerification(
          layerType.value,
          graphic.attributes,
        );
        if (missingFields.length > 0) {
          missingAttributes = missingAttributes.concat(
            // filter out duplicates
            missingFields.filter((item) => missingAttributes.indexOf(item) < 0),
          );
        }

        if (graphic?.geometry?.type === 'polygon') {
          graphic.symbol = polygonSymbol;
        }

        // add the popup template
        graphic.popupTemplate = new PopupTemplate(
          getPopupTemplate(layerType.value),
        );

        graphics.push(graphic);
      });
    });

    if (missingAttributes.length > 0) {
      setUploadStatus('missing-attributes');
      const sortedMissingAttributes = missingAttributes.sort();
      const missingAttributesStr =
        sortedMissingAttributes.slice(0, -1).join(', ') +
        ' and ' +
        sortedMissingAttributes.slice(-1);

      setMissingAttributes(missingAttributesStr);
      return;
    }

    const layerName = getLayerName(layers, file.name);
    setNewLayerName(layerName);
    const graphicsLayer = new GraphicsLayer({
      graphics,
      title: layerName,
    });

    // create the graphics layer
    const layerToAdd: LayerType = {
      id: -1,
      layerId: graphicsLayer.id,
      value: layerName,
      name: file.name,
      label: layerName,
      layerType: layerType.value,
      scenarioName: '',
      scenarioDescription: '',
      defaultVisibility: true,
      geometryType: 'esriGeometryPolygon',
      addedFrom: 'file',
      sketchLayer: graphicsLayer,
    };

    // make a copy of the edits context variable
    const editsCopy = updateLayerEdits({
      edits,
      layer: layerToAdd,
      type: 'add',
      changes: graphicsLayer.graphics,
    });

    setEdits(editsCopy);

    setLayers([...layers, layerToAdd]);
    map.add(graphicsLayer);
    if (graphics.length > 0) mapView.goTo(graphics);

    setUploadStatus('success');
  }, [
    // esri modules
    GraphicsLayer,
    Field,
    geometryJsonUtils,
    Graphic,
    PopupTemplate,
    rendererJsonUtils,

    // app
    edits,
    setEdits,
    layerType,
    generateResponse,
    featuresAdded,
    file,
    map,
    mapView,
    layers,
    setLayers,
  ]);

  // add features to the map as feature layers. This is only for reference layer
  // types. This is so users can view popups but not edit the features.
  React.useEffect(() => {
    if (
      !map ||
      !mapView ||
      !layerType ||
      !file?.esriFileType ||
      featuresAdded
    ) {
      return;
    }
    if (layerType.value !== 'Reference Layer') return;
    if (!generateResponse) return;
    if (
      !generateResponse.featureCollection?.layers ||
      generateResponse.featureCollection.layers.length === 0
    ) {
      setUploadStatus('no-data');
      return;
    }

    console.log('generateResponse: ', generateResponse);
    setFeaturesAdded(true);

    const layersAdded: LayerType[] = [];
    const featureLayers: __esri.FeatureLayer[] = [];
    const graphicsAdded: __esri.Graphic[] = [];
    generateResponse.featureCollection.layers.forEach((layer: any) => {
      if (
        !layer?.featureSet?.features ||
        layer.featureSet.features.length === 0
      ) {
        return;
      }

      // get the list of fields
      let fields: __esri.Field[] = [];
      if (layerType.value === 'VSP') fields = layer.layerDefinition.fields;
      else {
        layer.layerDefinition.fields.forEach((field: __esri.Field) => {
          // Using Field.fromJSON to convert the Rest fields to the ArcGIS JS fields
          fields.push(Field.fromJSON(field));
        });
      }

      // get the features from the response and add the correct type value
      const features: __esri.Graphic[] = [];
      layer.featureSet.features.forEach((feature: any) => {
        if (
          !feature?.geometry?.spatialReference &&
          file.esriFileType === 'kml'
        ) {
          feature.geometry['spatialReference'] =
            generateResponse.lookAtExtent.spatialReference;
        }
        const graphic = Graphic.fromJSON(feature);
        features.push(graphic);
        graphicsAdded.push(graphic);
      });

      // use jsonUtils to convert the REST API renderer to an ArcGIS JS renderer
      const renderer: __esri.Renderer = rendererJsonUtils.fromJSON(
        layer.layerDefinition.drawingInfo.renderer,
      );

      // create the popup template if popup information was provided
      let popupTemplate;
      if (layer.popupInfo) {
        popupTemplate = {
          title: layer.popupInfo.title,
          content: layer.popupInfo.description,
        };
      }

      console.log({
        fields,
        objectIdField: layer.layerDefinition.objectIdField,
        outFields: ['*'],
        source: features,
        title: file.name,
        renderer,
        popupTemplate,
      });

      const layerName = getLayerName(layers, file.name);
      setNewLayerName(layerName);
      const layerProps: __esri.FeatureLayerProperties = {
        fields,
        objectIdField: layer.layerDefinition.objectIdField,
        outFields: ['*'],
        source: features,
        title: layerName,
        renderer,
        popupTemplate,
      };

      // create the feature layer
      console.log('layerFromFile: ', layerProps);
      const layerToAdd = new FeatureLayer(layerProps);
      featureLayers.push(layerToAdd);

      setReferenceLayers([
        ...referenceLayers,
        { ...layerProps, layerId: layerToAdd.id },
      ]);

      // add the layers, from the uploaded file, to the map
      layersAdded.push({
        id: -1,
        layerId: layerToAdd.id,
        value: layerName,
        name: file.name,
        label: layerName,
        layerType: layerType.value,
        scenarioName: '',
        scenarioDescription: '',
        defaultVisibility: true,
        geometryType: layer.layerDefinition.geometryType,
        addedFrom: 'file',
        sketchLayer: layerToAdd,
      });
    });

    setLayers([...layers, ...layersAdded]);
    map.addMany(featureLayers);
    if (graphicsAdded.length > 0) mapView.goTo(graphicsAdded);

    setUploadStatus('success');
  }, [
    // esri modules
    FeatureLayer,
    Field,
    geometryJsonUtils,
    Graphic,
    rendererJsonUtils,

    // app
    layerType,
    generateResponse,
    featuresAdded,
    file,
    map,
    mapView,
    layers,
    setLayers,
    referenceLayers,
    setReferenceLayers,
  ]);

  // handle loading of the KMLLayer
  React.useEffect(() => {
    if (!file?.esriFileType || !mapView || file.esriFileType !== 'kml') return;
    if (file.name === lastFileName) return;

    // read in the file
    const reader = new FileReader();
    reader.onload = function (event: Event) {
      if (reader.error || !event || !reader.result) {
        console.error('File Read Error: ', reader.error);
        setUploadStatus('file-read-error');
        return;
      }

      // build the arcgis kml call
      // this data is used to get the renderers
      const kmlUrl = 'https://utility.arcgis.com/sharing/kml';
      const contents = reader.result as string;
      const params = {
        kmlString: encodeURIComponent(contents),
        model: 'simple',
        folders: '',
        outSR: mapView.spatialReference,
      };
      fetchPost(kmlUrl, params)
        .then((res: any) => {
          console.log('kml res: ', res);
          setGenerateResponse(res);
        })
        .catch((err) => {
          console.error(err);
          setUploadStatus('failure');
        });
    };

    try {
      reader.readAsText(file);
    } catch (ex) {
      console.error('File Read Error: ', ex);
      setUploadStatus('file-read-error');
    }
  }, [KMLLayer, mapView, file, lastFileName]);

  return (
    <div css={searchContainerStyles}>
      <label htmlFor="layer-type-select">Layer Type</label>
      <Select
        inputId="layer-type-select"
        css={selectStyles}
        value={layerType}
        onChange={(ev) => {
          setLayerType(ev as LayerSelectType);
          setUploadStatus('');
        }}
        options={layerOptions}
      />
      {layerType && (
        <React.Fragment>
          {layerType.value === 'VSP' && (
            <React.Fragment>
              <label htmlFor="sample-type-select">Sample Type</label>
              <Select
                inputId="sample-type-select"
                css={selectStyles}
                value={sampleType}
                onChange={(ev) => {
                  setSampleType(ev as SampleSelectType);
                  setUploadStatus('');
                }}
                options={SampleSelectOptions}
              />
            </React.Fragment>
          )}
          {(layerType.value !== 'VSP' ||
            (layerType.value === 'VSP' && sampleType)) && (
            <React.Fragment>
              {uploadStatus === 'fetching' && <LoadingSpinner />}
              {uploadStatus !== 'fetching' && (
                <React.Fragment>
                  {uploadStatus === 'invalid-file-type' && (
                    <MessageBox
                      severity="error"
                      title="Invalid File Type"
                      message={`${file.name} is an invalid file type. The accepted file types are .zip, .csv, .kml, .gpx, .goe.json and .geojson`}
                    />
                  )}
                  {uploadStatus === 'import-error' && (
                    <MessageBox
                      severity="error"
                      title="Invalid File Type"
                      message={`Unable to import this dataset.`}
                    />
                  )}
                  {uploadStatus === 'file-read-error' && (
                    <MessageBox
                      severity="error"
                      title="File Read Error"
                      message={`Failed to read the ${file.name} file. Check the console log for details.`}
                    />
                  )}
                  {uploadStatus === 'no-data' && (
                    <MessageBox
                      severity="error"
                      title="No Data"
                      message={`The ${file.name} file did not have any data to display on the map`}
                    />
                  )}
                  {uploadStatus === 'missing-attributes' && (
                    <MessageBox
                      severity="error"
                      title="Missing Required Attributes"
                      message={`Features in the ${file.name} are missing the following required attributes: ${missingAttributes}`}
                    />
                  )}
                  {uploadStatus === 'failure' && (
                    <MessageBox
                      severity="error"
                      title="Web Service Error"
                      message="An error occurred in the web service"
                    />
                  )}
                  {uploadStatus === 'success' && (
                    <React.Fragment>
                      {file.name === newLayerName && (
                        <MessageBox
                          severity="info"
                          title="Upload Succeeded"
                          message={`"${file.name}" was successfully uploaded`}
                        />
                      )}
                      {file.name !== newLayerName && (
                        <MessageBox
                          severity="info"
                          title="Upload Succeeded"
                          message={`"${file.name}" was successfully uploaded as "${newLayerName}"`}
                        />
                      )}
                    </React.Fragment>
                  )}
                  <input
                    id="generalize-features-input"
                    type="checkbox"
                    checked={generalizeFeatures}
                    onChange={(ev) =>
                      setGeneralizeFeatures(!generalizeFeatures)
                    }
                  />
                  <label htmlFor="generalize-features-input">
                    Generalize features for web display
                  </label>
                  <br />
                  <div {...getRootProps({ className: 'dropzone' })}>
                    <input {...getInputProps()} />
                    {isDragActive ? (
                      <p>Drop the files here ...</p>
                    ) : (
                      <div>
                        <div>
                          <FileIcon label="Shape File" />
                          <FileIcon label="CSV" />
                          <FileIcon label="KML" />
                          <br />
                          <FileIcon label="GPX" />
                          <FileIcon label="Geo JSON" />
                        </div>
                        <br />
                        Drop or Browse
                        <br />
                        <button onClick={open}>Browse</button>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              )}
            </React.Fragment>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

export default FilePanel;
