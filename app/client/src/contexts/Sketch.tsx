/** @jsxImportSource @emotion/react */

import React, {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useEffect,
  useState,
} from 'react';
// contexts
import {
  useSampleTypesContext,
  useServicesContext,
} from 'contexts/LookupFiles';
// utils
import { getEnvironmentStringParam } from 'utils/arcGisRestUtils';
import { fetchCheck } from 'utils/fetchUtils';
import { updatePointSymbol, updatePolygonSymbol } from 'utils/sketchUtils';
// types
import { EditsType, ScenarioEditsType } from 'types/Edits';
import { LayerType, PortalLayerType, UrlLayerType } from 'types/Layer';
import {
  DefaultSymbolsType,
  UserDefinedAttributes,
  SampleSelectType,
  SelectedSampleType,
  PolygonSymbol,
} from 'config/sampleAttributes';

export const hazardousOptions: { label: string; value: string }[] = [
  { label: 'Hazardous', value: 'hazardous' },
  { label: 'Non-Hazardous', value: 'non-hazardous' },
];

type HomeWidgetType = {
  '2d': __esri.Home;
  '3d': __esri.Home;
};

export type SketchViewModelType = {
  '2d': __esri.SketchViewModel;
  '3d': __esri.SketchViewModel;
};

export type AoiGraphics = {
  [planId: string]: __esri.Graphic[];
};

export type AoiDataType = {
  count: number;
  graphics: AoiGraphics | null;
};

export type JsonDownloadType = {
  contaminationScenario: string;
  decontaminationTechnology: string;
  solidWasteVolumeM3: number;
  liquidWasteVolumeM3: number;
  decontaminationCost: number;
  decontaminationTimeDays: number;
  averageInitialContamination: number;
  averageFinalContamination: number;
  aboveDetectionLimit: boolean;
};

export type PlanSettings = {
  name: string;
  description: string;
};

type SketchType = {
  autoZoom: boolean;
  setAutoZoom: Dispatch<SetStateAction<boolean>>;
  basemapWidget: __esri.BasemapGallery | null;
  setBasemapWidget: Dispatch<SetStateAction<__esri.BasemapGallery | null>>;
  defaultSymbols: DefaultSymbolsType;
  setDefaultSymbols: Dispatch<SetStateAction<DefaultSymbolsType>>;
  setDefaultSymbolSingle: Function;
  resetDefaultSymbols: Function;
  edits: EditsType;
  setEdits: Dispatch<SetStateAction<EditsType>>;
  aoiData: AoiDataType;
  setAoiData: Dispatch<SetStateAction<AoiDataType>>;
  jsonDownload: JsonDownloadType[];
  setJsonDownload: Dispatch<SetStateAction<JsonDownloadType[]>>;
  defaultDeconSelections: any[];
  setDefaultDeconSelections: Dispatch<SetStateAction<any[]>>;
  deconSelections: any[];
  setDeconSelections: Dispatch<SetStateAction<any[]>>;
  planSettings: PlanSettings;
  setPlanSettings: Dispatch<SetStateAction<PlanSettings>>;
  homeWidget: HomeWidgetType | null;
  setHomeWidget: Dispatch<SetStateAction<HomeWidgetType | null>>;
  symbolsInitialized: boolean;
  setSymbolsInitialized: Dispatch<SetStateAction<boolean>>;
  layersInitialized: boolean;
  setLayersInitialized: Dispatch<SetStateAction<boolean>>;
  layers: LayerType[];
  setLayers: Dispatch<SetStateAction<LayerType[]>>;
  portalLayers: PortalLayerType[];
  setPortalLayers: Dispatch<SetStateAction<PortalLayerType[]>>;
  referenceLayers: any[];
  setReferenceLayers: Dispatch<SetStateAction<any[]>>;
  urlLayers: UrlLayerType[];
  setUrlLayers: Dispatch<SetStateAction<UrlLayerType[]>>;
  sketchLayer: LayerType | null;
  setSketchLayer: Dispatch<SetStateAction<LayerType | null>>;
  aoiSketchLayer: LayerType | null;
  setAoiSketchLayer: Dispatch<SetStateAction<LayerType | null>>;
  map: __esri.Map | null;
  setMap: Dispatch<SetStateAction<__esri.Map | null>>;
  mapView: __esri.MapView | null;
  setMapView: Dispatch<SetStateAction<__esri.MapView | null>>;
  sceneView: __esri.SceneView | null;
  setSceneView: Dispatch<SetStateAction<__esri.SceneView | null>>;
  sceneViewForArea: __esri.SceneView | null;
  setSceneViewForArea: Dispatch<SetStateAction<__esri.SceneView | null>>;
  selectedSampleIds: SelectedSampleType[];
  setSelectedSampleIds: Dispatch<SetStateAction<SelectedSampleType[]>>;
  selectedScenario: ScenarioEditsType | null;
  setSelectedScenario: Dispatch<SetStateAction<ScenarioEditsType | null>>;
  sketchVM: SketchViewModelType | null;
  setSketchVM: Dispatch<SetStateAction<SketchViewModelType | null>>;
  aoiSketchVM: __esri.SketchViewModel | null;
  setAoiSketchVM: Dispatch<SetStateAction<__esri.SketchViewModel | null>>;
  getGpMaxRecordCount: (() => Promise<number>) | null;
  userDefinedOptions: SampleSelectType[];
  setUserDefinedOptions: Dispatch<SetStateAction<SampleSelectType[]>>;
  userDefinedAttributes: UserDefinedAttributes;
  setUserDefinedAttributes: Dispatch<SetStateAction<UserDefinedAttributes>>;
  sampleAttributes: any[];
  setSampleAttributes: Dispatch<SetStateAction<any[]>>;
  allSampleOptions: SampleSelectType[];
  setAllSampleOptions: Dispatch<SetStateAction<SampleSelectType[]>>;
  displayGeometryType: 'hybrid' | 'points' | 'polygons';
  setDisplayGeometryType: Dispatch<
    SetStateAction<'hybrid' | 'points' | 'polygons'>
  >;
  displayDimensions: '2d' | '3d';
  setDisplayDimensions: Dispatch<SetStateAction<'2d' | '3d'>>;
  terrain3dUseElevation: boolean;
  setTerrain3dUseElevation: Dispatch<SetStateAction<boolean>>;
  terrain3dVisible: boolean;
  setTerrain3dVisible: Dispatch<SetStateAction<boolean>>;
  viewUnderground3d: boolean;
  setViewUnderground3d: Dispatch<SetStateAction<boolean>>;
  resultsOpen: boolean;
  setResultsOpen: Dispatch<SetStateAction<boolean>>;
};

