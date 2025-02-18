/** @jsxImportSource @emotion/react */

import React, {
  Fragment,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { css } from '@emotion/react';
// import {
//   useExpanded,
//   useTable,
//   useSortBy,
//   useResizeColumns,
//   useBlockLayout,
//   useFlexLayout,
//   useFilters,
//   useRowSelect,
//   Row,
//   HeaderGroup,
// } from 'react-table';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  getExpandedRowModel,
  Row,
  Table,
  SortingState,
  CellContext,
} from '@tanstack/react-table';
import {
  useVirtualizer,
  VirtualItem,
  Virtualizer,
} from '@tanstack/react-virtual';
import { VariableSizeList } from 'react-window';
import { useWindowSize } from '@reach/window-size';
// components
import Select from 'components/Select';
import { generateUUID } from 'utils/sketchUtils';

const baseInputStyles = css`
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #fff;
  padding: 5px 7px;
  font-size: inherit;
  border-radius: 3px;
  font-weight: 400;
  outline-width: 0;
  height: 38px;
`;

const checkboxStyles = css`
  align-items: center;
  display: flex;
  height: 100%;

  input {
    ${baseInputStyles}
    height: 24px;
  }
`;

const inputStyles = css`
  ${baseInputStyles}
`;

function generateFilterInput({
  column: { filterValue, setFilter },
}: {
  column: {
    filterValue: any;
    preFilteredRows: any;
    setFilter: any;
  };
}) {
  return (
    <input
      css={inputStyles}
      type="text"
      placeholder="Filter column..."
      value={filterValue ? filterValue : ''}
      onClick={(event) => event.stopPropagation()}
      onChange={
        (event) => setFilter(event.target.value || undefined) // Set undefined to remove the filter entirely
      }
      aria-label="Filter column..."
    />
  );
}

// --- styles ---
const tableStyles = ({
  height,
  hideHeader,
}: {
  height?: number;
  hideHeader: boolean;
}) => css`
  ${height === -1 ? '' : height ? `height: ${height}px;` : 'max-height: 400px;'}
  border: 1px solid rgba(0, 0, 0, 0.1);

  /* These styles are suggested for the table fill all available space in its containing element */
  display: block;

  /* These styles are required for a horizontaly scrollable table overflow */
  overflow: auto;

  table {
    border-spacing: 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
    width: 100%;
    margin: 0;

    thead {
      color: #57585a;
      background-color: #f1f1f1;
      font-size: 0.85em;

      tr {
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      }
    }

    tbody {
      tr {
        border-bottom: 1px solid rgba(0, 0, 0, 0.02);
      }

      tr.rt-striped.-even {
        background-color: rgba(0, 0, 0, 0.03);
      }

      tr.rt-selected {
        background-color: #b4daf5 !important;
      }
    }

    th,
    td {
      margin: 0;
      overflow: hidden;

      /* This is required for the absolutely positioned resizer */
      position: relative;

      :last-child {
        border-right: 0;
      }
    }

    th {
      padding: 5px;
      font-weight: normal;
      border-right: 1px solid rgba(0, 0, 0, 0.05);

      span {
        float: right;
      }
    }

    td {
      padding: 7px 5px;
      border-right: 1px solid rgba(0, 0, 0, 0.02);
      font-size: 0.78em;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .rt-resizer {
      right: 0;
      width: 10px;
      height: 100%;
      position: absolute;
      top: 0;
      z-index: 1;
      cursor: col-resize !important;

      /* prevents from scrolling while dragging on touch devices */
      touch-action: none;

      /* prevents highlighting text while resizing */
      user-select: none;
    }

    .rt-col-title {
      padding: 2px;
    }

    .rt-filter {
      padding-top: 10px;
    }

    ${hideHeader ? 'th { display: none !important; }' : ''}
  }
`;

// --- components ---
type Props = {
  id: string;
  data: Array<any>;
  getColumns: Function;
  idColumn: string;
  striped?: boolean;
  height?: number;
  initialSelectedRowIds?: any;
  onSelectionChange?: Function;
  sortBy?: any;
};

