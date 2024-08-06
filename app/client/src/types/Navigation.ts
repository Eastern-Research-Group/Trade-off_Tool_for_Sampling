// types
import { LayerTypeName } from 'types/Layer';

export type AppType = 'decon' | 'sampling';

type Options = {
  from?: 'file';
  layerType?: LayerTypeName;
  continuePublish?: boolean;
  continueSamplesPublish?: boolean;
};

export type GoToOptions = null | Options;
