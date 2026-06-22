/**
 * Component test for src/components/error-boundary.tsx
 *
 * Verifies that a render-time throw from a child is caught, the fallback UI
 * is shown, and `logError` from @whocards/observability is called with the error.
 * Also verifies that pressing "Try again" resets the error state.
 */

jest.mock('@whocards/observability', () => ({
  logError: jest.fn(),
}))

// Tokens is pure TS/JS — no native modules needed.
// No mock needed; it should import fine.

import React from 'react'
import {render, fireEvent} from '@testing-library/react-native'
import {logError} from '@whocards/observability'
import {ErrorBoundary} from '../components/error-boundary'

// Silence the React console.error output for expected errors in these tests.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
  ;(logError as jest.Mock).mockClear()
})

// A child that unconditionally throws during render.
const ThrowingChild = () => {
  throw new Error('boom')
}

// A stable child that renders fine.
const StableChild = () => <React.Fragment />

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    const {queryByText} = render(
      <ErrorBoundary>
        <StableChild />
      </ErrorBoundary>
    )
    expect(queryByText('Something went wrong')).toBeNull()
  })

  it('shows the fallback when a child throws', () => {
    const {getByText} = render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(getByText('Something went wrong')).toBeTruthy()
    expect(getByText('Try again')).toBeTruthy()
  })

  it('calls logError with the thrown error', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(logError).toHaveBeenCalledWith(
      '[mobile] uncaught render error',
      expect.any(Error),
      expect.objectContaining({componentStack: expect.anything()})
    )
  })

  it('resets to rendering children when "Try again" is pressed', () => {
    // Use a stateful wrapper so we can swap the child after reset.
    let shouldThrow = true
    const ConditionalChild = () => {
      if (shouldThrow) throw new Error('transient error')
      return <StableChild />
    }

    const {getByText, queryByText, rerender} = render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    )

    // Fallback is visible.
    expect(getByText('Try again')).toBeTruthy()

    // Stop throwing, then press reset.
    shouldThrow = false
    fireEvent.press(getByText('Try again'))

    // Re-render after reset — the fallback is gone.
    rerender(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    )
    expect(queryByText('Something went wrong')).toBeNull()
  })
})