export function ReactTable({
  id,
  data,
  getColumns,
  idColumn,
  striped = false,
  height,
  initialSelectedRowIds,
  onSelectionChange,
  sortBy,
}: Props) {
  console.log('data: ', data);
  const [tableWidth, setTableWidth] = useState(0);
  const columns = useMemo(
    () => getColumns(tableWidth).filter((c) => c.show !== false),
    [tableWidth, getColumns],
  );
  console.log('columns1: ', getColumns(tableWidth));
  console.log('columns2: ', columns);

  const [sorting, setSorting] = React.useState<SortingState>(sortBy || []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    enableRowSelection: true,
  });

  // const measuredTableRef = useCallback((node) => {
  //   if (node) setTableWidth(node.getBoundingClientRect().width);
  //   return node;
  // }, []);

  const measuredTableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!measuredTableRef?.current) return;
    setTableWidth(measuredTableRef.current.getBoundingClientRect().width);
  }, [measuredTableRef]);

  const listRef = useRef(null);
  const sizeMap = useRef({});
  const setSize = useCallback((index, size) => {
    sizeMap.current[index] = size;
    listRef.current?.resetAfterIndex(index);
  }, []);

  const getSize = (index) => sizeMap.current[index] || 50;
  const rows = table.getRowModel().rows;

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(-1, 'center');
    }
  }, [initialSelectedRowIds]);

  function RowVirtualized({ index, setSize }) {
    const row = rows[index];
    const rowRef = useRef(null);
    const selected = row.getIsSelected();
    const isEven = index % 2 === 0;

    useEffect(() => {
      if (rowRef.current) {
        setSize(index, rowRef.current.getBoundingClientRect().height);
      }
    }, [setSize, index]);

    return (
      <tr
        ref={rowRef}
        onClick={() => {
          row.toggleSelected();
          if (onSelectionChange) onSelectionChange(row);
        }}
      >
        {row.getVisibleCells().map((cell) => (
          <td key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div
      id={id}
      ref={measuredTableRef}
      className="ReactTable"
      css={tableStyles({
        height,
        hideHeader: false,
      })}
    >
      <table style={{ display: 'grid' }}>
        <thead
          style={{
            display: 'grid',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} style={{ display: 'flex', width: '100%' }}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  style={{ display: 'flex', width: header.getSize() }}
                >
                  <div
                    {...{
                      className: header.column.getCanSort()
                        ? 'cursor-pointer select-none'
                        : '',
                      onClick: header.column.getToggleSortingHandler(),
                    }}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {{
                      asc: <i className="fas fa-arrow-up" />,
                      desc: <i className="fas fa-arrow-down" />,
                    }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <TableBody table={table} tableContainerRef={measuredTableRef} />
      </table>
    </div>
  );
}

interface TableBodyProps {
  table: Table<any>;
  tableContainerRef: React.RefObject<HTMLDivElement>;
}

function TableBody({ table, tableContainerRef }: TableBodyProps) {
  const { rows } = table.getRowModel();

  // Important: Keep the row virtualizer in the lowest component possible to avoid unnecessary re-renders.
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    estimateSize: () => 33, //estimate row height for accurate scrollbar dragging
    getScrollElement: () => tableContainerRef.current,
    //measure dynamic row height, except in firefox because it measures table border height incorrectly
    measureElement:
      typeof window !== 'undefined' &&
      navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan: 5,
  });

  return (
    <tbody
      style={{
        display: 'grid',
        height: `${rowVirtualizer.getTotalSize()}px`, //tells scrollbar how big the table is
        position: 'relative', //needed for absolute positioning of rows
      }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index] as Row<any>;
        return (
          <TableBodyRow
            key={row.id}
            row={row}
            virtualRow={virtualRow}
            rowVirtualizer={rowVirtualizer}
          />
        );
      })}
    </tbody>
  );
}

interface TableBodyRowProps {
  row: Row<any>;
  virtualRow: VirtualItem;
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>;
}

