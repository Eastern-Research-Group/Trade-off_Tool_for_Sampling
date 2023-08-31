export type CalculateResultsDataType = {
  'Total Number of User-Defined Decon Technologies': number;
  'Total Number of Decon Applications': number;
  'Total Cost': number;
  'Total Time': number;
  'Limiting Time Factor': 'Decon' | 'Analysis' | '';
  'Total Sampled Area': number;
  'User Specified Total AOI': number | null;
  'Percent of Area Sampled': number | null;
  'User Specified Number of Available Teams for Decon': number;
  'User Specified Personnel per Decon Team': number;
  'User Specified Decon Team Hours per Shift': number;
  'User Specified Decon Team Shifts per Day': number;
  'User Specified Surface Area': number;
  'Total Required Decon Time': number;
  'Decon Hours per Day': number;
  'Decon Personnel hours per Day': number;
  'User Specified Decon Team Labor Cost': number;
  'Time to Prepare Kits': number;
  'Time to Collect': number;
  'Decon Technology Material Cost': number;
  'Decon Personnel Labor Cost': number;
  'Total Decon Cost': number;
  'Time to Complete Decon': number;
  'Total Decon Labor Cost': number;
  'User Specified Number of Available Labs for Analysis': number;
  'User Specified Analysis Lab Hours per Day': number;
  'Time to Complete Analyses': number;
  'Time to Analyze': number;
  'Analysis Labor Cost': number;
  'Analysis Material Cost': number;
  'Total Analysis Cost': number;
  'Waste Volume': number;
  'Waste Weight': number;
};

export type CalculateResultsType = {
  status:
    | 'none'
    | 'no-graphics'
    | 'no-layer'
    | 'no-scenario'
    | 'fetching'
    | 'success'
    | 'failure';
  panelOpen: boolean;
  data: CalculateResultsDataType | null;
};
