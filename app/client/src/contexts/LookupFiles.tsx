import {
  AttributeItems,
  DeconAttributeItems,
  SampleSelectType,
} from 'config/sampleAttributes';
import React, { createContext, ReactNode, useContext } from 'react';
// utils
import { fetchCheck } from 'utils/fetchUtils';
// types
import { LayerProps } from 'types/Misc';
// config
import { isDecon } from 'config/navigation';

type State = {
  lookupFiles: LookupFiles;
  setLookupFiles: Function;
  sampleAttributes: SampleAttributes;
  setSampleAttributes: Function;
  sampleTypes: SampleTypes | null;
  setSampleTypes: Function;
};

const LookupFilesContext = createContext<State>({
  lookupFiles: { status: 'idle', data: {} },
  setLookupFiles: () => {},
  sampleAttributes: { status: 'idle', data: {} },
  setSampleAttributes: () => {},
  sampleTypes: null,
  setSampleTypes: () => {},
});

type Props = {
  children: ReactNode;
};

function LookupFilesProvider({ children }: Props) {
  const [lookupFiles, setLookupFiles] = React.useState<LookupFiles>({
    status: 'idle',
    data: {},
  });
  const [sampleAttributes, setSampleAttributes] =
    React.useState<SampleAttributes>({
      status: 'idle',
      data: {},
    });
  const [sampleTypes, setSampleTypes] = React.useState<SampleTypes | null>(
    null,
  );

  return (
    <LookupFilesContext.Provider
      value={{
        lookupFiles,
        setLookupFiles,
        sampleAttributes,
        setSampleAttributes,
        sampleTypes,
        setSampleTypes,
      }}
    >
      {children}
    </LookupFilesContext.Provider>
  );
}

// Custom hook for loading lookup files
let lookupFilesInitialized = false; // global var for ensuring fetch only happens once
function useLookupFiles() {
  const { lookupFiles, setLookupFiles, setSampleTypes } =
    useContext(LookupFilesContext);

  if (!lookupFilesInitialized) {
    lookupFilesInitialized = true;

    const parseNumeric = (value: string) => {
      if (value === undefined || value === null) return value;
      return parseFloat(value);
    };

    const getData = async () => {
      const { VITE_SERVER_URL } = import.meta.env;
      const baseUrl = VITE_SERVER_URL || window.location.origin;
      try {
        const data = (await fetchCheck(
          `${baseUrl}/api/lookupFiles`,
        )) as Content;

        let sampleAttributes: any = {};
        if (isDecon()) {
          sampleAttributes = data.technologyTypes.deconAttributes;
        } else {
          const res = (await fetchCheck(
            data.services.radarDatasets.sampleMetadata,
          )) as RadarContent;
          res.data.forEach((record) => {
            sampleAttributes[record.TYPE] = {
              ...record,
              AA: null,
              ALC: parseNumeric(record.ALC),
              AMC: parseNumeric(record.AMC),
              CONTAMTYPE: null,
              CONTAMUNIT: null,
              CONTAMVAL: null,
              CREATEDDATE: null,
              DECISIONUNIT: null,
              DECISIONUNITSORT: 0,
              DECISIONUNITUUID: null,
              GLOBALID: null,
              LOD_NON: parseNumeric(record.LOD_NON),
              LOD_P: parseNumeric(record.LOD_P),
              MCPS: parseNumeric(record.MCPS),
              Notes: '',
              OBJECTID: -1,
              ORGANIZATION: null,
              PERMANENT_IDENTIFIER: null,
              POINT_STYLE: record.Point_Style,
              SA: parseNumeric(record.SA),
              ShapeType: record.ShapeType.toLowerCase(),
              TCPS: parseNumeric(record.TCPS),
              TTA: parseNumeric(record.TTA),
              TTC: parseNumeric(record.TTC),
              TTPK: parseNumeric(record.TTPK),
              TTPS: parseNumeric(record.TTPS),
              TYPEUUID: record.TYPE,
              UPDATEDDATE: null,
              USERNAME: null,
              WVPS: parseNumeric(record.WVPS),
              WWPS: parseNumeric(record.WWPS),
            };
          });

          data.technologyTypes.sampleAttributes = sampleAttributes;
        }

        const sampleSelectOptions: SampleSelectType[] = [];
        Object.keys(sampleAttributes).forEach((key) => {
          const value = sampleAttributes[key].TYPEUUID;
          const label = sampleAttributes[key].TYPE;
          sampleSelectOptions.push({ value, label, isPredefined: true });
        });
        const newValue = { ...(data.technologyTypes as SampleTypes) };
        newValue['sampleSelectOptions'] = sampleSelectOptions;
        setSampleTypes(newValue);

        setLookupFiles({ status: 'success', data });
      } catch (err) {
        console.error(err);
        window.logErrorToGa(err);
        setLookupFiles({ status: 'failure', data: {} });
      }
    };

    getData();
  }

  return lookupFiles;
}

export { LookupFilesContext, LookupFilesProvider, useLookupFiles };

/*
 * TYPES
 */

type AttributesType = { [key: string]: AttributeItems | DeconAttributeItems };

type Content = {
  defaultGsg: string;
  layerProps: LayerProps;
  notifications: {
    backgroundColor: string;
    color: string;
    message: string;
  };
  services: {
    governmentLands: string;
    gpServerInputMaxRecordCount: number;
    parcel: string;
    proxyUrl: string;
    structures: string;
    suitability: string;
    totsGPServer: string;
    totsTestGPServer: string;
    useProxyForGPServer: boolean;
    radarDatasets: {
      sampleMetadata: string;
    };
    googleAnalyticsMapping: {
      name: string;
      urlLookup: string;
      wildcardUrl: string;
    };
  };
  technologyTypes: SampleTypesS3;
};

type LookupFiles =
  | { status: 'idle'; data: Record<string, never> }
  | { status: 'pending'; data: Record<string, never> }
  | { status: 'success'; data: Content }
  | { status: 'failure'; data: Record<string, never> };

type RadarContent = {
  currentPage: number;
  data: RadarSampleMetadata[];
  perPage: number;
  total: number;
};

type RadarSampleMetadata = {
  ALC: string;
  AMC: string;
  LOD_NON: string;
  LOD_P: string;
  MCPS: string;
  SA: string;
  ShapeType: string;
  Point_Style: string;
  TCPS: string;
  TTA: string;
  TTC: string;
  TTPK: string;
  TTPS: string;
  TYPE: string;
  WVPS: string;
  WWPS: string;
  id: number;
};

type SampleAttributes =
  | { status: 'idle'; data: Record<string, never> }
  | { status: 'pending'; data: Record<string, never> }
  | { status: 'success'; data: AttributesType }
  | { status: 'failure'; data: Record<string, never> };

export type SampleTypes = SampleTypesS3 & {
  sampleSelectOptions: SampleSelectType[];
};

export type DeconBuildingFactorsType = {
  [key: string]: {
    PRIM_OCC: string;
    OCC_Class: string;
    SOC: string;
    Brick: number;
    Concrete: number;
    Steel: number;
    Wood: number;
    Other: number;
  };
};

export type SampleTypesS3 = {
  areaTolerance: number;
  attributesToCheck: string[];
  deconAttributes: { [key: string]: DeconAttributeItems };
  deconBuildingFactors: DeconBuildingFactorsType;
  sampleAttributes: AttributesType;
};