export const SketchContext = createContext<SketchType>({
  autoZoom: false,
  setAutoZoom: () => {},
  basemapWidget: null,
  setBasemapWidget: () => {},
  defaultSymbols: {
    symbols: {},
    editCount: 0,
  },
  setDefaultSymbols: () => {},
  setDefaultSymbolSingle: () => {},
  resetDefaultSymbols: () => {},
  edits: { count: 0, edits: [] },
  setEdits: () => {},
  aoiData: { count: 0, graphics: null },
  setAoiData: () => {},
  jsonDownload: [],
  setJsonDownload: () => {},
  defaultDeconSelections: [],
  setDefaultDeconSelections: () => {},
  deconSelections: [],
  setDeconSelections: () => {},
  planSettings: { name: '', description: '' },
  setPlanSettings: () => {},
  homeWidget: null,
  setHomeWidget: () => {},
  symbolsInitialized: false,
  setSymbolsInitialized: () => {},
  layersInitialized: false,
  setLayersInitialized: () => {},
  layers: [],
  setLayers: () => {},
  portalLayers: [],
  setPortalLayers: () => {},
  referenceLayers: [],
  setReferenceLayers: () => {},
  urlLayers: [],
  setUrlLayers: () => {},
  selectedSampleIds: [],
  setSelectedSampleIds: () => {},
  selectedScenario: null,
  setSelectedScenario: () => {},
  sketchLayer: null,
  setSketchLayer: () => {},
  aoiSketchLayer: null,
  setAoiSketchLayer: () => {},
  map: null,
  setMap: () => {},
  mapView: null,
  setMapView: () => {},
  sceneView: null,
  setSceneView: () => {},
  sceneViewForArea: null,
  setSceneViewForArea: () => {},
  sketchVM: null,
  setSketchVM: () => {},
  aoiSketchVM: null,
  setAoiSketchVM: () => {},
  getGpMaxRecordCount: null,
  userDefinedOptions: [],
  setUserDefinedOptions: () => {},
  userDefinedAttributes: { editCount: 0, sampleTypes: {} },
  setUserDefinedAttributes: () => {},
  sampleAttributes: [],
  setSampleAttributes: () => {},
  allSampleOptions: [],
  setAllSampleOptions: () => {},
  displayGeometryType: 'polygons',
  setDisplayGeometryType: () => {},
  displayDimensions: '2d',
  setDisplayDimensions: () => {},
  terrain3dUseElevation: true,
  setTerrain3dUseElevation: () => {},
  terrain3dVisible: true,
  setTerrain3dVisible: () => {},
  viewUnderground3d: false,
  setViewUnderground3d: () => {},
  resultsOpen: false,
  setResultsOpen: () => {},
});

