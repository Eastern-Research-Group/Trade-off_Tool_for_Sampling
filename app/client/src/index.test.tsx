import React from 'react';
import { createRoot } from 'react-dom/client';
// components
import Root from 'index';

it('renders without crashing', () => {
  const rootElement = document.createElement('div');
  createRoot(rootElement).render(<Root />);
});
