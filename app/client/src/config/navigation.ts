import IconCalculator from '~icons/fa7-solid/calculator';
import IconCog from '~icons/fa7-solid/cog';
import IconLayerGroup from '~icons/fa7-solid/layer-group';
import IconThumbtack from '~icons/fa7-solid/thumbtack';
import IconUpload from '~icons/fa7-solid/upload';
import IconWrench from '~icons/fa7-solid/wrench';
// types
import { LayerTypeOption } from 'types/Navigation';

export const isAdmin = () => window.location.pathname === '/admin';
export const isDecon = () => window.location.pathname === '/decon';

export const samplingPanels: PanelType[] = [
  {
    value: 'addData',
    label: 'Add Data',
    Icon: IconLayerGroup,
  },
  {
    value: 'additionalTools',
    label: 'Additional Tools',
    Icon: IconWrench,
  },
  {
    value: 'locateSamples',
    label: 'Create Plan',
    Icon: IconThumbtack,
  },
  {
    value: 'calculate',
    label: 'Calculate Resources',
    Icon: IconCalculator,
  },
  {
    value: 'configureOutput',
    label: 'Configure Output',
    Icon: IconCog,
  },
  {
    value: 'publish',
    label: 'Publish Output',
    Icon: IconUpload,
  },
];

export const deconPanels: PanelType[] = [
  {
    value: 'addData',
    label: 'Add Data',
    Icon: IconLayerGroup,
  },
  {
    value: 'additionalTools',
    label: 'Additional Tools',
    Icon: IconWrench,
  },
  {
    value: 'decon',
    label: 'Create Decon Plan',
    Icon: IconThumbtack,
  },
  {
    value: 'calculate',
    label: 'Calculate Resources',
    Icon: IconCalculator,
  },
  {
    value: 'configureOutput',
    label: 'Configure Output',
    Icon: IconCog,
  },
  {
    value: 'publish',
    label: 'Publish Output',
    Icon: IconUpload,
  },
];

export const adminPanels: PanelType[] = [
  {
    value: 'addData',
    label: 'Add Data',
    Icon: IconLayerGroup,
  },
  {
    value: 'additionalTools',
    label: 'Contam Map',
    Icon: IconWrench,
  },
  {
    value: 'configureOutput',
    label: 'Configure Output',
    Icon: IconCog,
  },
  {
    value: 'publish',
    label: 'Publish Output',
    Icon: IconUpload,
  },
];

const layerTypeOptionsSampling: LayerTypeOption[] = [
  {
    label: 'TOTS Sampling Plans',
    type: 'category',
    value: 'contains-epa-tots-sample-layer',
  },
  {
    label: 'TOTS Custom Sample Types',
    type: 'category',
    value: 'contains-epa-tots-user-defined-sample-types',
  },
  {
    label: 'TOTS/TODS AOI Characterizations',
    type: 'category',
    value: 'contains-epa-tots-aoi-characterization',
  },
  {
    label: 'TOTS/TODS Staging Areas',
    type: 'category',
    value: 'contains-epa-tots-staging-area',
  },
  {
    label: 'TODS Decon Plans',
    type: 'category',
    value: 'contains-epa-tods-decon-layer',
  },
];

const layerTypeOptionsDecon: LayerTypeOption[] = [
  {
    label: 'TODS Decon Plans',
    type: 'category',
    value: 'contains-epa-tods-decon-layer',
  },
  {
    label: 'TOTS/TODS AOI Characterizations',
    type: 'category',
    value: 'contains-epa-tots-aoi-characterization',
  },
  {
    label: 'TOTS/TODS Staging Areas',
    type: 'category',
    value: 'contains-epa-tots-staging-area',
  },
  // {
  //   label: 'TODS Custom Decon Technologies',
  //   type: 'category',
  //   value: 'contains-epa-tods-user-defined-decon-tech',
  // },
  {
    label: 'TOTS Sampling Plans',
    type: 'category',
    value: 'contains-epa-tots-sample-layer',
  },
];

const layerTypeOptionsBase: LayerTypeOption[] = [
  { label: 'Feature Service', value: 'Feature Service' },
  { label: 'Image Service', value: 'Image Service' },
  { label: 'KML', value: 'KML' },
  { label: 'Map Service', value: 'Map Service' },
  { label: 'Scene Service (3D)', value: 'Scene Service' },
  {
    label: 'Vector Tile Service',
    value: 'Vector Tile Service',
  },
  { label: 'WMS', value: 'WMS' },
];

export const layerTypeOptions = [
  ...(isDecon() ? layerTypeOptionsDecon : layerTypeOptionsSampling),
  ...layerTypeOptionsBase,
];

export type PanelValueType =
  | 'addData'
  | 'additionalTools'
  | 'locateSamples'
  | 'decon'
  | 'calculate'
  | 'configureOutput'
  | 'publish';

export type PanelType = {
  value: PanelValueType;
  label: string;
  Icon: typeof IconCalculator;
};
