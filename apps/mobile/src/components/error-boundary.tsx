import {logError} from '@whocards/observability'
import type {ReactNode} from 'react'
import {Component} from 'react'
import {Pressable, Text, View} from 'react-native'
import {colors} from '@whocards/tokens'

import {translate} from '@/lib/i18n'

type Props = {children: ReactNode}
type State = {hasError: boolean}

/**
 * Root error boundary: catches render-time throws so a crash shows a recoverable
 * fallback instead of a blank screen, and routes the error through @whocards/observability
 * (console in dev, PostHog in prod). The fallback is
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
          {translate('error.title')}
        </Text>
        <Text style={{color: colors.gray.dark, fontSize: 15, textAlign: 'center'}}>
          {translate('error.body')}
        </Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel={translate('a11y.tryAgain')}
          hitSlop={8}
          style={{
            backgroundColor: colors.yellow[400],
            borderRadius: 999,
            paddingHorizontal: 28,
            paddingVertical: 14,
          }}
        >
          <Text style={{color: colors.darker, fontSize: 16, fontWeight: '700'}}>
            {translate('error.tryAgain')}
          </Text>
        </Pressable>
      </View>
    )
  }
}
