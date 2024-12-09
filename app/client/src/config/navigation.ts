export const isDecon = () => window.location.pathname === '/decon';

export const samplingPanels: PanelType[] = [
  {
    value: 'addData',
    label: 'Add Data',
    iconClass: 'fas fa-layer-group',
  },
  {
    value: 'locateSamples',
    label: 'Create Plan',
    iconClass: 'fas fa-thumbtack',
  },
  {
    value: 'calculate',
    label: 'Calculate Resources',
    iconClass: 'fas fa-calculator',
  },
  {
    value: 'configureOutput',
    label: 'Configure Output',
    iconClass: 'fas fa-cog',
  },
  {
    value: 'publish',
    label: 'Publish Output',
    iconClass: 'fas fa-upload',
  },
];

export const deconPanels: PanelType[] = [
  {
    value: 'addData',
    label: 'Add Data',
    iconClass: 'fas fa-layer-group',
  },
  {
    value: 'decon',
    label: 'Create Decon Plan',
    iconClass: 'fas fa-thumbtack',
  },
  {
    value: 'calculate',
    label: 'Calculate Resources',
    iconClass: 'fas fa-calculator',
  },
  {
    value: 'configureOutput',
    label: 'Configure Output',
    iconClass: 'fas fa-cog',
  },
  {
    value: 'publish',
    label: 'Publish Output',
    iconClass: 'fas fa-upload',
  },
];

export type PanelValueType =
  | 'addData'
  | 'locateSamples'
  | 'decon'
  | 'calculate'
  | 'configureOutput'
  | 'publish';

export type PanelType = {
  value: PanelValueType;
  label: string;
  iconClass: string;
};