type Props = { children: ReactNode };

export function SketchProvider({ children }: Props) {
  const sampleTypeContext = useSampleTypesContext();
  const services = useServicesContext();

  const defaultSymbol: PolygonSymbol = {
    type: 'simple-fill',
    color: [150, 150, 150, 0.2],
    outline: {
      color: [50, 50, 50],
      width: 2,
    },
  };

  const initialDefaultSymbols = {
    symbols: {
      'Area of Interest': defaultSymbol,
      'Contamination Map': {
        type: 'simple-fill',
        color: [4, 53, 255, 0.2],
        outline: {
          color: [50, 50, 50],
          width: 2,
        },
      } as PolygonSymbol,
      Samples: defaultSymbol,
    },
    editCount: 0,
  };

  const [autoZoom, setAutoZoom] = useState(false);
  const [
    basemapWidget,
    setBasemapWidget, //
  ] = useState<__esri.BasemapGallery | null>(null);
  const [defaultSymbols, setDefaultSymbols] = useState<DefaultSymbolsType>(
    initialDefaultSymbols,
  );
  const [edits, setEdits] = useState<EditsType>({ count: 0, edits: [] });
  const [aoiData, setAoiData] = useState<AoiDataType>({
    count: 0,
    graphics: null,
  });
  const [jsonDownload, setJsonDownload] = useState<JsonDownloadType[]>([]);
  const [defaultDeconSelections, setDefaultDeconSelections] = useState<any[]>(
    [],
  );
  const [deconSelections, setDeconSelections] = useState<any[]>([]);
  const [planSettings, setPlanSettings] = useState<PlanSettings>({
    name: '',
    description: '',
  });
  const [layersInitialized, setLayersInitialized] = useState(false);
  const [layers, setLayers] = useState<LayerType[]>([]);
  const [portalLayers, setPortalLayers] = useState<PortalLayerType[]>([]);
  const [referenceLayers, setReferenceLayers] = useState<any[]>([]);
  const [urlLayers, setUrlLayers] = useState<UrlLayerType[]>([]);
  const [sketchLayer, setSketchLayer] = useState<LayerType | null>(null);
  const [aoiSketchLayer, setAoiSketchLayer] = useState<LayerType | null>(null);
  const [homeWidget, setHomeWidget] = useState<HomeWidgetType | null>(null);
  const [symbolsInitialized, setSymbolsInitialized] = useState(false);
  const [map, setMap] = useState<__esri.Map | null>(null);
  const [mapView, setMapView] = useState<__esri.MapView | null>(null);
  const [sceneView, setSceneView] = useState<__esri.SceneView | null>(null);
  const [sceneViewForArea, setSceneViewForArea] =
    useState<__esri.SceneView | null>(null);
  const [selectedSampleIds, setSelectedSampleIds] = useState<
    SelectedSampleType[]
  >([]);
  const [
    selectedScenario,
    setSelectedScenario, //
  ] = useState<ScenarioEditsType | null>(null);
  const [
    sketchVM,
    setSketchVM, //
  ] = useState<SketchViewModelType | null>(null);
  const [
    aoiSketchVM,
    setAoiSketchVM, //
  ] = useState<__esri.SketchViewModel | null>(null);
  const [userDefinedOptions, setUserDefinedOptions] = useState<
    SampleSelectType[]
  >([]);
  const [userDefinedAttributes, setUserDefinedAttributes] =
    useState<UserDefinedAttributes>({ editCount: 0, sampleTypes: {} });
  const [sampleAttributes, setSampleAttributes] = useState<any[]>([]);
  const [allSampleOptions, setAllSampleOptions] = useState<SampleSelectType[]>(
    [],
  );
  const [displayGeometryType, setDisplayGeometryType] = useState<
    'hybrid' | 'points' | 'polygons'
  >('polygons');
  const [displayDimensions, setDisplayDimensions] = useState<'2d' | '3d'>('2d');
  const [terrain3dUseElevation, setTerrain3dUseElevation] = useState(true);
  const [terrain3dVisible, setTerrain3dVisible] = useState(true);
  const [viewUnderground3d, setViewUnderground3d] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);

  // Update totsLayers variable on the window object. This is a workaround
  // to an issue where the layers state variable is not available within esri
  // event handlers.
  useEffect(() => {
    (window as any).totsLayers = layers;
  }, [layers]);

  // Update totsDefaultSymbols variable on the window object. This is a workaround
  // to an issue where the defaultSymbols state variable is not available within esri
  // event handlers.
  useEffect(() => {
    (window as any).totsDefaultSymbols = defaultSymbols;
  }, [defaultSymbols]);

  // Keep the allSampleOptions array up to date
  useEffect(() => {
    if (sampleTypeContext.status !== 'success') return;

    let allSampleOptions: SampleSelectType[] = [];

    // Add in the standard sample types. Append "(edited)" to the
    // label if the user made changes to one of the standard types.
    sampleTypeContext.data.sampleSelectOptions.forEach((option: any) => {
      allSampleOptions.push({
        value: option.value,
        label: userDefinedAttributes.sampleTypes.hasOwnProperty(option.value)
          ? `${option.value} (edited)`
          : option.label,
        isPredefined: option.isPredefined,
      });
    });

    // Add on any user defined sample types
    allSampleOptions = allSampleOptions.concat(userDefinedOptions);

    // Update totsAllSampleOptions variable on the window object. This is a workaround
    // to an issue where the allSampleOptions state variable is not available within esri
    // event handlers.
    (window as any).totsAllSampleOptions = allSampleOptions;

    setAllSampleOptions(allSampleOptions);
  }, [userDefinedOptions, userDefinedAttributes, sampleTypeContext]);

  useEffect(() => {
    if (allSampleOptions.length === 0 || defaultDeconSelections.length > 0)
      return;
    setDefaultDeconSelections([
      {
        id: 1,
        media: 'Soil',
        deconTech: null,
        pctAoi: 0,
        surfaceArea: 0,
        avgCfu: 0,
        numApplications: 1,
        numConcurrentApplications: 1,
        pctDeconed: 100,
        isHazardous: hazardousOptions[1],
        avgFinalContamination: null,
        aboveDetectionLimit: '',
      },
      {
        id: 2,
        media: 'Streets - Asphalt',
        deconTech: null,
        pctAoi: 0,
        surfaceArea: 0,
        avgCfu: 0,
        numApplications: 1,
        numConcurrentApplications: 1,
        pctDeconed: 100,
        isHazardous: hazardousOptions[1],
        avgFinalContamination: null,
        aboveDetectionLimit: '',
      },
      {
        id: 3,
        media: 'Streets/Sidewalks - Concrete',
        deconTech: null,
        pctAoi: 0,
        surfaceArea: 0,
        avgCfu: 0,
        numApplications: 1,
        numConcurrentApplications: 1,
        pctDeconed: 100,
        isHazardous: hazardousOptions[1],
        avgFinalContamination: null,
        aboveDetectionLimit: '',
      },
      {
        id: 4,
        media: 'Building Exterior Walls',
        deconTech: null,
        pctAoi: 0,
        surfaceArea: 0,
        avgCfu: 0,
        numApplications: 1,
        numConcurrentApplications: 1,
        pctDeconed: 100,
        isHazardous: hazardousOptions[1],
        avgFinalContamination: null,
        aboveDetectionLimit: '',
      },
      {
        id: 5,
        media: 'Building Interior Floors',
        deconTech: null,
        pctAoi: 0,
        surfaceArea: 0,
        avgCfu: 0,
        numApplications: 1,
        numConcurrentApplications: 1,
        pctDeconed: 100,
        isHazardous: hazardousOptions[1],
        avgFinalContamination: null,
        aboveDetectionLimit: '',
      },
      {
        id: 6,
        media: 'Building Interior Walls',
        deconTech: null,
        pctAoi: 0,
        surfaceArea: 0,
        avgCfu: 0,
        numApplications: 1,
        numConcurrentApplications: 1,
        pctDeconed: 100,
        isHazardous: hazardousOptions[1],
        avgFinalContamination: null,
        aboveDetectionLimit: '',
      },
      {
        id: 7,
        media: 'Building Roofs',
        deconTech: null,
        pctAoi: 0,
        surfaceArea: 0,
        avgCfu: 0,
        numApplications: 1,
        numConcurrentApplications: 1,
        pctDeconed: 100,
        isHazardous: hazardousOptions[1],
        avgFinalContamination: null,
        aboveDetectionLimit: '',
      },
    ]);
  }, [allSampleOptions, defaultDeconSelections]);

  // define the context funtion for getting the max record count
  // of the gp server
  const [gpMaxRecordCount, setGpMaxRecordCount] = useState<number | null>(null);
  function getGpMaxRecordCount(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      if (services.status !== 'success')
        reject('Services config file has not been loaded');

      // return the max record count, if we already have it
      if (gpMaxRecordCount) {
        resolve(gpMaxRecordCount);
        return;
      }

      let url = '';
      if (services.data.useProxyForGPServer) url = services.data.proxyUrl;
      url += `${
        services.data.totsGPServer
      }?f=json${getEnvironmentStringParam()}`;

      // get the max record count from the gp server
      fetchCheck(url)
        .then((res: any) => {
          const maxRecordCount = res.maximumRecords;
          setGpMaxRecordCount(maxRecordCount);
          resolve(maxRecordCount);
        })
        .catch((err) => {
          window.logErrorToGa(err);
          reject(err);
        });
    });
  }

  // Updates an individual symbol within the defaultSymbols state variable
  function setDefaultSymbolSingle(type: string, symbol: PolygonSymbol) {
    let newDefaultSymbols: DefaultSymbolsType | null = null;
    newDefaultSymbols = {
      editCount: defaultSymbols.editCount + 1,
      symbols: {
        ...defaultSymbols.symbols,
        [type]: symbol,
      },
    };

    setDefaultSymbols(newDefaultSymbols);

    // update all of the symbols
    updatePolygonSymbol(layers, newDefaultSymbols);
    updatePointSymbol(layers, newDefaultSymbols);
  }

  // Reset default symbols back to the default values
  function resetDefaultSymbols() {
    setDefaultSymbols(initialDefaultSymbols);
  }

  return (
    <SketchContext.Provider
      value={{
        autoZoom,
        setAutoZoom,
        basemapWidget,
        setBasemapWidget,
        defaultSymbols,
        setDefaultSymbols,
        setDefaultSymbolSingle,
        resetDefaultSymbols,
        edits,
        setEdits,
        aoiData,
        setAoiData,
        jsonDownload,
        setJsonDownload,
        defaultDeconSelections,
        setDefaultDeconSelections,
        deconSelections,
        setDeconSelections,
        planSettings,
        setPlanSettings,
        homeWidget,
        setHomeWidget,
        symbolsInitialized,
        setSymbolsInitialized,
        layersInitialized,
        setLayersInitialized,
        layers,
        setLayers,
        portalLayers,
        setPortalLayers,
        referenceLayers,
        setReferenceLayers,
        urlLayers,
        setUrlLayers,
        selectedSampleIds,
        setSelectedSampleIds,
        selectedScenario,
        setSelectedScenario,
        sketchLayer,
        setSketchLayer,
        aoiSketchLayer,
        setAoiSketchLayer,
        map,
        setMap,
        mapView,
        setMapView,
        sceneView,
        setSceneView,
        sceneViewForArea,
        setSceneViewForArea,
        sketchVM,
        setSketchVM,
        aoiSketchVM,
        setAoiSketchVM,
        getGpMaxRecordCount,
        userDefinedOptions,
        setUserDefinedOptions,
        userDefinedAttributes,
        setUserDefinedAttributes,
        sampleAttributes,
        setSampleAttributes,
        allSampleOptions,
        setAllSampleOptions,
        displayGeometryType,
        setDisplayGeometryType,
        displayDimensions,
        setDisplayDimensions,
        terrain3dUseElevation,
        setTerrain3dUseElevation,
        terrain3dVisible,
        setTerrain3dVisible,
        viewUnderground3d,
        setViewUnderground3d,
        resultsOpen,
        setResultsOpen,
      }}
    >
      {children}
    </SketchContext.Provider>
  );
}
