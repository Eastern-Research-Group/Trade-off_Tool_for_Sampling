/** @jsxImportSource @emotion/react */

import React, { ReactNode, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import IconAngleDown from '~icons/fa7-solid/angle-down';
import IconAngleRight from '~icons/fa7-solid/angle-right';

// --- styles (AccordionList) ---
const accordionListContainer = css`
  border-bottom: 1px solid #d8dfe2;
`;

// --- components (AccordionList) ---
type AccordionListProps = {
  children: ReactNode;
};

function AccordionList({ children }: AccordionListProps) {
  return <div css={accordionListContainer}>{children}</div>;
}

// --- styles (AccordionItem) ---
const accordionItemContainer = css`
  border-top: 1px solid #d8dfe2;
`;

const headerStyles = css`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  justify-content: space-between;
  padding: 0.75em 0.875em;
  cursor: pointer;

  &:hover,
  &:focus {
    background-color: #f0f6f9;
  }
`;

const textStyles = css`
  flex: 1;
  padding-bottom: 0;
  word-break: break-word;
`;

const arrow = css`
  color: #526571;
  font-size: 1.25em;
  margin-right: 0.625em;
`;

// --- components (AccordionItem) ---
type AccordionItemProps = {
  title: ReactNode;
  initiallyExpanded?: boolean;
  isOpenParam?: boolean;
  onChange?: (isOpen: boolean) => void;
  children: ReactNode;
};

function AccordionItem({
  title,
  initiallyExpanded = false,
  isOpenParam,
  onChange = () => {},
  children,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(initiallyExpanded);

  useEffect(() => {
    if (isOpenParam === undefined || isOpen === isOpenParam) return;

    setIsOpen(isOpenParam);
  }, [isOpen, isOpenParam]);

  return (
    <div css={accordionItemContainer}>
      <header
        tabIndex={0}
        css={headerStyles}
        onClick={(_ev) => {
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
        {isOpen ? (
          <IconAngleDown css={arrow} aria-hidden="true" />
        ) : (
          <IconAngleRight css={arrow} aria-hidden="true" />
        )}
        <span css={textStyles}>{title}</span>
      </header>

      {isOpen && children}
    </div>
  );
}

export { AccordionList, AccordionItem };
