/**
 * A JS stand-in for `@expo/ui`, whose SwiftUI / Compose views don't exist under jest. Mapped in
 * jest.config.js for the package and every subpath. A Picker renders each option as a button
 * labelled `${accessibilityLabel}: ${option label}`, which is what its native menu offers.
 */
import {Children, isValidElement} from 'react'
import type {ReactNode} from 'react'
import {Pressable, Text, View} from 'react-native'

type Children = {children?: ReactNode}

export const Host = ({children}: Children) => <>{children}</>
export const RNHostView = Host

type SheetProps = Children & {isPresented: boolean; onDismiss: () => void}

export const BottomSheet = ({isPresented, onDismiss, children}: SheetProps) =>
  isPresented ? (
    <View>
      <Pressable onPress={onDismiss} accessibilityLabel="dismiss" />
      {children}
    </View>
  ) : null

type ItemProps = {label: string; value: string}
type PickerProps = Children & {
  selectedValue: string
  onValueChange: (value: string) => void
  accessibilityLabel?: string
  enabled?: boolean
}

export const Picker = ({
  selectedValue,
  onValueChange,
  accessibilityLabel,
  enabled = true,
  children,
}: PickerProps) => (
  <View>
    {Children.toArray(children).map((child) => {
      if (!isValidElement<ItemProps>(child)) return null
      const {label, value} = child.props
      return (
        <Pressable
          key={value}
          onPress={() => onValueChange(value)}
          disabled={!enabled}
          accessibilityRole="button"
          accessibilityLabel={`${accessibilityLabel}: ${label}`}
          accessibilityState={{selected: value === selectedValue, disabled: !enabled}}
        >
          <Text>{label}</Text>
        </Pressable>
      )
    })}
  </View>
)
Picker.Item = (_props: ItemProps) => null

export const Switch = (_props: {value: boolean; onValueChange: (value: boolean) => void}) => null

type TimeProps = {
  value: Date
  disabled?: boolean
  onValueChange?: (event: unknown, date: Date) => void
}

/** Pressing it picks 07:30. */
export const DateTimePicker = ({value, disabled = false, onValueChange}: TimeProps) => (
  <Pressable
    onPress={() => onValueChange?.({}, new Date(2000, 0, 1, 7, 30))}
    disabled={disabled}
    accessibilityLabel={`Time: ${value.getHours()}:${value.getMinutes()}`}
    accessibilityState={{disabled}}
  />
)

export const preferredColorScheme = (colorScheme: string) => ({colorScheme})
