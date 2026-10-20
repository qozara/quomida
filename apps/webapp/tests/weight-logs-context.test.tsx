/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppProvider, useApp } from '../src/context/AppContext.js';
import { destroyDatabase } from '../src/db/rxdb.js';
import { GoogleOAuthProvider } from '@react-oauth/google';

describe('AppContext Weight Logs & Analytics Integration', () => {
  beforeEach(async () => {
    await destroyDatabase();
  });

  afterEach(async () => {
    await destroyDatabase();
  });

  it('provides weight log operations and analytics modal controls in AppContext', async () => {
    const TestConsumer = () => {
      const {
        weightLogs,
        logWeight,
        deleteWeightLog,
        isAnalyticsOpen,
        setIsAnalyticsOpen,
        isWeightModalOpen,
        setIsWeightModalOpen
      } = useApp();

      return (
        <div>
          <span data-testid="count">{weightLogs.length}</span>
          <span data-testid="analytics-open">{String(isAnalyticsOpen)}</span>
          <span data-testid="weight-modal-open">{String(isWeightModalOpen)}</span>
          <button
            data-testid="btn-log"
            onClick={() => logWeight('2026-10-20', 77.2, 'Test entry')}
          >
            Log Weight
          </button>
          <button
            data-testid="btn-delete"
            onClick={() => deleteWeightLog('2026-10-20')}
          >
            Delete
          </button>
          <button
            data-testid="btn-open-analytics"
            onClick={() => setIsAnalyticsOpen(true)}
          >
            Open Analytics
          </button>
          <button
            data-testid="btn-open-weight-modal"
            onClick={() => setIsWeightModalOpen(true)}
          >
            Open Weight Modal
          </button>
        </div>
      );
    };

    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      </GoogleOAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('count')).toBeDefined();
    });

    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('analytics-open').textContent).toBe('false');
    expect(screen.getByTestId('weight-modal-open').textContent).toBe('false');

    // Toggle modals
    act(() => {
      screen.getByTestId('btn-open-analytics').click();
      screen.getByTestId('btn-open-weight-modal').click();
    });

    expect(screen.getByTestId('analytics-open').textContent).toBe('true');
    expect(screen.getByTestId('weight-modal-open').textContent).toBe('true');

    // Log weight
    await act(async () => {
      screen.getByTestId('btn-log').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1');
    });

    // Delete weight
    await act(async () => {
      screen.getByTestId('btn-delete').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('0');
    });
  });
});
