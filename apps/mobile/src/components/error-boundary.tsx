import {logError} from '@whocards/logger'
import type {ReactNode} from 'react'
import {Component} from 'react'
import {Pressable, Text, View} from 'react-native'
import {colors} from '@whocards/tokens'

type Props = {children: ReactNode}
type State = {hasError: boolean}

/**
 * Root error boundary: catches render-time throws so a crash shows a recoverable
 * fallback instead of a blank screen, and routes the error through @whocards/logger
 * (console in dev, PostHog in prod once ticket 0004 lands). The fallback is
 * intentionally plain RN (no NativeWind/Reanimated/expo-image) so it can't itself
 * throw if the failure was in one of those layers.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {hasError: false}

  static getDerivedStateFromError(): State {
    return {hasError: true}
  }

  componentDidCatch(error: unknown, info: {componentStack?: string | null}) {
    logError('[mobile] uncaught render error', error, {componentStack: info.componentStack})
  }

  private reset = () => this.setState({hasError: false})

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.darkest,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 16,
        }}
      >
        <Text style={{color: colors.white, fontSize: 20, fontWeight: '600', textAlign: 'center'}}>
          Something went wrong
        </Text>
        <Text style={{color: colors.gray.dark, fontSize: 15, textAlign: 'center'}}>
          The app hit an unexpected error.
        </Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel="try again"
          hitSlop={8}
          style={{
            backgroundColor: colors.yellow[400],
            borderRadius: 999,
            paddingHorizontal: 28,
            paddingVertical: 14,
          }}
        >
          <Text style={{color: colors.darker, fontSize: 16, fontWeight: '700'}}>Try again</Text>
        </Pressable>
      </View>
    )
  }
}
