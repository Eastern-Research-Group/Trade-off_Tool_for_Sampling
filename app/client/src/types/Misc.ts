export type ErrorType = {
  error: any;
  message: string;
};

export type LookupFile = {
  status: 'fetching' | 'success' | 'failure';
  data: any;
};

export type SearchResultsType = {
  status: 'none' | 'fetching' | 'success' | 'failure' | 'not-logged-in';
  error?: ErrorType;
  data: __esri.PortalQueryResult | null;
};