function TableBodyRow({ row, virtualRow, rowVirtualizer }: TableBodyRowProps) {
  return (
    <tr
      data-index={virtualRow.index} //needed for dynamic row height measurement
      ref={(node) => rowVirtualizer.measureElement(node)} //measure dynamic row height
      key={row.id}
      style={{
        display: 'flex',
        position: 'absolute',
        transform: `translateY(${virtualRow.start}px)`, //this should always be a `style` as it changes on scroll
        width: '100%',
      }}
    >
      {row.getVisibleCells().map((cell) => {
        return (
          <td
            key={cell.id}
            style={{
              display: 'flex',
              width: cell.column.getSize(),
            }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

type EditableProps = {
  id: string;
  data: Array<any>;
  getColumns: Function;
  idColumn: string;
  hideHeader?: boolean;
  striped?: boolean;
  height?: number;
  onDataChange?: Function;
  expandable?: boolean;
};

export function ReactTableEditable({
  id,
  data,
  getColumns,
  idColumn,
  striped = false,
  hideHeader = false,
  height,
  onDataChange,
  expandable = false,
}: EditableProps) {
  const [tableWidth, setTableWidth] = useState(0);
  const columns = useMemo(
    () => getColumns(tableWidth).filter((c) => c.show !== false),
    [tableWidth, getColumns],
  );
  console.log('columns1: ', getColumns(tableWidth));
  console.log('columns2: ', columns);

  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  // const [tableData, setTableData] = useState(data);

  // const updateMyData = (rowIndex, columnId, value) => {
  //   setTableData((prev) =>
  //     prev.map((row, index) =>
  //       index === rowIndex ? { ...row, [columnId]: value } : row,
  //     ),
  //   );
  // };

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: expandable ? getExpandedRowModel() : undefined,
    onExpandedChange: setExpanded,
    // getSubRows: (row) => row.subRows,
    getRowCanExpand: (row) => !!row.original.subRows,
    state: { expanded },
    meta: { updateMyData: onDataChange },
  });

  const measuredTableRef = useCallback((node) => {
    if (node) setTableWidth(node.getBoundingClientRect().width);
  }, []);

  return (
    <div
      id={id}
      ref={measuredTableRef}
      className="ReactTable"
      style={{ height }}
      css={tableStyles({ height, hideHeader })}
    >
      <table>
        {!hideHeader && (
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {expandable && <th />}
                {headerGroup.headers.map((header) => (
                  <th role="columnheader" key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
        )}
        <tbody>
          {table.getRowModel().rows.map((row, i) => {
            console.log('row: ', row);
            return (
              <Fragment key={row.id}>
                <tr
                  className={`${striped ? (i % 2 === 0 ? '-odd' : '-even') : ''}`}
                >
                  {expandable && row.getCanExpand() && (
                    <td>
                      <button onClick={row.getToggleExpandedHandler()}>
                        {row.getIsExpanded() ? '▼' : '▶'}
                      </button>
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
                {expandable && row.getIsExpanded() && (
                  <tr>
                    <td />
                    <td colSpan={columns.length}>
                      <ReactTableEditable
                        id={`${id}-sub-${row.id}`}
                        data={row.original.subRows || []}
                        getColumns={getColumns}
                        idColumn={idColumn}
                        striped={striped}
                        hideHeader={true}
                        onDataChange={onDataChange}
                        expandable={expandable}
                      />
                    </td>
                  </tr>
                )}
                {/* isExpanded: {row.getIsExpanded().toString()}
                subRows: {row.subRows.toString()}
                {row.getIsExpanded() &&
                  row.subRows.map((subRow) => (
                    <tr key={subRow.id} className="sub-row">
                      <td />
                      {subRow.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))} */}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type EditableCellProps = {
  getValue: () => any;
  row: CellContext<any, any>['row'];
  column: CellContext<any, any>['column'];
  table: Table<any>;
};

export function ReactTableEditableCell({
  getValue,
  row,
  column,
  table,
}: EditableCellProps) {
  // State to manage input values
  const [value, setValue] = useState(getValue());

  // Get necessary properties
  const index = row.index;
  const id = column.id;
  const editType = column.columnDef.editType;
  const options = column.columnDef.options;

  const updateMyData = table.options.meta?.updateMyData; // Get update function from table meta

  const onChange = (e) => {
    if (editType === 'checkbox') setValue(e.target.checked);
    else setValue(e.target.value);
  };

  const onBlur = () => {
    updateMyData(index, id, value);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter') {
      updateMyData(index, id, value);
    }
  };

  useEffect(() => {
    setValue(getValue());
  }, [getValue]);

  if (editType === 'checkbox') {
    if (row.original.media?.includes('Exterior')) return null;
    return (
      <div css={checkboxStyles}>
        <input
          type="checkbox"
          checked={value}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      </div>
    );
  }

  if (editType === 'input')
    return (
      <input
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        css={inputStyles}
      />
    );

  if (editType === 'select')
    return (
      <Select
        styles={{
          menuPortal: (base) => ({ ...base, fontSize: '0.78em', zIndex: 9999 }),
        }}
        value={options.find((option) => option.value === value)}
        options={options}
        menuPortalTarget={document.body}
        onChange={(selectedOption) => {
          setValue(selectedOption?.value || '');
          updateMyData(index, id, selectedOption?.value || '');
        }}
        isClearable={true}
      />
    );

  return value;
}
