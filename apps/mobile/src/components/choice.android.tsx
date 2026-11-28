import {Ionicons} from '@expo/vector-icons'
import {
  AlertDialog,
  Column,
  Host,
  RadioButton,
  Row,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose'
import {
  fillMaxWidth,
  padding,
  selectable,
  selectableGroup,
  verticalScroll,
} from '@expo/ui/jetpack-compose/modifiers'
import {useState} from 'react'
import {Pressable, Text} from 'react-native'
import {colors} from '@whocards/tokens'

import type {ChoiceProps} from './choice'

/**
 * Android's take on Choice: the row shows the value, and a tap opens Material's single-choice
 * dialog, as the system Settings app does. The list scrolls, so it holds however many languages ship.
 */
export const Choice = <T extends string>({
  label,
  options,
  current,
  onSelect,
  enabled = true,
  isDark,
}: ChoiceProps<T>) => {
  const [open, setOpen] = useState(false)
  const value = options.find((option) => option.value === current)?.label ?? ''

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityState={{disabled: !enabled}}
        hitSlop={12}
        className={`flex-row items-center gap-1.5 ${enabled ? '' : 'opacity-40'}`}
      >
        <Text className="text-darker dark:text-white font-sans text-lg">{value}</Text>
        <Ionicons
          name="caret-down"
          size={12}
          color={isDark ? colors.gray.dark : colors.mutedOnLight}
        />
      </Pressable>
      {open ? (
        <Host
          colorScheme={isDark ? 'dark' : 'light'}
          seedColor={isDark ? colors.accentOnDark : colors.accentOnLight}
          style={{position: 'absolute'}}
        >
          <AlertDialog onDismissRequest={() => setOpen(false)}>
            <AlertDialog.Title>
              <ComposeText>{label}</ComposeText>
            </AlertDialog.Title>
            <AlertDialog.Text>
              <Column modifiers={[verticalScroll(), selectableGroup()]}>
                {options.map((option) => {
                  const selected = option.value === current
                  const pick = () => {
                    setOpen(false)
                    onSelect(option.value)
                  }
                  return (
                    <Row
                      key={option.value}
                      verticalAlignment="center"
                      horizontalArrangement={{spacedBy: 16}}
                      modifiers={[
                        fillMaxWidth(),
                        selectable(selected, pick, 'radioButton'),
                        padding(0, 12, 0, 12),
                      ]}
                    >
                      <RadioButton selected={selected} />
                      <ComposeText style={{typography: 'bodyLarge'}}>{option.label}</ComposeText>
                    </Row>
                  )
                })}
              </Column>
            </AlertDialog.Text>
          </AlertDialog>
        </Host>
      ) : null}
    </>
  )
}
