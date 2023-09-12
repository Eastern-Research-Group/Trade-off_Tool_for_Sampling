/** @jsxImportSource @emotion/react */

import React, { ReactNode, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import { colors } from 'styles';

// --- styles (AccordionList) ---
const accordionListContainer = (isResults: boolean) => css`
  border-bottom: solid ${isResults ? `3px ${colors.darkaqua()}` : '1px #d8dfe2'};
`;

// --- components (AccordionList) ---
type AccordionListProps = {
  isResults?: boolean;
  children: ReactNode;
};

function AccordionList({ isResults = false, children }: AccordionListProps) {
  return <div css={accordionListContainer(isResults)}>{children}</div>;
}

// --- styles (AccordionItem) ---
const accordionItemContainer = (isResults: boolean) => css`
  border-top: solid ${isResults ? `3px ${colors.darkaqua()}` : '1px #d8dfe2'};
`;

const headerStyles = (isResults: boolean) => css`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  justify-content: space-between;
  padding: 0.75em 0.875em;
  cursor: pointer;
  ${isResults ? 'background-color: transparent;' : ''}

  &:hover,
  &:focus {
    background-color: ${isResults ? colors.darkblue() : '#f0f6f9'};
  }

  .fa-angle-down {
    margin-right: 0.75em;
  }

  .fa-angle-right {
    margin-right: 0.875em;
  }
`;

const textStyles = css`
  flex: 1;
  padding-bottom: 0;
  word-break: break-word;
`;

const arrow = css`
  font-size: 1.25em;
  color: #526571;
`;

// --- components (AccordionItem) ---
type AccordionItemProps = {
  title: ReactNode;
  initiallyExpanded?: boolean;
  isOpenParam?: boolean;
  isResults?: boolean;
  onChange?: (isOpen: boolean) => void;
  children: ReactNode;
};

function AccordionItem({
  title,
  initiallyExpanded = false,
  isOpenParam,
  isResults = false,
  onChange = () => {},
  children,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(initiallyExpanded);

  useEffect(() => {
    if (isOpenParam === undefined || isOpen === isOpenParam) return;

    setIsOpen(isOpenParam);
  }, [isOpen, isOpenParam]);

  return (
    <div css={accordionItemContainer(isResults)}>
      <header
        tabIndex={0}
        css={headerStyles(isResults)}
        onClick={(ev) => {
          const newIsOpen = !isOpen;
          setIsOpen(newIsOpen);
          onChange(newIsOpen);
        }}
        onKeyUp={(ev) => {
          if (ev.key === 'Enter') {
            const newIsOpen = !isOpen;
            setIsOpen(newIsOpen);
            onChange(newIsOpen);
          }
        }}
      >
        <i css={arrow} className={`fa fa-angle-${isOpen ? 'down' : 'right'}`} />
        <span css={textStyles}>{title}</span>
      </header>

      {isOpen && children}
    </div>
  );
}

export { AccordionList, AccordionItem };
