import { JsonDownloadType } from 'contexts/Sketch';

export type CalculateResultsDataType = {
  'Total Number of User-Defined Decon Technologies': number;
  'User Specified Number of Concurrent Applications': number;
  'Total Number of Decon Applications': number;
  'Total Cost': number;
  'Total Time': number;
  // 'Limiting Time Factor': 'Decon' | 'Analysis' | '';
  'Total Decontamination Area': number;
  // 'User Specified Total AOI': number | null;
  // 'Percent of Area Sampled': number | null;
  // 'User Specified Number of Available Teams for Decon': number;
  // 'User Specified Personnel per Decon Team': number;
  // 'User Specified Decon Team Hours per Shift': number;
  // 'User Specified Decon Team Shifts per Day': number;
  // 'User Specified Surface Area': number;
  // 'Total Required Decon Time': number;
  // 'Decon Hours per Day': number;
  // 'Decon Personnel hours per Day': number;
  // 'User Specified Decon Team Labor Cost': number;
  'Total Setup Time': number;
  'Total Application Time': number;
  'Total Setup Cost': number;
  'Total Application Cost': number;
  // 'Decon Personnel Labor Cost': number;
  // 'Total Decon Cost': number;
  // 'Time to Complete Decon': number;
  // 'Total Decon Labor Cost': number;
  // 'User Specified Number of Available Labs for Analysis': number;
  // 'User Specified Analysis Lab Hours per Day': number;
  // 'Time to Complete Analyses': number;
  'Total Residence Time': number;
  'Average Contamination Removal': number;
  'Solid Waste Volume': number;
  'Solid Waste Mass': number;
  'Liquid Waste Volume': number;
  'Liquid Waste Mass': number;
  'Total Waste Volume': number;
  'Total Waste Mass': number;
  // 'Total Analysis Cost': number;
  'Total Contaminated Area': number;
  'Total Decontaminated Area': number;
  'Total Reduction Area': number;
  'Total Remaining Contaminated Area': number;
  'Percent Contaminated Remaining': number;
  'Contamination Type': string;
  resultsTable: JsonDownloadType[];
};

export type CalculateResultsTotsDataType = {
  'Total Number of User-Defined Samples': number;
  'Total Number of Samples': number;
  'Total Cost': number;
  'Total Time': number;
  'Limiting Time Factor': 'Sampling' | 'Analysis' | '';
  'Total Sampled Area': number;
  'User Specified Total AOI': number | null;
  'Percent of Area Sampled': number | null;
  'User Specified Number of Available Teams for Sampling': number;
  'User Specified Personnel per Sampling Team': number;
  'User Specified Sampling Team Hours per Shift': number;
  'User Specified Sampling Team Shifts per Day': number;
  'User Specified Surface Area': number;
  'Total Required Sampling Time': number;
  'Sampling Hours per Day': number;
  'Sampling Personnel hours per Day': number;
  'User Specified Sampling Team Labor Cost': number;
  'Time to Prepare Kits': number;
  'Time to Collect': number;
  'Sampling Material Cost': number;
  'Sampling Personnel Labor Cost': number;
  'Total Sampling Cost': number;
  'Time to Complete Sampling': number;
  'Total Sampling Labor Cost': number;
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

export type CalculateResultsTotsBaseType = {
  status:
    | 'none'
    | 'no-contamination-graphics'
    | 'no-graphics'
    | 'no-layer'
    | 'no-map'
    | 'no-scenario'
    | 'fetching'
    | 'success'
    | 'failure';
  data: CalculateResultsTotsDataType | null;
};

export interface CalculateResultsTotsType extends CalculateResultsTotsBaseType {
  panelOpen: boolean;
}

export type CalculateResultsType = {
  status:
    | 'none'
    | 'no-contamination-graphics'
    | 'no-graphics'
    | 'no-layer'
    | 'no-map'
    | 'no-scenario'
    | 'fetching'
    | 'success'
    | 'failure';
  panelOpen: boolean;
  data: CalculateResultsDataType | null;
};
