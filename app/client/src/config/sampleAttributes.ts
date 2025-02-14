export type PolygonSymbol = {
  type: 'simple-fill';
  color: number[];
  outline: {
    color: number[];
    width: number;
  };
};

export type DefaultSymbolsType = {
  symbols: { [key: string]: PolygonSymbol };
  editCount: number;
};

export type SelectedSampleType = {
  PERMANENT_IDENTIFIER: string;
  DECISIONUNITUUID: string;
  selection_method: 'row-click' | 'sample-click';
  graphic: __esri.Graphic;
};

export type AttributeItems = {
  OBJECTID: number | string | null;
  PERMANENT_IDENTIFIER: string | null;
  GLOBALID: string | null;
  TYPEUUID: string;
  TYPE: string;
  ShapeType: string;
  POINT_STYLE: string;
  SA: number | null;
  AA: number | null;
  TTPK: number | null;
  TTC: number | null;
  TTA: number | null;
  TTPS: number | null;
  LOD_P: number | null;
  LOD_NON: number | null;
  MCPS: number | null;
  TCPS: number | null;
  WVPS: number | null;
  WWPS: number | null;
  ALC: number | null;
  AMC: number | null;
  Notes: string | null;
  CONTAMTYPE: string | null;
  CONTAMVAL: number | null;
  CONTAMUNIT: string | null;
  CREATEDDATE: string | null;
  UPDATEDDATE: null;
  USERNAME: string | null;
  ORGANIZATION: string | null;
  DECISIONUNITUUID: string | null;
  DECISIONUNIT: string | null;
  DECISIONUNITSORT: number;
};

export type Attributes = {
  [key: string]: {
    status: 'add' | 'edit' | 'delete' | 'published' | 'published-ago';
    serviceId: string;
    attributes: AttributeItems;
  };
};

export type UserDefinedConfig = {
  [key: string]: {
    attributes: AttributeItems;
    symbol: PolygonSymbol;
  };
};

export type UserDefinedAttributes = {
  editCount: number;
  sampleTypes: Attributes;
};

export type SampleIssues = {
  areaOutOfTolerance: boolean;
  attributeMismatch: boolean;
  attributesWithMismatch: string[];
  difference: number;
  graphic: __esri.Graphic | null;
};

export type SampleIssuesOutput = {
  areaOutOfTolerance: boolean;
  attributeMismatch: boolean;
  samplesWithIssues: SampleIssues[];
};

export type SampleSelectType = {
  value: string;
  label: string;
  isPredefined: boolean;
};
