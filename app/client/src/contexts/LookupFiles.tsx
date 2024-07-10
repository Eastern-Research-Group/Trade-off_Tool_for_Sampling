// @flow

import { AttributeItems, SampleSelectType } from 'config/sampleAttributes';
import React, { createContext, ReactNode, useContext } from 'react';
// utils
import { fetchCheck } from 'utils/fetchUtils';
// types
import { LayerProps } from 'types/Misc';

type State = {
  lookupFiles: LookupFiles;
  setLookupFiles: Function;
  sampleTypes: SampleTypes | null;
  setSampleTypes: Function;
};

const LookupFilesContext = createContext<State>({
  lookupFiles: { status: 'idle', data: {} },
  setLookupFiles: () => {},
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
  const [sampleTypes, setSampleTypes] = React.useState<SampleTypes | null>(
    null,
  );

  return (
    <LookupFilesContext.Provider
      value={{
        lookupFiles,
        setLookupFiles,
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

    const { REACT_APP_SERVER_URL } = process.env;
    const baseUrl = REACT_APP_SERVER_URL || window.location.origin;
    fetchCheck(`${baseUrl}/api/lookupFiles`)
      .then((res) => {
        const data = res as Content;
        const sampleSelectOptions: SampleSelectType[] = [];
        const sampleAttributes = data.sampleTypes.sampleAttributes;
        Object.keys(sampleAttributes).forEach((key: any) => {
          const value = sampleAttributes[key].TYPEUUID;
          const label = sampleAttributes[key].TYPE;
          sampleSelectOptions.push({ value, label, isPredefined: true });
        });
        const newValue = { ...(data.sampleTypes as SampleTypes) };
        newValue['sampleSelectOptions'] = sampleSelectOptions;
        setSampleTypes(newValue);

        setLookupFiles({ status: 'success', data });
      })
      .catch((err) => {
        console.error(err);
        window.logErrorToGa(err);
        setLookupFiles({ status: 'failure', data: {} });
      });
  }

  return lookupFiles;
}

export { LookupFilesContext, LookupFilesProvider, useLookupFiles };

/*
 * TYPES
 */

type Content = {
  layerProps: LayerProps;
  notifications: {
    backgroundColor: string;
    color: string;
    message: string;
  };
  sampleTypes: SampleTypesS3;
  services: {
    gpServerInputMaxRecordCount: number;
    proxyUrl: string;
    totsGPServer: string;
    useProxyForGPServer: boolean;
    googleAnalyticsMapping: {
      name: string;
      urlLookup: string;
      wildcardUrl: string;
    };
  };
};

type LookupFiles =
  | { status: 'idle'; data: Record<string, never> }
  | { status: 'pending'; data: Record<string, never> }
  | { status: 'success'; data: Content }
  | { status: 'failure'; data: Record<string, never> };

type SampleTypesS3 = {
  areaTolerance: number;
  attributesToCheck: string[];
  sampleAttributes: { [key: string]: AttributeItems };
};

export type SampleTypes = SampleTypesS3 & {
  sampleSelectOptions: SampleSelectType[];
};
