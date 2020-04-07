export const defaultLayerProps = {
  type: 'Feature Layer',
  editFieldsInfo: {
    creationDateField: 'CreationDate',
    creatorField: 'Creator',
    editDateField: 'EditDate',
    editorField: 'Editor',
  },
  editingInfo: {
    lastEditDate: 1455126059440,
  },
  geometryType: 'esriGeometryPolygon',
  extent: {
    xmin: -13090714.767112788,
    ymin: 3841739.0914657288,
    xmax: -12922032.654624918,
    ymax: 3962581.2727843975,
    spatialReference: {
      wkid: 3857,
    },
  },
  allowGeometryUpdates: true,
  hasAttachments: false,
  htmlPopupType: 'esriServerHTMLPopupTypeNone',
  hasM: false,
  hasZ: false,
  objectIdField: 'OBJECTID',
  globalIdField: 'GlobalID',
  fields: [
    {
      name: 'OBJECTID',
      type: 'esriFieldTypeOID',
      actualType: 'int',
      alias: 'OBJECTID',
      sqlType: 'sqlTypeInteger',
      length: 4,
      nullable: false,
      editable: false,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'PERMANENT_IDENTIFIER',
      type: 'esriFieldTypeGUID',
      alias: 'PERMANENT_IDENTIFIER',
      sqlType: 'sqlTypeOther',
      length: 38,
      nullable: false,
      editable: true,
      domain: null,
      defaultValue: 'NEWID() WITH VALUES',
    },
    {
      name: 'GlobalID',
      type: 'esriFieldTypeGlobalID',
      alias: 'GlobalID',
      sqlType: 'sqlTypeOther',
      length: 38,
      nullable: false,
      editable: false,
      domain: null,
      defaultValue: 'NEWID() WITH VALUES',
    },
    {
      name: 'TYPE',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'TYPE',
      sqlType: 'sqlTypeNVarchar',
      length: 25,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'SA',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'SA',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'TTPK',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'TTPK',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'TTC',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'TTC',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'TTA',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'TTA',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'TTPS',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'TTPS',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'LOD_P',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'LOD_P',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'LOD_NON',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'LOD_NON',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'MCPS',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'MCPS',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'TCPS',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'TCPS',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'WVPS',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'WVPS',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'WWPS',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'WWPS',
      sqlType: 'sqlTypeNVarchar',
      length: 8,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'Notes',
      type: 'esriFieldTypeString',
      actualType: 'nvarchar',
      alias: 'Notes',
      sqlType: 'sqlTypeNVarchar',
      length: 255,
      nullable: true,
      editable: true,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'CreationDate',
      type: 'esriFieldTypeDate',
      alias: 'CreationDate',
      sqlType: 'sqlTypeOther',
      length: 8,
      nullable: true,
      editable: false,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'Creator',
      type: 'esriFieldTypeString',
      alias: 'Creator',
      sqlType: 'sqlTypeOther',
      length: 50,
      nullable: true,
      editable: false,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'EditDate',
      type: 'esriFieldTypeDate',
      alias: 'EditDate',
      sqlType: 'sqlTypeOther',
      length: 8,
      nullable: true,
      editable: false,
      domain: null,
      defaultValue: null,
    },
    {
      name: 'Editor',
      type: 'esriFieldTypeString',
      alias: 'Editor',
      sqlType: 'sqlTypeOther',
      length: 50,
      nullable: true,
      editable: false,
      domain: null,
      defaultValue: null,
    },
  ],
  supportedQueryFormats: 'JSON',
  hasStaticData: false,
  maxRecordCount: 1000,
  standardMaxRecordCount: 4000,
  tileMaxRecordCount: 4000,
  maxRecordCountFactor: 1,
  capabilities: 'Create,Delete,Query,Update,Editing,Extract,Sync',
  exceedsLimitFactor: 1,
};
