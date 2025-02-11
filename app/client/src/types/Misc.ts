export type ErrorType = {
  error: any;
  message: string;
};

export type LayerProps = {
  defaultFields: __esri.FieldProperties[];
  additionalTableFields: __esri.FieldProperties[];
  defaultReferenceTableFields: __esri.FieldProperties[];
  defaultCalculateSettingsTableFields: __esri.FieldProperties[];
  defaultCalculateResultsTableFields: __esri.FieldProperties[];
  defaultLayerProps: __esri.FeatureLayerProperties;
  defaultTableProps: any;
  webMapFieldProps: any;
};

export type LookupFile = {
  status: 'fetching' | 'success' | 'failure';
  data: any;
};
